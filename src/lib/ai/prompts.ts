import type { Experience, Profile } from "@/lib/types";
import type { MatchBreakdown } from "@/lib/scoring";

/**
 * Prompts live in one file so their wording can be reviewed as a unit.
 *
 * Every prompt that returns structured data states the schema inline and is
 * paired with a Zod schema in ./schemas.ts. The model is never asked to invent
 * identifiers, and never asked to make a decision the code can make correctly.
 */

function describeExperiences(experiences: Experience[]): string {
  if (experiences.length === 0) return "(no recorded experience)";
  return experiences
    .map((experience) => {
      const period = [experience.started_on, experience.ended_on ?? "present"]
        .filter(Boolean)
        .join(" → ");
      return `- [${experience.kind}] ${experience.title}${period ? ` (${period})` : ""}\n  ${experience.description}`;
    })
    .join("\n");
}

export function discoveryPrompt(
  profile: Profile,
  experiences: Experience[],
  taxonomy: string[],
  declared: string[],
): string {
  return `You are a talent analyst building a skill profile from an employee's real work history.

EMPLOYEE
Name: ${profile.full_name}
Current title: ${profile.job_title}
Department: ${profile.department}
Years of experience: ${profile.years_experience}

WORK HISTORY, PROJECTS, LEARNING
${describeExperiences(experiences)}

ALREADY DECLARED (do not simply repeat these unless the history shows a different level)
${declared.length ? declared.join(", ") : "(none)"}

ORGANISATION SKILL TAXONOMY — prefer these exact names where one fits
${taxonomy.join(", ")}

TASK
Identify the skills this person actually demonstrates. The point of the exercise
is to find capability that a job title hides, so pay particular attention to:
- tools and techniques used inside a project even when they are not the person's stated discipline
- transferable strengths shown by how they worked: mentoring, incident command, written communication, stakeholder negotiation, process automation
- evidence of a level higher or lower than the title implies

Rules:
- Every skill must be grounded in a specific sentence of the history. Quote or paraphrase it in "evidence". Never invent experience.
- "level" is 1 (aware) to 5 (expert), judged against the evidence, not against the job title.
- "confidence" is 0 to 1: how certain the evidence makes you. Weak or indirect evidence belongs at 0.5 or below, not omitted.
- "is_hidden" is true when the skill is not obvious from the job title or the declared list — this is the most valuable output of the whole exercise.
- Use taxonomy names exactly when one fits; otherwise use a concise standard name.
- Return between 8 and 20 skills.

Return ONLY JSON of this shape:
{"summary":"2-3 sentences on this person's real strengths, naming the most surprising finding","skills":[{"name":"SQL","category":"Data & Analytics","level":4,"confidence":0.9,"evidence":"Rebuilt the subscription cohort model finance closes on.","is_hidden":false}]}`;
}

export function matchRationalePrompt(
  profile: Profile,
  roleTitle: string,
  roleDescription: string,
  breakdown: MatchBreakdown,
): string {
  const covered = breakdown.covered
    .map(
      (skill) =>
        `- ${skill.name}: has ~${skill.effectiveLevel}/5, role needs ${skill.requiredLevel}/5${skill.isHidden ? " (surfaced from work history, not their job title)" : ""}`,
    )
    .join("\n");

  const gaps = breakdown.gaps
    .map((gap) => `- ${gap.name}: has ~${gap.currentLevel}/5, role needs ${gap.requiredLevel}/5`)
    .join("\n");

  return `You are explaining an internal role match to the employee themselves. Write in second person, plainly, no corporate filler.

EMPLOYEE: ${profile.full_name}, ${profile.job_title} in ${profile.department}

ROLE: ${roleTitle}
${roleDescription}

The fit score is ${breakdown.score}/100. That number was computed by the system from the skill data below — do not recompute it, contradict it, or quote a different number.

WHAT THEY BRING
${covered || "(no overlapping skills recorded)"}

WHAT IS MISSING
${gaps || "(nothing material)"}

TASK
Write 3-5 sentences explaining why this person is or is not suitable, citing the specific skills above. If any skill was surfaced from their work history rather than their title, say so explicitly — that is the insight the employee will not have had. Be honest about the gaps; a match that oversells itself is worse than useless.

Return ONLY JSON:
{"rationale":"...","highlights":["short phrase","short phrase"]}`;
}

