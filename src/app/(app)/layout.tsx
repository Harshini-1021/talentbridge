import { Suspense, type ReactNode } from "react";
import Link from "next/link";
import { requireViewer } from "@/lib/auth";
import { NavLinks, NavSkeleton, SignOutButton, type NavItem } from "@/components/nav";

/**
 * Shell for every signed-in page.
 *
 * requireViewer() runs here and again in each page: a layout is not a security
 * boundary in the App Router — it does not re-run on every client navigation —
 * so authorisation is checked where the data is read, and RLS checks it again
 * at the database.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const viewer = await requireViewer();

  const items: NavItem[] = viewer.isHr
    ? [
        { href: "/hr", label: "Workforce" },
        { href: "/hr/audit", label: "Audit log" },
        { href: "/opportunities", label: "Open roles" },
      ]
    : [
        { href: "/dashboard", label: "Overview" },
        { href: "/profile", label: "My skills" },
        { href: "/opportunities", label: "Opportunities" },
        { href: "/assistant", label: "Career assistant" },
      ];

  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b border-line bg-panel/60 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-6 py-3">
          <Link href={viewer.isHr ? "/hr" : "/dashboard"} className="flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-accent text-sm font-bold text-[#08111f]">
              T
            </span>
            <span className="text-sm font-semibold tracking-tight text-ink">
              TalentBridge
            </span>
          </Link>

          <Suspense fallback={<NavSkeleton />}>
            <NavLinks items={items} />
          </Suspense>

          <div className="ml-auto flex items-center gap-3">
            <div className="text-right">
              <p className="text-sm font-medium leading-tight text-ink">
                {viewer.profile.full_name}
              </p>
              <p className="text-xs leading-tight text-muted">
                {viewer.isHr ? "HR administrator" : viewer.profile.job_title}
              </p>
            </div>
            <SignOutButton />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">{children}</main>

      <footer className="border-t border-line px-6 py-5 text-center text-xs text-muted">
        Fit scores are computed deterministically in code. The model explains
        them and never changes them.
      </footer>
    </div>
  );
}
