import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-6 py-20">
      <h1 className="text-lg font-semibold text-ink">Not found</h1>
      <p className="mt-2 text-sm text-muted">
        That page does not exist, or it is not visible to your account.
      </p>
      <Link
        href="/dashboard"
        className="mt-5 inline-block w-fit rounded-lg border border-line px-4 py-2 text-sm text-muted hover:text-ink"
      >
        Back to the app
      </Link>
    </div>
  );
}