export function roadmapPrompt(
  profile: Profile,
  roleTitle: string,
  gaps: Array<{ name: string; currentLevel: number; requiredLevel: number }>,
): string {
  const gapList = gaps
    .map((gap) => `- ${gap.name}: currently ~${gap.currentLevel}/5, needs ${gap.requiredLevel}/5`)
    .join("\n");

  return `You are building a practical learning roadmap for an employee moving into an internal role.

EMPLOYEE: ${profile.full_name}, ${profile.job_title} in ${profile.department}
TARGET ROLE: ${roleTitle}

SKILL GAPS, most important first
${gapList}

TASK
Recommend one concrete learning action per gap, in the same order, at most 6 items. Each must be something a working professional can actually start this month: a named course, a certification, an internal project to volunteer for, or a specific book. Prefer widely available, well-known providers (Coursera, Udacity, DataCamp, AWS, Google Cloud, Microsoft Learn, the official documentation, or an internal project). Give an honest effort estimate in hours.

Only include a "url" if you are confident the link is real and stable — otherwise omit the field entirely. A wrong link is worse than no link.

Return ONLY JSON:
{"items":[{"skill_name":"Apache Airflow","title":"Airflow: The Hands-On Guide","provider":"Udemy","effort_hours":20,"rationale":"Covers DAG authoring and retries, which is the gap between your cron script and a production pipeline."}]}`;
}

export function assistantPrompt(
  profile: Profile,
  context: string,
  history: Array<{ role: string; content: string }>,
  question: string,
): string {
  const transcript = history
    .slice(-6)
    .map((message) => `${message.role === "user" ? "Employee" : "Assistant"}: ${message.content}`)
    .join("\n");

  return `You are the internal career assistant at the company where ${profile.full_name} works. You are talking to them directly.

WHAT YOU KNOW ABOUT THEM AND THE OPEN ROLES
${context}

RULES
- Answer only from the context above. If it does not contain the answer, say so and suggest what would.
- Never invent a role, a score, a colleague, or a course that is not listed.
- Quote the fit scores exactly as given.
- Be direct and brief: at most 6 sentences. No bullet lists unless comparing roles.
- You are advising, not deciding. Do not promise anyone a role.

${transcript ? `CONVERSATION SO FAR\n${transcript}\n` : ""}
Employee: ${question}
Assistant:`;
}

export function commandPlanPrompt(command: string, roleTitles: string[], employeeNames: string[]): string {
  return `You translate an HR administrator's instruction into a structured plan. You do not execute anything, and you never produce ids or SQL.

OPEN ROLES: ${roleTitles.join(" | ") || "(none)"}
EMPLOYEES: ${employeeNames.join(" | ") || "(none)"}

SUPPORTED ACTIONS
- "nominate_candidates": put one or more employees forward for a role. If the instruction asks for the best N candidates rather than naming people, set top_n and leave employee_names empty.
- "close_role": mark a role as no longer open.
- "reopen_role": mark a role as open again.
- "unsupported": anything else, including deletions, anything about pay, and anything you are not sure about.

Match role and employee names to the lists above, correcting obvious spelling differences. If the instruction names a role or person that is not in the lists, still return the name as written — the server will report that it could not be resolved.

INSTRUCTION
"""${command}"""

Return ONLY JSON:
{"action":"nominate_candidates","role_title":"Data Platform Engineer","employee_names":[],"top_n":3,"note":null,"summary":"Nominate the three best-matching internal candidates for Data Platform Engineer."}`;
}
