"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const misconfigured = error.message.includes("Supabase is not configured");

  return (
    <div className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-6 py-20">
      <div className="rounded-xl border border-bad/30 bg-bad/10 p-6">
        <h1 className="text-lg font-semibold text-ink">
          {misconfigured ? "This deployment is not configured yet" : "Something broke"}
        </h1>

        <p className="mt-2 text-sm leading-relaxed text-muted">
          {misconfigured
            ? "The Supabase environment variables are missing. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY on the deployment and redeploy."
            : "The page could not be rendered. The error has been logged."}
        </p>

        {error.digest ? (
          <p className="mt-2 font-mono text-xs text-muted">digest: {error.digest}</p>
        ) : null}

        <button
          type="button"
          onClick={reset}
          className="mt-5 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-[#08111f]"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
