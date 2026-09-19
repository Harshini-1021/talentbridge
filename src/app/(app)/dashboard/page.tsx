import Link from "next/link";
import { requireViewer } from "@/lib/auth";
import {
  getEmployeeSkills,
  getNominations,
  getOpenRoles,
  getProfiles,
  toHeldSkills,
  toRequiredSkills,
} from "@/lib/data";
import { scoreMatch } from "@/lib/scoring";
import { BarChart, ScoreRing } from "@/components/charts";
import { Badge, Card, EmptyState, ReadinessBadge, SectionTitle, Stat } from "@/components/ui";

export default async function DashboardPage() {
  const viewer = await requireViewer();
  const { supabase, userId, profile } = viewer;

  const [skills, roles, nominations] = await Promise.all([
    getEmployeeSkills(supabase, userId),
    getOpenRoles(supabase),
    getNominations(supabase, { employeeId: userId }),
  ]);

  const held = toHeldSkills(skills);
  const hidden = held.filter((skill) => skill.isHidden);
  const inferred = skills.filter((skill) => skill.source === "ai_inferred");

  const ranked = roles
    .map((role) => ({ role, breakdown: scoreMatch(toRequiredSkills(role), held) }))
    .sort((a, b) => b.breakdown.score - a.breakdown.score);

  const best = ranked[0];
  const roleTitleById = new Map(roles.map((role) => [role.id, role.title]));

  // Nominations name an HR author; resolve it for display where visible.
  const profiles = nominations.length ? await getProfiles(supabase) : [];
  const nameById = new Map(profiles.map((item) => [item.user_id, item.full_name]));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink">
          Good to see you, {profile.full_name.split(" ")[0]}.
        </h1>
        <p className="mt-1 text-sm text-muted">
          {profile.job_title} · {profile.department} · {profile.years_experience} years
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Skills on file" value={held.length} sub={`${inferred.length} found by AI`} />
        <Stat
          label="Hidden strengths"
          value={hidden.length}
          sub="Not visible from your job title"
        />
        <Stat
          label="Best internal fit"
          value={best ? `${best.breakdown.score}` : "—"}
          sub={best ? best.role.title : "No open roles"}
        />
        <Stat
          label="Nominations"
          value={nominations.length}
          sub={nominations.length ? "HR has put you forward" : "None yet"}
        />
      </div>

      {inferred.length === 0 ? (
        <Card className="border-accent/30 bg-accent-soft/30">
          <SectionTitle hint="Your profile currently only holds what was declared for you. The discovery pass reads your projects and work history and finds what your title does not say.">
            Start with skill discovery
          </SectionTitle>
          <Link
            href="/profile"
            className="inline-flex rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-[#08111f] transition hover:opacity-90"
          >
            Go to my skills
          </Link>
        </Card>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <Card>
          <SectionTitle hint="Every open role, scored against your current profile.">
            Where you fit
          </SectionTitle>

          {ranked.length === 0 ? (
            <EmptyState title="No open roles right now.">
              When HR opens one it appears here automatically.
            </EmptyState>
          ) : (
            <>
              <BarChart
                data={ranked.map((entry) => ({
                  label: entry.role.title,
                  value: entry.breakdown.score,
                  emphasis: entry.breakdown.score >= 85,
                }))}
                max={100}
              />

              <ul className="mt-5 space-y-2">
                {ranked.slice(0, 3).map((entry) => (
                  <li key={entry.role.id}>
                    <Link
                      href={`/opportunities/${entry.role.id}`}
                      className="flex items-center justify-between gap-4 rounded-lg border border-line bg-panel-raised/50 px-4 py-3 transition hover:border-accent/50"
                    >
                      <span>
                        <span className="block text-sm font-medium text-ink">
                          {entry.role.title}
                        </span>
                        <span className="block text-xs text-muted">
                          {entry.role.department} ·{" "}
                          {entry.breakdown.gaps.length === 0
                            ? "no gaps"
                            : `${entry.breakdown.gaps.length} skill ${entry.breakdown.gaps.length === 1 ? "gap" : "gaps"}`}
                        </span>
                      </span>
                      <ReadinessBadge readiness={entry.breakdown.readiness} />
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>

        <div className="space-y-6">
          {best ? (
            <Card>
              <SectionTitle hint={best.role.title}>Strongest match</SectionTitle>
              <div className="flex items-center gap-4">
                <ScoreRing score={best.breakdown.score} />
                <div className="min-w-0">
                  <ReadinessBadge readiness={best.breakdown.readiness} />
                  <p className="mt-2 text-sm text-muted">
                    {best.breakdown.covered.length} of{" "}
                    {best.breakdown.covered.length + best.breakdown.gaps.length} required
                    skills covered.
                  </p>
                  <Link
                    href={`/opportunities/${best.role.id}`}
                    className="mt-2 inline-block text-sm font-medium text-accent hover:underline"
                  >
                    See why →
                  </Link>
                </div>
              </div>
            </Card>
          ) : null}

          <Card>
            <SectionTitle hint="Roles HR has put you forward for.">
              Nominations
            </SectionTitle>
            {nominations.length === 0 ? (
              <EmptyState title="No nominations yet.">
                HR sees your profile in their talent view.
              </EmptyState>
            ) : (
              <ul className="space-y-2">
                {nominations.map((nomination) => (
                  <li
                    key={nomination.id}
                    className="rounded-lg border border-line bg-panel-raised/50 px-4 py-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-medium text-ink">
                        {roleTitleById.get(nomination.role_id) ?? "Role"}
                      </span>
                      <Badge tone={nomination.status === "confirmed" ? "good" : "accent"}>
                        {nomination.status}
                      </Badge>
                    </div>
                    {nomination.note ? (
                      <p className="mt-1 text-xs text-muted">{nomination.note}</p>
                    ) : null}
                    <p className="mt-1 text-xs text-muted">
                      by {nameById.get(nomination.created_by) ?? "HR"} ·{" "}
                      {new Date(nomination.created_at).toLocaleDateString()}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
