import Link from "next/link";
import { requireHr } from "@/lib/auth";
import {
  getAllEmployeeSkills,
  getAllRoles,
  getNominations,
  getProfiles,
  groupSkillsByEmployee,
  toRequiredSkills,
} from "@/lib/data";
import { effectiveLevel, rankCandidates } from "@/lib/scoring";
import { BarChart } from "@/components/charts";
import { CommandBar } from "@/components/command-bar";
import { Badge, Card, EmptyState, ReadinessBadge, SectionTitle, Stat } from "@/components/ui";

export default async function HrPage() {
  const viewer = await requireHr();
  const { supabase } = viewer;

  const [profiles, allSkills, roles, nominations] = await Promise.all([
    getProfiles(supabase),
    getAllEmployeeSkills(supabase),
    getAllRoles(supabase),
    getNominations(supabase),
  ]);

  const employees = profiles.filter((profile) => profile.app_role === "employee");
  const byEmployee = groupSkillsByEmployee(allSkills);
  const openRoles = roles.filter((role) => role.is_open);

  /* Skill supply: how many people hold each skill at a working level (3+). */
  const supply = new Map<string, number>();
  for (const row of allSkills) {
    const name = row.tb_skills?.name;
    if (!name) continue;
    if (effectiveLevel({
      skillId: row.skill_id,
      name,
      level: Number(row.level),
      confidence: Number(row.confidence),
      isHidden: row.is_hidden,
    }) >= 3) {
      supply.set(name, (supply.get(name) ?? 0) + 1);
    }
  }

  const topSupply = [...supply.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([label, value]) => ({ label, value }));

  /* Scarcity: for every skill an open role requires, how many people actually
     reach the required level. The short ones are the organisation's real gaps. */
  const scarcity = new Map<string, { qualified: number; demand: number }>();
  for (const role of openRoles) {
    for (const requirement of toRequiredSkills(role)) {
      const entry = scarcity.get(requirement.name) ?? { qualified: 0, demand: 0 };
      entry.demand += 1;
      scarcity.set(requirement.name, entry);
    }
  }
  for (const [name, entry] of scarcity) {
    let qualified = 0;
    for (const employee of employees) {
      const held = byEmployee.get(employee.user_id) ?? [];
      const match = held.find((skill) => skill.name === name);
      const required = openRoles
        .flatMap((role) => toRequiredSkills(role))
        .filter((requirement) => requirement.name === name)
        .reduce((min, requirement) => Math.min(min, requirement.requiredLevel), 5);
      if (match && effectiveLevel(match) >= required) qualified += 1;
    }
    entry.qualified = qualified;
  }

  const scarcest = [...scarcity.entries()]
    .sort((a, b) => a[1].qualified - b[1].qualified || b[1].demand - a[1].demand)
    .slice(0, 8)
    .map(([label, entry]) => ({
      label,
      value: entry.qualified,
      emphasis: entry.qualified === 0,
    }));

  /* Talent availability: the best internal fit for each open role. */
  const roleBench = openRoles.map((role) => {
    const ranked = rankCandidates(
      toRequiredSkills(role),
      employees.map((profile) => ({
        id: profile.user_id,
        name: profile.full_name,
        jobTitle: profile.job_title,
        held: byEmployee.get(profile.user_id) ?? [],
      })),
    );
    return { role, top: ranked[0] ?? null, readyCount: ranked.filter((c) => c.breakdown.score >= 70).length };
  });

  const hiddenFound = allSkills.filter((skill) => skill.is_hidden).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Workforce</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          What this organisation can already staff from the inside, and where it
          genuinely cannot.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Employees" value={employees.length} />
        <Stat
          label="Skills tracked"
          value={supply.size}
          sub="held at level 3 or above"
        />
        <Stat
          label="Hidden strengths found"
          value={hiddenFound}
          sub="invisible from job titles"
        />
        <Stat
          label="Open roles"
          value={openRoles.length}
          sub={`${nominations.length} nominations`}
        />
      </div>

      <Card className="border-accent/30">
        <SectionTitle hint="Plain English. It plans the change, shows you the diff, and writes only after you confirm — every applied change lands in the audit log.">
          Command bar
        </SectionTitle>
        <CommandBar />
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <SectionTitle hint="People holding each skill at a working level or above.">
            Skill supply
          </SectionTitle>
          {topSupply.length === 0 ? (
            <EmptyState title="No skills recorded yet." />
          ) : (
            <BarChart data={topSupply} unit=" people" />
          )}
        </Card>

        <Card>
          <SectionTitle hint="Skills the open roles need, ranked by how few people actually reach the required level. Zero means nobody internal qualifies.">
            Emerging skill gaps
          </SectionTitle>
          {scarcest.length === 0 ? (
            <EmptyState title="No open roles to analyse." />
          ) : (
            <BarChart data={scarcest} unit=" qualified" />
          )}
        </Card>
      </div>

      <Card>
        <SectionTitle hint="Best internal candidate for each open role, scored deterministically across the whole organisation.">
          Talent availability
        </SectionTitle>

        {roleBench.length === 0 ? (
          <EmptyState title="No open roles." />
        ) : (
          <ul className="space-y-2">
            {roleBench.map(({ role, top, readyCount }) => (
              <li key={role.id}>
                <Link
                  href={`/hr/roles/${role.id}`}
                  className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-line bg-panel-raised/50 px-4 py-3 transition hover:border-accent/50"
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-ink">
                      {role.title}
                    </span>
                    <span className="block text-xs text-muted">
                      {role.department} ·{" "}
                      {readyCount > 0
                        ? `${readyCount} internal ${readyCount === 1 ? "candidate" : "candidates"} at 70+`
                        : "no strong internal candidate yet"}
                    </span>
                  </span>
                  <span className="flex items-center gap-3">
                    {top ? (
                      <>
                        <span className="text-right">
                          <span className="block text-sm text-ink">{top.name}</span>
                          <span className="block text-xs tabular-nums text-muted">
                            {top.breakdown.score}/100
                          </span>
                        </span>
                        <ReadinessBadge readiness={top.breakdown.readiness} />
                      </>
                    ) : (
                      <Badge>no candidates</Badge>
                    )}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
