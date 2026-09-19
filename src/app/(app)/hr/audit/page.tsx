import { requireHr } from "@/lib/auth";
import { getProfiles } from "@/lib/data";
import { Badge, Card, EmptyState, SectionTitle } from "@/components/ui";
import type { AuditRow } from "@/lib/types";

const ACTION_TONE: Record<string, "accent" | "good" | "neutral"> = {
  "nomination.create": "good",
  "role.close_role": "accent",
  "role.reopen_role": "accent",
  "profile.discover": "neutral",
  "match.explain": "neutral",
  "roadmap.generate": "neutral",
};

function Json({ value }: { value: unknown }) {
  if (value === null || value === undefined) {
    return <span className="text-xs text-muted">—</span>;
  }
  return (
    <pre className="overflow-x-auto rounded-md bg-bg px-3 py-2 font-mono text-[11px] leading-relaxed text-muted">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

export default async function AuditPage() {
  const viewer = await requireHr();
  const { supabase } = viewer;

  const [{ data }, profiles] = await Promise.all([
    supabase
      .from("tb_audit_log")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100),
    getProfiles(supabase),
  ]);

  const rows = (data ?? []) as AuditRow[];
  const nameById = new Map(profiles.map((profile) => [profile.user_id, profile.full_name]));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Audit log</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Every mutation, with the state before and after it. The table is
          append-only: there is no update or delete policy on it, and both
          privileges are revoked from client roles, so a row cannot be rewritten
          from the application even by an administrator.
        </p>
      </div>

      <Card>
        <SectionTitle hint={`${rows.length} most recent entries.`}>
          Recorded actions
        </SectionTitle>

        {rows.length === 0 ? (
          <EmptyState title="Nothing recorded yet.">
            Run a discovery pass or a command and it appears here.
          </EmptyState>
        ) : (
          <ul className="space-y-3">
            {rows.map((row) => (
              <li
                key={row.id}
                className="rounded-lg border border-line bg-panel-raised/50 px-4 py-3"
              >
                <div className="flex flex-wrap items-center gap-3">
                  <Badge tone={ACTION_TONE[row.action] ?? "neutral"}>{row.action}</Badge>
                  <span className="text-sm text-ink">
                    {nameById.get(row.actor) ?? row.actor}
                  </span>
                  <span className="text-xs text-muted">
                    {new Date(row.created_at).toLocaleString()}
                  </span>
                  <span className="text-xs text-muted">· {row.entity}</span>
                </div>

                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <div>
                    <p className="mb-1 text-[11px] uppercase tracking-wide text-muted">
                      Before
                    </p>
                    <Json value={row.before} />
                  </div>
                  <div>
                    <p className="mb-1 text-[11px] uppercase tracking-wide text-muted">
                      After
                    </p>
                    <Json value={row.after} />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
