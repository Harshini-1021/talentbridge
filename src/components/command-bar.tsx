"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * The HR command bar: plan → diff → confirm → execute.
 *
 * Nothing is written until the second request. The first request only returns a
 * plan and a before/after preview; this component cannot execute anything the
 * server did not mark executable, and the server re-checks everything anyway.
 */

interface DiffRow {
  label: string;
  value: string;
  added?: boolean;
}

interface Plan {
  action: "nominate_candidates" | "close_role" | "reopen_role";
  roleId: string;
  employeeIds: string[];
  note: string | null;
  summary: string;
}

interface PlanResponse {
  executable: boolean;
  reason?: string;
  summary?: string;
  model?: string;
  plan?: Plan;
  preview?: { title: string; before: DiffRow[]; after: DiffRow[] };
  unresolved?: string[];
}

const EXAMPLES = [
  "Shortlist the top 3 internal candidates for Data Platform Engineer and nominate them",
  "Nominate Kavya Nair for ML Operations Engineer",
  "Close the Revenue Operations Analyst role",
];

export function CommandBar() {
  const router = useRouter();
  const [command, setCommand] = useState("");
  const [planning, setPlanning] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [result, setResult] = useState<PlanResponse | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function plan(text: string) {
    const instruction = text.trim();
    if (instruction.length < 4) return;

    setPlanning(true);
    setError(null);
    setDone(null);
    setResult(null);

    try {
      const response = await fetch("/api/hr/command/plan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ command: instruction }),
      });
      const body = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(body.error ?? "Could not plan that instruction.");
        return;
      }
      setResult(body as PlanResponse);
    } catch {
      setError("Network problem — try again.");
    } finally {
      setPlanning(false);
    }
  }

  async function execute() {
    if (!result?.plan) return;
    setExecuting(true);
    setError(null);

    try {
      const response = await fetch("/api/hr/command/execute", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(result.plan),
      });
      const body = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(body.error ?? "The change could not be applied.");
        return;
      }

      setDone(body.message ?? "Done.");
      setResult(null);
      setCommand("");
      router.refresh();
    } catch {
      setError("Network problem — try again.");
    } finally {
      setExecuting(false);
    }
  }

  return (
    <div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void plan(command);
        }}
        className="flex flex-col gap-2 sm:flex-row"
      >
        <input
          value={command}
          onChange={(event) => setCommand(event.target.value)}
          placeholder="Tell TalentBridge what to do…"
          maxLength={500}
          className="flex-1 rounded-lg border border-line bg-bg px-3.5 py-2.5 text-sm text-ink placeholder:text-muted/60"
        />
        <button
          type="submit"
          disabled={planning || command.trim().length < 4}
          className="rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-[#08111f] transition hover:opacity-90 disabled:opacity-40"
        >
          {planning ? "Planning…" : "Plan it"}
        </button>
      </form>

      {!result && !done ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {EXAMPLES.map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => {
                setCommand(example);
                void plan(example);
              }}
              className="rounded-full border border-line bg-panel-raised/60 px-3.5 py-1.5 text-xs text-muted transition hover:border-accent/50 hover:text-ink"
            >
              {example}
            </button>
          ))}
        </div>
      ) : null}

      {error ? (
        <p
          role="alert"
          className="mt-3 rounded-lg border border-bad/30 bg-bad/10 px-3 py-2 text-sm text-bad"
        >
          {error}
        </p>
      ) : null}

      {done ? (
        <p className="mt-3 rounded-lg border border-good/30 bg-good/10 px-3 py-2 text-sm text-good">
          {done} Recorded in the audit log.
        </p>
      ) : null}

      {result && !result.executable ? (
        <div className="mt-3 rounded-lg border border-warn/30 bg-warn/10 px-4 py-3">
          <p className="text-sm text-ink">{result.reason}</p>
          {result.summary ? (
            <p className="mt-1 text-xs text-muted">Understood as: {result.summary}</p>
          ) : null}
        </div>
      ) : null}

      {result?.executable && result.preview && result.plan ? (
        <div className="mt-4 rounded-xl border border-accent/40 bg-accent-soft/40 p-4">
          <p className="text-sm font-semibold text-ink">{result.preview.title}</p>
          <p className="mt-1 text-xs text-muted">
            Understood as: {result.summary}
            {result.model ? ` · planned by ${result.model}` : ""}
          </p>

          {result.unresolved && result.unresolved.length > 0 ? (
            <p className="mt-2 text-xs text-warn">
              Could not resolve: {result.unresolved.join(", ")} — they are not included.
            </p>
          ) : null}

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-line bg-panel/80 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                Before
              </p>
              <ul className="mt-2 space-y-1.5">
                {result.preview.before.map((row, index) => (
                  <li key={`${row.label}-${index}`} className="text-sm text-muted">
                    {row.label} <span className="text-xs">· {row.value}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-lg border border-good/30 bg-panel/80 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-good">
                After
              </p>
              <ul className="mt-2 space-y-1.5">
                {result.preview.after.map((row, index) => (
                  <li
                    key={`${row.label}-${index}`}
                    className={`text-sm ${row.added ? "text-good" : "text-muted"}`}
                  >
                    {row.added ? "+ " : ""}
                    {row.label} <span className="text-xs">· {row.value}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={execute}
              disabled={executing}
              className="rounded-lg bg-good px-4 py-2 text-sm font-semibold text-[#052018] transition hover:opacity-90 disabled:opacity-50"
            >
              {executing ? "Applying…" : "Confirm and apply"}
            </button>
            <button
              type="button"
              onClick={() => setResult(null)}
              className="rounded-lg border border-line px-4 py-2 text-sm text-muted transition hover:text-ink"
            >
              Discard
            </button>
            <span className="text-xs text-muted">
              Nothing has been written yet.
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
