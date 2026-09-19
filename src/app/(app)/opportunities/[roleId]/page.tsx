import { notFound } from "next/navigation";
import Link from "next/link";
import { requireViewer } from "@/lib/auth";
import {
  getEmployeeSkills,
  getLearningRecs,
  getRole,
  toHeldSkills,
  toRequiredSkills,
} from "@/lib/data";
import { scoreMatch } from "@/lib/scoring";
import { LevelMeter, ScoreRing } from "@/components/charts";
import { ExplainPanel, RoadmapPanel } from "@/components/match-panels";
import { Badge, Card, ReadinessBadge, SectionTitle } from "@/components/ui";
import type { MatchRow } from "@/lib/types";

export default async function RoleDetailPage({
  params,
}: {
  params: Promise<{ roleId: string }>;
}) {
  const { roleId } = await params;
  const viewer = await requireViewer();
  const { supabase, userId } = viewer;

  const [role, skills, recs, cachedResult] = await Promise.all([
    getRole(supabase, roleId),
    getEmployeeSkills(supabase, userId),
    getLearningRecs(supabase, userId, roleId),
    supabase
      .from("tb_matches")
      .select("*")
      .eq("employee_id", userId)
      .eq("role_id", roleId)
      .maybeSingle<MatchRow>(),
  ]);

  if (!role) notFound();

  const required = toRequiredSkills(role);
  const breakdown = scoreMatch(required, toHeldSkills(skills));
  const cached = cachedResult.data;

  const coveredById = new Map(breakdown.covered.map((skill) => [skill.skillId, skill]));

  return (
    <div className="space-y-6">
      <Link href="/opportunities" className="text-sm text-muted hover:text-ink">
        ← All opportunities
      </Link>

      <Card>
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
          <div className="shrink-0">
            <ScoreRing score={breakdown.score} size={130} />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-xl font-semibold text-ink">{role.title}</h1>
              <Badge>{role.department}</Badge>
              <ReadinessBadge readiness={breakdown.readiness} />
            </div>
            <p className="mt-3 text-sm leading-relaxed text-muted">{role.description}</p>
            <p className="mt-3 text-xs text-muted">
              {breakdown.covered.length} of {required.length} requirements met ·{" "}
              {breakdown.gaps.length} gap{breakdown.gaps.length === 1 ? "" : "s"}
              {breakdown.transferable.length > 0
                ? ` · ${breakdown.transferable.length} transferable from your work history`
                : ""}
            </p>
          </div>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <SectionTitle hint="Each requirement against what you hold today.">
            Requirement coverage
          </SectionTitle>
          <ul className="space-y-2">
            {required.map((requirement) => {
              const covered = coveredById.get(requirement.skillId);
              const current = covered?.effectiveLevel ?? 0;
              return (
                <li
                  key={requirement.skillId}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-panel-raised/50 px-4 py-2.5"
                >
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-sm text-ink">{requirement.name}</span>
                    {covered?.isHidden ? <Badge tone="accent">transferable</Badge> : null}
                  </span>
                  <span className="flex items-center gap-3">
                    <LevelMeter current={current} required={requirement.requiredLevel} />
                    <span className="w-24 text-right text-xs tabular-nums text-muted">
                      {current}/{requirement.requiredLevel}
                      {current >= requirement.requiredLevel - 0.25 ? " ✓" : ""}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        </Card>

        <Card>
          <SectionTitle hint="Written from the numbers on the left — it cannot contradict them.">
            Why you fit
          </SectionTitle>
          <ExplainPanel
            roleId={roleId}
            employeeId={userId}
            initialRationale={cached?.rationale ?? null}
            initialModel={cached?.model ?? null}
          />
        </Card>
      </div>

      <Card>
        <SectionTitle
          hint={
            breakdown.gaps.length
              ? `Closing these, heaviest first: ${breakdown.gaps.map((gap) => gap.name).join(", ")}.`
              : "Nothing missing against this role."
          }
        >
          Learning roadmap
        </SectionTitle>
        <RoadmapPanel
          roleId={roleId}
          employeeId={userId}
          initialItems={recs}
          hasGaps={breakdown.gaps.length > 0}
        />
      </Card>
    </div>
  );
}
