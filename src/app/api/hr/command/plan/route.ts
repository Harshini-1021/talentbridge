import { NextResponse } from "next/server";
import { getViewer } from "@/lib/auth";
import { AiUnavailableError, aiConfigured, generateJson } from "@/lib/ai/provider";
import { CommandPlanSchema } from "@/lib/ai/schemas";
import { commandPlanPrompt } from "@/lib/ai/prompts";
import { CommandTextSchema, parseBody } from "@/lib/validation";
import {
  getAllEmployeeSkills,
  getAllRoles,
  getNominations,
  getProfiles,
  groupSkillsByEmployee,
  toRequiredSkills,
} from "@/lib/data";
import { rankCandidates, READINESS_LABEL } from "@/lib/scoring";

/**
 * F3b, step one of two — plan an action from a natural-language instruction.
 *
 * This route writes nothing. The model is allowed to interpret intent and name
 * people and roles in prose; it is never given ids, never given SQL, and never
 * given a write path. Names are resolved here, under the caller's own RLS, and
 * the resulting change is returned as a before/after diff for a human to
 * approve. The actual write happens in ../execute, only after that approval.
 *
 * This split is the point: an LLM that proposes a reviewable change is
 * defensible in a way that an LLM holding a database connection is not.
 */
export const maxDuration = 60;

function resolveByName<T>(
  candidates: T[],
  name: string,
  nameOf: (item: T) => string,
): T | null {
  const needle = name.trim().toLowerCase();
  const exact = candidates.find((item) => nameOf(item).toLowerCase() === needle);
  if (exact) return exact;
  const partial = candidates.filter(
    (item) =>
      nameOf(item).toLowerCase().includes(needle) ||
      needle.includes(nameOf(item).toLowerCase()),
  );
  return partial.length === 1 ? partial[0] : null;
}

