import { NextResponse } from "next/server";
import { getViewer } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { AiUnavailableError, aiConfigured, generateJson } from "@/lib/ai/provider";
import { RoadmapSchema } from "@/lib/ai/schemas";
import { roadmapPrompt } from "@/lib/ai/prompts";
import { parseBody, RoadmapRequestSchema } from "@/lib/validation";
import {
  getEmployeeSkills,
  getRole,
  getSkillTaxonomy,
  toHeldSkills,
  toRequiredSkills,
} from "@/lib/data";
import { scoreMatch } from "@/lib/scoring";
import type { Profile } from "@/lib/types";

/**
 * F2b — turn the gap list into a learning plan.
 *
 * The gaps themselves are computed, not generated; the model only chooses what
 * to study for each one.
 */
export const maxDuration = 60;

export async function POST(request: Request) {
  const viewer = await getViewer();
  if (!viewer) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }

  const { data, error: badRequest } = await parseBody(request, RoadmapRequestSchema);
  if (badRequest) return badRequest;

  const { roleId, employeeId } = data!;

  if (employeeId !== viewer.userId && !viewer.isHr) {
    return NextResponse.json({ error: "Not your profile." }, { status: 403 });
  }

  if (!aiConfigured()) {
    return NextResponse.json(
      { error: "No AI provider is configured on this deployment." },
      { status: 503 },
    );
  }

  const { supabase } = viewer;

  const [role, skills, taxonomy, targetResult] = await Promise.all([
    getRole(supabase, roleId),
    getEmployeeSkills(supabase, employeeId),
    getSkillTaxonomy(supabase),
    supabase.from("tb_profiles").select("*").eq("user_id", employeeId).maybeSingle<Profile>(),
  ]);

  const target = targetResult.data;
  if (!role) return NextResponse.json({ error: "Role not found." }, { status: 404 });
  if (!target) return NextResponse.json({ error: "Employee not found." }, { status: 404 });

  const breakdown = scoreMatch(toRequiredSkills(role), toHeldSkills(skills));

  if (breakdown.gaps.length === 0) {
    return NextResponse.json({
      items: [],
      message: "No skill gaps against this role — nothing to study before applying.",
    });
  }

  let items;
  let model: string;
  try {
    const result = await generateJson(
      roadmapPrompt(
        target,
        role.title,
        breakdown.gaps.map((gap) => ({
          name: gap.name,
          currentLevel: gap.currentLevel,
          requiredLevel: gap.requiredLevel,
        })),
      ),
      RoadmapSchema,
    );
    items = result.data.items;
    model = result.model;
  } catch (error) {
    const status = error instanceof AiUnavailableError ? 503 : 502;
    return NextResponse.json({ error: (error as Error).message }, { status });
  }

  const skillIdByName = new Map(
    taxonomy.map((skill) => [skill.name.toLowerCase(), skill.id]),
  );

  // Regenerating replaces the previous plan for this role rather than stacking
  // a second copy underneath it.
  const { error: clearError } = await supabase
    .from("tb_learning_recs")
    .delete()
    .eq("employee_id", employeeId)
    .eq("role_id", roleId);

  if (clearError) {
    return NextResponse.json(
      { error: `Could not replace the previous roadmap: ${clearError.message}` },
      { status: 500 },
    );
  }

  const rows = items.map((item) => ({
    employee_id: employeeId,
    role_id: roleId,
    skill_id: skillIdByName.get(item.skill_name.toLowerCase()) ?? null,
    skill_name: item.skill_name,
    title: item.title,
    provider: item.provider,
    url: item.url ?? null,
    effort_hours: item.effort_hours,
    rationale: item.rationale,
  }));

  const { data: saved, error: saveError } = await supabase
    .from("tb_learning_recs")
    .insert(rows)
    .select("*");

  if (saveError) {
    return NextResponse.json(
      { error: `Could not save the roadmap: ${saveError.message}` },
      { status: 500 },
    );
  }

  await writeAudit(supabase, {
    action: "roadmap.generate",
    entity: "tb_learning_recs",
    entityId: roleId,
    after: {
      employee_id: employeeId,
      items: rows.length,
      total_hours: rows.reduce((sum, row) => sum + row.effort_hours, 0),
      model,
    },
  });

  return NextResponse.json({ items: saved, model });
}
