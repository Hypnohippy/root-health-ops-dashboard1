// app/dashboard/layout.tsx
"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

type DashboardLayoutProps = {
  children: React.ReactNode;
};

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const pathname = usePathname();

  const linkClasses = (href: string) => {
    const isActive =
      pathname === href ||
      (href !== "/dashboard" && pathname.startsWith(href));

    return [
      "block rounded-md px-3 py-1.5 text-sm transition-colors",
      isActive
        ? "bg-emerald-400 text-slate-950"
        : "text-slate-100 hover:bg-white/10",
    ].join(" ");
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-50 flex flex-col">
      {/* Top Nav */}
      <header className="border-b border-white/10 bg-black/30 backdrop-blur-xl">
        <nav className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          {/* Brand */}
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-xl bg-emerald-400/80 shadow-lg shadow-emerald-500/40" />
            <div className="flex flex-col leading-tight">
              <span className="text-sm font-semibold text-slate-50">
                Root Health Ops
              </span>
              <span className="text-[11px] text-slate-300">
                Your cockpit for growth
              </span>
            </div>
          </div>

          {/* Nav links */}
          <ul className="flex items-center gap-2 flex-wrap justify-end">
            <li>
              <Link href="/dashboard" className={linkClasses("/dashboard")}>
                Home
              </Link>
            </li>
            <li>
              <Link
                href="/dashboard/connect"
                className={linkClasses("/dashboard/connect")}
              >
                Connect
              </Link>
            </li>
            <li>
              <Link
                href="/dashboard/metrics"
                className={linkClasses("/dashboard/metrics")}
              >
                Metrics
              </Link>
            </li>
            <li>
              <Link
                href="/dashboard/campaigns"
                className={linkClasses("/dashboard/campaigns")}
              >
                Campaigns
              </Link>
            </li>
            <li>
              <Link
                href="/dashboard/sequences"
                className={linkClasses("/dashboard/sequences")}
              >
                Sequences
              </Link>
            </li>
            <li>
              <Link
                href="/dashboard/stories/new"
                className={linkClasses("/dashboard/stories/new")}
              >
                Stories
              </Link>
            </li>
            <li>
              <Link
                href="/dashboard/scheduled"
                className={linkClasses("/dashboard/scheduled")}
              >
                Scheduled
              </Link>
            </li>
            <li>
              <Link
                href="/dashboard/approvals"
                className={linkClasses("/dashboard/approvals")}
              >
                Approvals
              </Link>
            </li>
            <li>
              <Link
                href="/dashboard/responses"
                className={linkClasses("/dashboard/responses")}
              >
                Responses
              </Link>
            </li>
            <li>
              <Link
                href="/dashboard/brainstorm"
                className={linkClasses("/dashboard/brainstorm")}
              >
                🧠 Brainstorm
              </Link>
            </li>
          </ul>
        </nav>
      </header>

      {/* Main content */}
      <main className="flex-1 p-6">{children}</main>

      {/* App Footer (belt & braces legal links) */}
      <footer className="border-t border-white/10 py-4 text-[12px] text-slate-400">
        <div className="mx-auto max-w-6xl px-4 flex flex-col md:flex-row items-center justify-between gap-2">
          <div>© {new Date().getFullYear()} Root Health Ops</div>
          <div className="flex gap-4">
            <Link href="/terms" className="hover:text-slate-200">
              Terms of Service
            </Link>
            <Link href="/privacy" className="hover:text-slate-200">
              Privacy Policy
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
