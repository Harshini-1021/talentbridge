import Link from "next/link";
import { requireViewer } from "@/lib/auth";
import {
  getEmployeeSkills,
  getOpenRoles,
  toHeldSkills,
  toRequiredSkills,
} from "@/lib/data";
import { scoreMatch } from "@/lib/scoring";
import { ScoreRing } from "@/components/charts";
import { Badge, Card, EmptyState, ReadinessBadge, SectionTitle } from "@/components/ui";

export default async function OpportunitiesPage() {
  const viewer = await requireViewer();
  const { supabase, userId, isHr } = viewer;

  const [roles, skills] = await Promise.all([
    getOpenRoles(supabase),
    getEmployeeSkills(supabase, userId),
  ]);

  const held = toHeldSkills(skills);

  const ranked = roles
    .map((role) => ({ role, breakdown: scoreMatch(toRequiredSkills(role), held) }))
    .sort((a, b) => b.breakdown.score - a.breakdown.score);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink">
          {isHr ? "Open internal roles" : "Your opportunities"}
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          {isHr
            ? "Every open role, with the requirement matrix behind it. Open one to see the internal candidate bench."
            : "Every open role scored against your profile. The score is arithmetic over your skills and the role's requirements — the same inputs produce the same number every time."}
        </p>
      </div>

      {ranked.length === 0 ? (
        <EmptyState title="There are no open roles right now." />
      ) : (
        <div className="grid gap-4">
          {ranked.map(({ role, breakdown }) => (
            <Card key={role.id}>
              <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
                {!isHr ? (
                  <div className="shrink-0">
                    <ScoreRing score={breakdown.score} size={96} />
                  </div>
                ) : null}

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-3">
                    <h2 className="text-base font-semibold text-ink">{role.title}</h2>
                    <Badge>{role.department}</Badge>
                    {!isHr ? <ReadinessBadge readiness={breakdown.readiness} /> : null}
                  </div>

                  <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-muted">
                    {role.description}
                  </p>

                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {toRequiredSkills(role)
                      .slice(0, 6)
                      .map((requirement) => (
                        <span
                          key={requirement.skillId}
                          className="rounded-md border border-line bg-panel-raised/60 px-2 py-0.5 text-xs text-muted"
                        >
                          {requirement.name} · {requirement.requiredLevel}/5
                        </span>
                      ))}
                  </div>

                  {!isHr && breakdown.transferable.length > 0 ? (
                    <p className="mt-3 text-xs text-accent">
                      Counts {breakdown.transferable.length} transferable{" "}
                      {breakdown.transferable.length === 1 ? "skill" : "skills"} your job
                      title does not show.
                    </p>
                  ) : null}
                </div>

                <Link
                  href={isHr ? `/hr/roles/${role.id}` : `/opportunities/${role.id}`}
                  className="shrink-0 rounded-lg border border-accent/40 bg-accent-soft px-4 py-2 text-sm font-medium text-accent transition hover:bg-accent/20"
                >
                  {isHr ? "Candidate bench" : "Why I fit →"}
                </Link>
              </div>
            </Card>
          ))}
        </div>
      )}

      {!isHr ? (
        <Card>
          <SectionTitle hint="How the number is produced.">Scoring</SectionTitle>
          <p className="text-sm leading-relaxed text-muted">
            Each required skill contributes the fraction of its required level you
            reach, weighted by how important it is to the role. An AI-inferred skill is
            discounted by the model&apos;s own confidence, so a 60%-confident inference
            counts for less than something you declared. Exceeding one requirement never
            compensates for missing another.
          </p>
        </Card>
      ) : null}
    </div>
  );
}
