"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface DiscoverResult {
  summary: string;
  written: number;
  hidden: number;
  model: string;
}

export function DiscoverButton({
  employeeId,
  label = "Run skill discovery",
}: {
  employeeId: string;
  label?: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<DiscoverResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setPending(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch("/api/profile/discover", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ employeeId }),
      });
      const body = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(body.error ?? "Discovery failed.");
        return;
      }

      setResult(body as DiscoverResult);
      router.refresh();
    } catch {
      setError("Network problem — try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={run}
        disabled={pending}
        className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-[#08111f] transition hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "Reading work history…" : label}
      </button>

      {pending ? (
        <p className="mt-2 text-xs text-muted">
          Analysing projects and learning records. This takes a few seconds.
        </p>
      ) : null}

      {error ? (
        <p
          role="alert"
          className="mt-3 rounded-lg border border-bad/30 bg-bad/10 px-3 py-2 text-sm text-bad"
        >
          {error}
        </p>
      ) : null}

      {result ? (
        <div className="mt-3 rounded-lg border border-good/30 bg-good/10 px-4 py-3">
          <p className="text-sm text-ink">{result.summary}</p>
          <p className="mt-2 text-xs text-muted">
            {result.written} skills written, {result.hidden} of them hidden by the job
            title · {result.model}
          </p>
        </div>
      ) : null}
    </div>
  );
}