export async function POST(request: Request) {
  const viewer = await getViewer();
  if (!viewer) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }
  if (!viewer.isHr) {
    return NextResponse.json(
      { error: "The command bar is available to HR administrators." },
      { status: 403 },
    );
  }
  if (!aiConfigured()) {
    return NextResponse.json(
      { error: "No AI provider is configured on this deployment." },
      { status: 503 },
    );
  }

  const { data, error: badRequest } = await parseBody(request, CommandTextSchema);
  if (badRequest) return badRequest;

  const { supabase } = viewer;
  const [roles, profiles] = await Promise.all([
    getAllRoles(supabase),
    getProfiles(supabase),
  ]);

  let plan;
  let model: string;
  try {
    const result = await generateJson(
      commandPlanPrompt(
        data!.command,
        roles.filter((role) => role.is_open).map((role) => role.title),
        profiles.map((profile) => profile.full_name),
      ),
      CommandPlanSchema,
    );
    plan = result.data;
    model = result.model;
  } catch (error) {
    const status = error instanceof AiUnavailableError ? 503 : 502;
    return NextResponse.json({ error: (error as Error).message }, { status });
  }

  if (plan.action === "unsupported") {
    return NextResponse.json({
      executable: false,
      reason:
        "That instruction is outside what this command bar will do. It can nominate candidates for a role, close a role, or reopen one.",
      summary: plan.summary,
      model,
    });
  }

  const role = plan.role_title
    ? resolveByName(roles, plan.role_title, (item) => item.title)
    : null;

  if (!role) {
    return NextResponse.json({
      executable: false,
      reason: plan.role_title
        ? `No open role matches "${plan.role_title}".`
        : "That instruction did not name a role.",
      summary: plan.summary,
      model,
    });
  }

  /* ---------------------------------------------------------------- */
  /* close / reopen                                                    */
  /* ---------------------------------------------------------------- */
  if (plan.action === "close_role" || plan.action === "reopen_role") {
    const nextOpen = plan.action === "reopen_role";
    if (role.is_open === nextOpen) {
      return NextResponse.json({
        executable: false,
        reason: `${role.title} is already ${nextOpen ? "open" : "closed"}.`,
        summary: plan.summary,
        model,
      });
    }

    return NextResponse.json({
      executable: true,
      model,
      summary: plan.summary,
      plan: {
        action: plan.action,
        roleId: role.id,
        employeeIds: [],
        note: plan.note,
        summary: plan.summary,
      },
      preview: {
        title: `${nextOpen ? "Reopen" : "Close"} ${role.title}`,
        before: [{ label: role.title, value: role.is_open ? "Open" : "Closed" }],
        after: [{ label: role.title, value: nextOpen ? "Open" : "Closed" }],
      },
      unresolved: [],
    });
  }

  /* ---------------------------------------------------------------- */
  /* nominate                                                          */
  /* ---------------------------------------------------------------- */
  const employees = profiles.filter((profile) => profile.app_role === "employee");
  const unresolved: string[] = [];
  let chosen: Array<{ id: string; name: string; detail: string }> = [];

  if (plan.employee_names.length > 0) {
    for (const name of plan.employee_names) {
      const match = resolveByName(employees, name, (item) => item.full_name);
      if (match) {
        chosen.push({
          id: match.user_id,
          name: match.full_name,
          detail: `${match.job_title}, ${match.department}`,
        });
      } else {
        unresolved.push(name);
      }
    }
  } else {
    // "the best N candidates" — ranked by the deterministic score, not by the
    // model. The model never picks who gets put forward.
    const allSkills = await getAllEmployeeSkills(supabase);
    const byEmployee = groupSkillsByEmployee(allSkills);
    const ranked = rankCandidates(
      toRequiredSkills(role),
      employees.map((profile) => ({
        id: profile.user_id,
        name: profile.full_name,
        jobTitle: profile.job_title,
        department: profile.department,
        held: byEmployee.get(profile.user_id) ?? [],
      })),
    ).slice(0, plan.top_n ?? 3);

    chosen = ranked.map((candidate) => ({
      id: candidate.id,
      name: candidate.name,
      detail: `${candidate.jobTitle} — fit ${candidate.breakdown.score}/100, ${READINESS_LABEL[candidate.breakdown.readiness]}`,
    }));
  }

  if (chosen.length === 0) {
    return NextResponse.json({
      executable: false,
      reason:
        unresolved.length > 0
          ? `Could not match these names to an employee: ${unresolved.join(", ")}.`
          : "No candidates to nominate.",
      summary: plan.summary,
      model,
    });
  }

  const existing = await getNominations(supabase, { roleId: role.id });
  const existingIds = new Set(existing.map((nomination) => nomination.employee_id));
  const nameById = new Map(profiles.map((profile) => [profile.user_id, profile.full_name]));

  const additions = chosen.filter((candidate) => !existingIds.has(candidate.id));

  if (additions.length === 0) {
    return NextResponse.json({
      executable: false,
      reason: "Everyone in that shortlist is already nominated for this role.",
      summary: plan.summary,
      model,
    });
  }

  return NextResponse.json({
    executable: true,
    model,
    summary: plan.summary,
    plan: {
      action: "nominate_candidates" as const,
      roleId: role.id,
      employeeIds: additions.map((candidate) => candidate.id),
      note: plan.note,
      summary: plan.summary,
    },
    preview: {
      title: `Nominate ${additions.length} ${additions.length === 1 ? "person" : "people"} for ${role.title}`,
      before: existing.length
        ? existing.map((nomination) => ({
            label: nameById.get(nomination.employee_id) ?? nomination.employee_id,
            value: nomination.status,
          }))
        : [{ label: "No nominations yet", value: "—" }],
      after: [
        ...existing.map((nomination) => ({
          label: nameById.get(nomination.employee_id) ?? nomination.employee_id,
          value: nomination.status,
        })),
        ...additions.map((candidate) => ({
          label: `${candidate.name} — ${candidate.detail}`,
          value: "proposed",
          added: true,
        })),
      ],
    },
    unresolved,
  });
}
