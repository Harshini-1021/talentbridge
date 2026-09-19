import Link from "next/link";
import { notFound } from "next/navigation";
import { requireHr } from "@/lib/auth";
import {
  getAllEmployeeSkills,
  getNominations,
  getProfiles,
  getRole,
  groupSkillsByEmployee,
  toRequiredSkills,
} from "@/lib/data";
import { rankCandidates } from "@/lib/scoring";
import { ScoreRing } from "@/components/charts";
import { DiscoverButton } from "@/components/discover-button";
import { Badge, Card, EmptyState, ReadinessBadge, SectionTitle } from "@/components/ui";

export default async function RoleBenchPage({
  params,
}: {
  params: Promise<{ roleId: string }>;
}) {
  const { roleId } = await params;
  const viewer = await requireHr();
  const { supabase } = viewer;

  const [role, profiles, allSkills, nominations] = await Promise.all([
    getRole(supabase, roleId),
    getProfiles(supabase),
    getAllEmployeeSkills(supabase),
    getNominations(supabase, { roleId }),
  ]);

  if (!role) notFound();

  const employees = profiles.filter((profile) => profile.app_role === "employee");
  const byEmployee = groupSkillsByEmployee(allSkills);
  const required = toRequiredSkills(role);

  const analysedIds = new Set(
    allSkills.filter((skill) => skill.source === "ai_inferred").map((skill) => skill.employee_id),
  );
  const nominatedIds = new Set(nominations.map((nomination) => nomination.employee_id));

  const ranked = rankCandidates(
    required,
    employees.map((profile) => ({
      id: profile.user_id,
      name: profile.full_name,
      jobTitle: profile.job_title,
      department: profile.department,
      held: byEmployee.get(profile.user_id) ?? [],
    })),
  );

  return (
    <div className="space-y-6">
      <Link href="/hr" className="text-sm text-muted hover:text-ink">
        ← Workforce
      </Link>

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-xl font-semibold text-ink">{role.title}</h1>
              <Badge>{role.department}</Badge>
              <Badge tone={role.is_open ? "good" : "neutral"}>
                {role.is_open ? "open" : "closed"}
              </Badge>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-muted">{role.description}</p>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {required.map((requirement) => (
              <span
                key={requirement.skillId}
                className="rounded-md border border-line bg-panel-raised/60 px-2 py-0.5 text-xs text-muted"
              >
                {requirement.name} · {requirement.requiredLevel}/5 ×{requirement.weight}
              </span>
            ))}
          </div>
        </div>
      </Card>

      <Card>
        <SectionTitle hint="Everyone in the organisation, scored against this role's requirements. Nobody applied — this is the bench you already have.">
          Internal candidate bench
        </SectionTitle>

        {ranked.length === 0 ? (
          <EmptyState title="No employees on file." />
        ) : (
          <ul className="space-y-3">
            {ranked.map((candidate) => (
              <li
                key={candidate.id}
                className="rounded-lg border border-line bg-panel-raised/50 p-4"
              >
                <div className="flex flex-wrap items-center gap-4">
                  <ScoreRing score={candidate.breakdown.score} size={74} />

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <span className="text-sm font-medium text-ink">{candidate.name}</span>
                      <span className="text-xs text-muted">
                        {candidate.jobTitle} · {candidate.department}
                      </span>
                      <ReadinessBadge readiness={candidate.breakdown.readiness} />
                      {nominatedIds.has(candidate.id) ? (
                        <Badge tone="accent">nominated</Badge>
                      ) : null}
                      {!analysedIds.has(candidate.id) ? (
                        <Badge tone="warn">profile not analysed</Badge>
                      ) : null}
                    </div>

                    {candidate.breakdown.transferable.length > 0 ? (
                      <p className="mt-2 text-xs text-accent">
                        Transferable from work history:{" "}
                        {candidate.breakdown.transferable
                          .map((skill) => skill.name)
                          .join(", ")}
                      </p>
                    ) : null}

                    <p className="mt-1.5 text-xs text-muted">
                      Covers{" "}
                      {candidate.breakdown.covered.map((skill) => skill.name).join(", ") ||
                        "nothing yet"}
                      .
                    </p>

                    {candidate.breakdown.gaps.length > 0 ? (
                      <p className="mt-1 text-xs text-muted">
                        Missing:{" "}
                        {candidate.breakdown.gaps
                          .slice(0, 5)
                          .map((gap) => `${gap.name} (${gap.currentLevel}/${gap.requiredLevel})`)
                          .join(", ")}
                        .
                      </p>
                    ) : null}
                  </div>

                  {!analysedIds.has(candidate.id) ? (
                    <DiscoverButton employeeId={candidate.id} label="Analyse profile" />
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <SectionTitle hint="Created through the command bar, each with an audit row behind it.">
          Nominations for this role
        </SectionTitle>
        {nominations.length === 0 ? (
          <EmptyState title="Nobody nominated yet.">
            Use the command bar on the workforce page.
          </EmptyState>
        ) : (
          <ul className="space-y-2">
            {nominations.map((nomination) => {
              const person = profiles.find(
                (profile) => profile.user_id === nomination.employee_id,
              );
              return (
                <li
                  key={nomination.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-panel-raised/50 px-4 py-2.5"
                >
                  <span className="text-sm text-ink">
                    {person?.full_name ?? nomination.employee_id}
                  </span>
                  <span className="flex items-center gap-3">
                    <span className="text-xs text-muted">
                      {new Date(nomination.created_at).toLocaleString()}
                    </span>
                    <Badge tone={nomination.status === "confirmed" ? "good" : "accent"}>
                      {nomination.status}
                    </Badge>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
