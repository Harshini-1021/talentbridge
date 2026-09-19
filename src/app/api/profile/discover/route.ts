import { NextResponse } from "next/server";
import { getViewer } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { generateJson, AiUnavailableError, aiConfigured } from "@/lib/ai/provider";
import { DiscoverySchema } from "@/lib/ai/schemas";
import { discoveryPrompt } from "@/lib/ai/prompts";
import { DiscoverSchema, parseBody } from "@/lib/validation";
import { getEmployeeSkills, getExperiences, getSkillTaxonomy } from "@/lib/data";
import type { Profile } from "@/lib/types";

/**
 * F1 — talent discovery.
 *
 * Reads an employee's real work history and writes back a skill profile,
 * flagging the skills their job title never revealed.
 *
 * Without this the platform kills the function before the provider ladder can
 * reach its second rung, and a single hiccup looks like a total outage.
 */
export const maxDuration = 60;

export async function POST(request: Request) {
  const viewer = await getViewer();
  if (!viewer) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }

  const { data, error: badRequest } = await parseBody(request, DiscoverSchema);
  if (badRequest) return badRequest;

  const employeeId = data!.employeeId;

  // An employee may run discovery on themselves; HR may run it for anyone.
  if (employeeId !== viewer.userId && !viewer.isHr) {
    return NextResponse.json(
      { error: "You can only build your own skill profile." },
      { status: 403 },
    );
  }

  if (!aiConfigured()) {
    return NextResponse.json(
      { error: "No AI provider is configured on this deployment." },
      { status: 503 },
    );
  }

  const { supabase } = viewer;

  const { data: target } = await supabase
    .from("tb_profiles")
    .select("*")
    .eq("user_id", employeeId)
    .maybeSingle<Profile>();

  if (!target) {
    return NextResponse.json({ error: "Employee not found." }, { status: 404 });
  }

  const [experiences, taxonomy, existing] = await Promise.all([
    getExperiences(supabase, employeeId),
    getSkillTaxonomy(supabase),
    getEmployeeSkills(supabase, employeeId),
  ]);

  if (experiences.length === 0) {
    return NextResponse.json(
      {
        error:
          "There is no recorded work history for this employee, so there is nothing to analyse yet.",
      },
      { status: 422 },
    );
  }

  const declared = existing
    .filter((row) => row.source === "declared" && row.tb_skills)
    .map((row) => row.tb_skills!.name);

  let discovery;
  let model: string;
  try {
    const result = await generateJson(
      discoveryPrompt(
        target,
        experiences,
        taxonomy.map((skill) => skill.name),
        declared,
      ),
      DiscoverySchema,
    );
    discovery = result.data;
    model = result.model;
  } catch (error) {
    if (error instanceof AiUnavailableError) {
      return NextResponse.json(
        { error: "No AI provider answered. Try again in a moment.", attempts: error.attempts },
        { status: 503 },
      );
    }
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 502 },
    );
  }

  // Resolve every returned skill name to a taxonomy row, adding names the
  // organisation did not have yet. Matching is case-insensitive so "dbt" and
  // "DBT" do not become two skills.
  const byLowerName = new Map(taxonomy.map((skill) => [skill.name.toLowerCase(), skill]));
  const unknown = discovery.skills.filter(
    (skill) => !byLowerName.has(skill.name.toLowerCase()),
  );

  if (unknown.length > 0) {
    const deduped = new Map(
      unknown.map((skill) => [
        skill.name.toLowerCase(),
        { name: skill.name, category: skill.category },
      ]),
    );

    // ignoreDuplicates makes this ON CONFLICT DO NOTHING rather than DO UPDATE.
    // tb_skills has an insert policy but deliberately no update policy — names
    // in a shared taxonomy may be added, never rewritten — so an upsert that
    // took the update path would be refused by RLS.
    const { error } = await supabase
      .from("tb_skills")
      .upsert([...deduped.values()], { onConflict: "name", ignoreDuplicates: true });

    if (error) {
      return NextResponse.json(
        { error: `Could not extend the skill taxonomy: ${error.message}` },
        { status: 500 },
      );
    }

    // Re-read to pick up ids for both the rows just inserted and any that
    // already existed under a different casing.
    const { data: refreshed, error: refreshError } = await supabase
      .from("tb_skills")
      .select("*")
      .in("name", [...deduped.values()].map((skill) => skill.name));

    if (refreshError) {
      return NextResponse.json(
        { error: `Could not read the skill taxonomy: ${refreshError.message}` },
        { status: 500 },
      );
    }

    for (const skill of refreshed ?? []) {
      byLowerName.set(skill.name.toLowerCase(), skill);
    }
  }

  // A skill the employee declared themselves outranks an inference: the
  // discovery pass adds to a profile, it does not overwrite what a human said.
  const declaredSkillIds = new Set(
    existing.filter((row) => row.source === "declared").map((row) => row.skill_id),
  );

  const rows = discovery.skills
    .map((skill) => {
      const taxonomyRow = byLowerName.get(skill.name.toLowerCase());
      if (!taxonomyRow) return null;
      if (declaredSkillIds.has(taxonomyRow.id)) return null;
      return {
        employee_id: employeeId,
        skill_id: taxonomyRow.id,
        level: skill.level,
        confidence: skill.confidence,
        source: "ai_inferred" as const,
        evidence: skill.evidence,
        is_hidden: skill.is_hidden,
        updated_at: new Date().toISOString(),
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  if (rows.length > 0) {
    const { error } = await supabase
      .from("tb_employee_skills")
      .upsert(rows, { onConflict: "employee_id,skill_id" });

    if (error) {
      return NextResponse.json(
        { error: `Could not save the skill profile: ${error.message}` },
        { status: 500 },
      );
    }
  }

  await writeAudit(supabase, {
    action: "profile.discover",
    entity: "tb_employee_skills",
    entityId: employeeId,
    before: { skill_count: existing.length },
    after: {
      skill_count: existing.length + rows.length,
      written: rows.length,
      hidden_found: rows.filter((row) => row.is_hidden).length,
      model,
    },
  });

  return NextResponse.json({
    summary: discovery.summary,
    written: rows.length,
    hidden: rows.filter((row) => row.is_hidden).length,
    skipped_declared: discovery.skills.length - rows.length,
    model,
  });
}
