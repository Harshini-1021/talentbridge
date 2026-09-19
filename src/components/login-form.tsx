"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const DEMO_ACCOUNTS = [
  {
    label: "Priya Raman",
    role: "Employee · Data Analyst",
    email: "priya@talentbridge.dev",
    blurb: "Sees her own profile, matches and roadmap.",
  },
  {
    label: "Arun Mehta",
    role: "HR admin · People",
    email: "arun@talentbridge.dev",
    blurb: "Sees the workforce view and the command bar.",
  },
];

const DEMO_PASSWORD = "TalentBridge#2026";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const body = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(body.error ?? "Could not sign in.");
        setPending(false);
        return;
      }

      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("Network problem — check the connection and try again.");
      setPending(false);
    }
  }

  return (
    <div className="w-full max-w-md">
      <form onSubmit={submit} className="rounded-2xl border border-line bg-panel/90 p-6">
        <h2 className="text-lg font-semibold text-ink">Sign in</h2>
        <p className="mt-1 text-sm text-muted">
          Real credentialed accounts — there is no role switcher.
        </p>

        <label className="mt-5 block text-sm font-medium text-ink" htmlFor="email">
          Work email
        </label>
        <input
          id="email"
          type="email"
          required
          autoComplete="username"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="mt-1.5 w-full rounded-lg border border-line bg-bg px-3 py-2.5 text-sm text-ink placeholder:text-muted/60"
          placeholder="you@talentbridge.dev"
        />

        <label className="mt-4 block text-sm font-medium text-ink" htmlFor="password">
          Password
        </label>
        <input
          id="password"
          type="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="mt-1.5 w-full rounded-lg border border-line bg-bg px-3 py-2.5 text-sm text-ink"
          placeholder="••••••••"
        />

        {error ? (
          <p
            role="alert"
            className="mt-4 rounded-lg border border-bad/30 bg-bad/10 px-3 py-2 text-sm text-bad"
          >
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={pending}
          className="mt-5 w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-[#08111f] transition hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <div className="mt-4 rounded-2xl border border-line bg-panel/60 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">
          Demo accounts
        </p>
        <div className="mt-3 grid gap-2">
          {DEMO_ACCOUNTS.map((account) => (
            <button
              key={account.email}
              type="button"
              onClick={() => {
                setEmail(account.email);
                setPassword(DEMO_PASSWORD);
                setError(null);
              }}
              className="rounded-lg border border-line bg-panel-raised/60 px-3 py-2.5 text-left transition hover:border-accent/50"
            >
              <span className="block text-sm font-medium text-ink">
                {account.label}{" "}
                <span className="font-normal text-muted">· {account.role}</span>
              </span>
              <span className="mt-0.5 block text-xs text-muted">{account.blurb}</span>
            </button>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted">
          Clicking one fills the form. Password for every demo account:{" "}
          <code className="rounded bg-bg px-1.5 py-0.5 font-mono text-[11px] text-ink">
            {DEMO_PASSWORD}
          </code>
        </p>
      </div>
    </div>
  );
}
