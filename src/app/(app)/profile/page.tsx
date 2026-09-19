import { requireViewer } from "@/lib/auth";
import { getEmployeeSkills, getExperiences } from "@/lib/data";
import { LevelMeter } from "@/components/charts";
import { DiscoverButton } from "@/components/discover-button";
import { Badge, Card, EmptyState, SectionTitle } from "@/components/ui";
import type { EmployeeSkillWithSkill } from "@/lib/types";

const KIND_LABEL: Record<string, string> = {
  project: "Project",
  job: "Role",
  learning: "Learning",
  achievement: "Achievement",
};

function SkillRow({ skill }: { skill: EmployeeSkillWithSkill }) {
  return (
    <li className="rounded-lg border border-line bg-panel-raised/50 px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="text-sm font-medium text-ink">{skill.tb_skills?.name}</span>
        <LevelMeter current={Number(skill.level)} required={0} />
        <span className="text-xs text-muted">level {skill.level}/5</span>
        {skill.is_hidden ? <Badge tone="accent">hidden strength</Badge> : null}
        {skill.source === "ai_inferred" ? (
          <Badge>AI · {Math.round(Number(skill.confidence) * 100)}% confident</Badge>
        ) : (
          <Badge tone="good">declared</Badge>
        )}
      </div>
      {skill.evidence ? (
        <p className="mt-2 border-l-2 border-line pl-3 text-sm leading-relaxed text-muted">
          {skill.evidence}
        </p>
      ) : null}
    </li>
  );
}

export default async function ProfilePage() {
  const viewer = await requireViewer();
  const { supabase, userId, profile } = viewer;

  const [skills, experiences] = await Promise.all([
    getEmployeeSkills(supabase, userId),
    getExperiences(supabase, userId),
  ]);

  const hidden = skills.filter((skill) => skill.is_hidden);
  const declared = skills.filter((skill) => skill.source === "declared");
  const inferred = skills.filter(
    (skill) => skill.source === "ai_inferred" && !skill.is_hidden,
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-ink">My skill profile</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Built from {experiences.length} recorded{" "}
            {experiences.length === 1 ? "entry" : "entries"} of work history. Every
            inferred skill carries the evidence it came from — nothing here is a
            guess you cannot check.
          </p>
        </div>
        <DiscoverButton employeeId={userId} />
      </div>

      {hidden.length > 0 ? (
        <Card className="border-accent/30">
          <SectionTitle hint={`Found in ${profile.full_name.split(" ")[0]}'s work history, not in the job title or the declared list.`}>
            Hidden strengths
          </SectionTitle>
          <ul className="space-y-2">
            {hidden.map((skill) => (
              <SkillRow key={skill.id} skill={skill} />
            ))}
          </ul>
        </Card>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <SectionTitle hint="Stated on the employee record.">Declared skills</SectionTitle>
          {declared.length === 0 ? (
            <EmptyState title="Nothing declared yet." />
          ) : (
            <ul className="space-y-2">
              {declared.map((skill) => (
                <SkillRow key={skill.id} skill={skill} />
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <SectionTitle hint="Inferred from projects and learning, with a confidence score.">
            Discovered skills
          </SectionTitle>
          {inferred.length === 0 ? (
            <EmptyState title="Discovery has not run yet.">
              Use the button above — it reads your projects and finds what your title
              does not say.
            </EmptyState>
          ) : (
            <ul className="space-y-2">
              {inferred.map((skill) => (
                <SkillRow key={skill.id} skill={skill} />
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card>
        <SectionTitle hint="The raw material the discovery pass reads.">
          Work history
        </SectionTitle>
        {experiences.length === 0 ? (
          <EmptyState title="No work history on file." />
        ) : (
          <ol className="space-y-3">
            {experiences.map((experience) => (
              <li
                key={experience.id}
                className="rounded-lg border border-line bg-panel-raised/40 px-4 py-3"
              >
                <div className="flex flex-wrap items-center gap-3">
                  <Badge>{KIND_LABEL[experience.kind] ?? experience.kind}</Badge>
                  <span className="text-sm font-medium text-ink">{experience.title}</span>
                  <span className="text-xs text-muted">
                    {experience.started_on ?? "—"} →{" "}
                    {experience.ended_on ?? "present"}
                  </span>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-muted">
                  {experience.description}
                </p>
              </li>
            ))}
          </ol>
        )}
      </Card>
    </div>
  );
}
