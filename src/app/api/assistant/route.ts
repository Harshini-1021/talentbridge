import { NextResponse } from "next/server";
import { getViewer } from "@/lib/auth";
import { AiUnavailableError, aiConfigured, generateText } from "@/lib/ai/provider";
import { assistantPrompt } from "@/lib/ai/prompts";
import { AssistantSchema, parseBody } from "@/lib/validation";
import {
  getEmployeeSkills,
  getOpenRoles,
  toHeldSkills,
  toRequiredSkills,
} from "@/lib/data";
import { READINESS_LABEL, scoreMatch } from "@/lib/scoring";
import type { AssistantMessage } from "@/lib/types";

/**
 * F3a — the career assistant.
 *
 * Grounded in the caller's own data only: the context is assembled from
 * queries made with the caller's session, so RLS decides what the model can
 * see. There is no shared index and no way to ask about a colleague.
 */
export const maxDuration = 60;

export async function POST(request: Request) {
  const viewer = await getViewer();
  if (!viewer) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }

  const { data, error: badRequest } = await parseBody(request, AssistantSchema);
  if (badRequest) return badRequest;

  if (!aiConfigured()) {
    return NextResponse.json(
      { error: "No AI provider is configured on this deployment." },
      { status: 503 },
    );
  }

  const { supabase, userId, profile } = viewer;
  const question = data!.message;

  const [skills, roles, historyResult] = await Promise.all([
    getEmployeeSkills(supabase, userId),
    getOpenRoles(supabase),
    supabase
      .from("tb_assistant_messages")
      .select("*")
      .eq("employee_id", userId)
      .order("created_at", { ascending: true })
      .limit(20),
  ]);

  const held = toHeldSkills(skills);

  const skillLines = held.length
    ? held
        .map(
          (skill) =>
            `- ${skill.name}: level ${skill.level}/5${skill.isHidden ? " (surfaced from work history)" : ""}`,
        )
        .join("\n")
    : "- (no skills recorded yet — the discovery pass has not been run)";

  const roleLines = roles
    .map((role) => {
      const breakdown = scoreMatch(toRequiredSkills(role), held);
      const gaps = breakdown.gaps.map((gap) => gap.name).join(", ") || "none";
      return `- ${role.title} (${role.department}): fit ${breakdown.score}/100, ${READINESS_LABEL[breakdown.readiness]}. Missing: ${gaps}.`;
    })
    .join("\n");

  const context = `Employee: ${profile.full_name}, ${profile.job_title} in ${profile.department}, ${profile.years_experience} years of experience.

THEIR SKILLS
${skillLines}

OPEN INTERNAL ROLES AND THEIR FIT SCORES
${roleLines || "- (no open roles)"}`;

  const history = ((historyResult.data ?? []) as AssistantMessage[]).map((message) => ({
    role: message.role,
    content: message.content,
  }));

  // The question is stored before the answer is attempted, so a provider
  // outage does not lose what the employee asked.
  const { error: questionError } = await supabase.from("tb_assistant_messages").insert({
    employee_id: userId,
    role: "user",
    content: question,
  });

  if (questionError) {
    return NextResponse.json(
      { error: `Could not save your message: ${questionError.message}` },
      { status: 500 },
    );
  }

  let reply: string;
  let model: string;
  try {
    const result = await generateText(assistantPrompt(profile, context, history, question));
    reply = result.text;
    model = result.model;
  } catch (error) {
    const status = error instanceof AiUnavailableError ? 503 : 502;
    return NextResponse.json({ error: (error as Error).message }, { status });
  }

  await supabase.from("tb_assistant_messages").insert({
    employee_id: userId,
    role: "assistant",
    content: reply,
  });

  return NextResponse.json({ reply, model });
}
