import type { ReactNode } from "react";
import { READINESS_LABEL, type Readiness } from "@/lib/scoring";

/** Small shared primitives, so every page uses the same card and the same badge. */

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-xl border border-line bg-panel/80 p-5 shadow-[0_1px_0_rgba(255,255,255,0.03)_inset] ${className}`}
    >
      {children}
    </section>
  );
}

export function SectionTitle({
  children,
  hint,
  action,
}: {
  children: ReactNode;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-4 flex items-start justify-between gap-4">
      <div>
        <h2 className="text-sm font-semibold tracking-wide text-ink uppercase">
          {children}
        </h2>
        {hint ? <p className="mt-1 text-sm text-muted">{hint}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "accent" | "good" | "warn" | "bad";
}) {
  const tones: Record<string, string> = {
    neutral: "border-line bg-panel-raised text-muted",
    accent: "border-accent/40 bg-accent-soft text-accent",
    good: "border-good/30 bg-good/10 text-good",
    warn: "border-warn/30 bg-warn/10 text-warn",
    bad: "border-bad/30 bg-bad/10 text-bad",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

export function ReadinessBadge({ readiness }: { readiness: Readiness }) {
  const tone =
    readiness === "ready"
      ? "good"
      : readiness === "strong"
        ? "accent"
        : readiness === "stretch"
          ? "warn"
          : "neutral";
  return <Badge tone={tone as "good" | "accent" | "warn" | "neutral"}>{READINESS_LABEL[readiness]}</Badge>;
}

export function EmptyState({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-dashed border-line bg-panel-raised/40 px-5 py-8 text-center">
      <p className="text-sm font-medium text-ink">{title}</p>
      {children ? <div className="mt-2 text-sm text-muted">{children}</div> : null}
    </div>
  );
}

export function Stat({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border border-line bg-panel/80 px-4 py-3">
      <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-ink">{value}</p>
      {sub ? <p className="mt-0.5 text-xs text-muted">{sub}</p> : null}
    </div>
  );
}
