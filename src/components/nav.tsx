"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

export interface NavItem {
  href: string;
  label: string;
}

export function NavLinks({ items }: { items: NavItem[] }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-wrap items-center gap-1">
      {items.map((item) => {
        const active =
          pathname === item.href ||
          (item.href !== "/dashboard" && pathname.startsWith(`${item.href}/`));
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`rounded-lg px-3 py-1.5 text-sm transition ${
              active
                ? "bg-accent-soft text-accent"
                : "text-muted hover:bg-panel-raised hover:text-ink"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function NavSkeleton() {
  return <div className="h-8 w-64 rounded-lg bg-panel-raised/60" aria-hidden />;
}

export function SignOutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  return (
    <button
      type="button"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        await fetch("/api/auth/logout", { method: "POST" });
        router.push("/");
        router.refresh();
      }}
      className="rounded-lg border border-line px-3 py-1.5 text-sm text-muted transition hover:border-bad/40 hover:text-bad disabled:opacity-50"
    >
      {pending ? "Signing out…" : "Sign out"}
    </button>
  );
}
