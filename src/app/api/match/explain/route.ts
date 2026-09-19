import { NextResponse } from "next/server";
import { getViewer } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { AiUnavailableError, aiConfigured, generateJson } from "@/lib/ai/provider";
import { MatchRationaleSchema } from "@/lib/ai/schemas";
import { matchRationalePrompt } from "@/lib/ai/prompts";
import { ExplainMatchSchema, parseBody } from "@/lib/validation";
import { getEmployeeSkills, getRole, toHeldSkills, toRequiredSkills } from "@/lib/data";
import { scoreMatch } from "@/lib/scoring";
import type { Profile } from "@/lib/types";

/**
 * F2a — why this person fits this role.
 *
 * The score is computed here, deterministically, before the model is called.
 * The model receives the finished number and is told not to contradict it, so
 * the explanation can never disagree with the ranking a judge is looking at.
 */
export const maxDuration = 60;

export async function POST(request: Request) {
  const viewer = await getViewer();
  if (!viewer) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }

  const { data, error: badRequest } = await parseBody(request, ExplainMatchSchema);
  if (badRequest) return badRequest;

  const { roleId, employeeId } = data!;

  if (employeeId !== viewer.userId && !viewer.isHr) {
    return NextResponse.json({ error: "Not your profile." }, { status: 403 });
  }

  const { supabase } = viewer;

  const [role, skills, targetResult] = await Promise.all([
    getRole(supabase, roleId),
    getEmployeeSkills(supabase, employeeId),
    supabase.from("tb_profiles").select("*").eq("user_id", employeeId).maybeSingle<Profile>(),
  ]);

  const target = targetResult.data;

  if (!role) return NextResponse.json({ error: "Role not found." }, { status: 404 });
  if (!target) return NextResponse.json({ error: "Employee not found." }, { status: 404 });

  const breakdown = scoreMatch(toRequiredSkills(role), toHeldSkills(skills));

  if (!aiConfigured()) {
    return NextResponse.json({ breakdown, rationale: null, model: null });
  }

  let rationale: string;
  let highlights: string[];
  let model: string;
  try {
    const result = await generateJson(
      matchRationalePrompt(target, role.title, role.description, breakdown),
      MatchRationaleSchema,
    );
    rationale = result.data.rationale;
    highlights = result.data.highlights;
    model = result.model;
  } catch (error) {
    const status = error instanceof AiUnavailableError ? 503 : 502;
    // The score still stands — hand it back so the UI degrades to numbers
    // rather than to an error page.
    return NextResponse.json(
      { breakdown, rationale: null, error: (error as Error).message },
      { status },
    );
  }

  const { error: saveError } = await supabase.from("tb_matches").upsert(
    {
      employee_id: employeeId,
      role_id: roleId,
      score: breakdown.score,
      rationale,
      gaps: breakdown.gaps,
      model,
    },
    { onConflict: "employee_id,role_id" },
  );

  if (saveError) {
    return NextResponse.json(
      { breakdown, rationale, error: `Could not cache the explanation: ${saveError.message}` },
      { status: 500 },
    );
  }

  await writeAudit(supabase, {
    action: "match.explain",
    entity: "tb_matches",
    entityId: roleId,
    after: { employee_id: employeeId, score: breakdown.score, model },
  });

  return NextResponse.json({ breakdown, rationale, highlights, model });
}
