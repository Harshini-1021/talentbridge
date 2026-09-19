import { redirect } from "next/navigation";
import { getViewer } from "@/lib/auth";
import { LoginForm } from "@/components/login-form";

const PILLARS = [
  {
    title: "Discovery",
    body: "Reads projects, work history and learning records, and surfaces the skills a job title hides — with the sentence of evidence behind each one.",
  },
  {
    title: "Matching",
    body: "Scores every internal opening against the profile with a deterministic, reproducible rule, then explains the result in plain language.",
  },
  {
    title: "Mobility",
    body: "Turns the remaining gap into a learning roadmap, and lets HR act on a shortlist through a command that shows its diff before it writes.",
  },
];

export default async function LandingPage() {
  // Already signed in? Skip the marketing.
  const viewer = await getViewer().catch(() => null);
  if (viewer) redirect(viewer.isHr ? "/hr" : "/dashboard");

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-12 px-6 py-14 lg:flex-row lg:items-center lg:gap-16 lg:py-20">
      <div className="flex-1">
        <p className="inline-flex items-center rounded-full border border-accent/40 bg-accent-soft px-3 py-1 text-xs font-medium text-accent">
          AI × Web Development
        </p>

        <h1 className="mt-5 text-4xl font-semibold leading-tight text-ink sm:text-5xl">
          Your next hire
          <br />
          already works here.
        </h1>

        <p className="mt-5 max-w-xl text-base leading-relaxed text-muted">
          TalentBridge builds a living skill profile from what people have
          actually done, matches those profiles to internal roles with a written
          justification, and turns the gap into a plan. The fit score is computed
          in code, not generated — the model explains a number it cannot change.
        </p>

        <dl className="mt-9 grid gap-4 sm:grid-cols-3">
          {PILLARS.map((pillar) => (
            <div
              key={pillar.title}
              className="rounded-xl border border-line bg-panel/70 p-4"
            >
              <dt className="text-sm font-semibold text-ink">{pillar.title}</dt>
              <dd className="mt-1.5 text-sm leading-relaxed text-muted">
                {pillar.body}
              </dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="flex justify-center lg:justify-end">
        <LoginForm />
      </div>
    </main>
  );
}
