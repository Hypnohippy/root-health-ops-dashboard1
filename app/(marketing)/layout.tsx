import Link from "next/link";
import React from "react";

export const runtime = "nodejs";

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="sticky top-0 z-50 border-b border-white/10 bg-black/30 backdrop-blur-xl">
        <nav className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          {/* Brand */}
          <Link href="/" className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-xl bg-emerald-400/80 shadow-lg shadow-emerald-500/40" />
            <div className="flex flex-col leading-tight">
              <span className="text-sm font-semibold text-slate-50">
                Root Health Ops
              </span>
              <span className="text-[11px] text-slate-300">
                Your cockpit for growth
              </span>
            </div>
          </Link>

          {/* Links */}
          <div className="hidden md:flex items-center gap-2">
            <Link
              href="/how-it-works"
              className="rounded-full px-3 py-2 text-sm text-slate-200 hover:bg-white/10"
            >
              How it works
            </Link>
            <Link
              href="/pricing"
              className="rounded-full px-3 py-2 text-sm text-slate-200 hover:bg-white/10"
            >
              Pricing
            </Link>
            <Link
              href="/colleges"
              className="rounded-full px-3 py-2 text-sm text-slate-200 hover:bg-white/10"
            >
              Colleges
            </Link>

            <div className="w-px h-6 bg-white/10 mx-1" />

            <Link
              href="/dashboard"
              className="rounded-full px-3 py-2 text-sm text-slate-200 hover:bg-white/10"
            >
              Dashboard
            </Link>

            <Link
              href="/dashboard/connect"
              className="rounded-full bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:opacity-90"
            >
              Get started
            </Link>
          </div>

          {/* Mobile */}
          <div className="md:hidden flex items-center gap-2">
            <Link
              href="/pricing"
              className="rounded-full border border-white/15 px-3 py-2 text-xs text-slate-100"
            >
              Pricing
            </Link>
            <Link
              href="/dashboard"
              className="rounded-full bg-emerald-500 px-3 py-2 text-xs font-semibold text-slate-950"
            >
              Dashboard
            </Link>
          </div>
        </nav>
      </header>

      <main>{children}</main>

      <footer className="border-t border-white/10">
        <div className="mx-auto max-w-6xl px-4 py-10 text-[11px] text-slate-500">
          © {new Date().getFullYear()} Root Health Ops · Built to stay human.
        </div>
      </footer>
    </div>
  );
}
