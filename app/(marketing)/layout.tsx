// app/(marketing)/layout.tsx
import Link from "next/link";
import React from "react";

function safeYear() {
  try {
    return new Date().getFullYear();
  } catch {
    return 2026;
  }
}

function PublicNav() {
  return (
    <header className="sticky top-0 z-20 border-b border-white/10 bg-black/30 backdrop-blur-xl">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
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

        <div className="flex items-center gap-2 flex-wrap justify-end">
          <Link
            href="/how-it-works"
            className="rounded-full px-4 py-2 text-xs font-semibold text-slate-200 hover:bg-white/10"
          >
            How it works
          </Link>
          <Link
            href="/pricing"
            className="rounded-full px-4 py-2 text-xs font-semibold text-slate-200 hover:bg-white/10"
          >
            Pricing
          </Link>
          <Link
            href="/colleges"
            className="rounded-full px-4 py-2 text-xs font-semibold text-slate-200 hover:bg-white/10"
          >
            Colleges
          </Link>

          <Link
            href="/dashboard"
            className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-slate-100 hover:bg-white/10"
          >
            Sign in
          </Link>
          <Link
            href="/get-started"
            className="rounded-full bg-emerald-400 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-emerald-300"
          >
            Get started
          </Link>
        </div>
      </nav>
    </header>
  );
}

function PublicFooter() {
  return (
    <footer className="border-t border-white/10 pt-8 pb-10 text-[12px] text-slate-400">
      <div className="mx-auto max-w-6xl px-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>© {safeYear()} Root Health Ops</div>
          <div className="flex flex-wrap gap-3">
            <Link href="/" className="hover:text-slate-200">
              Home
            </Link>
            <Link href="/how-it-works" className="hover:text-slate-200">
              How it works
            </Link>
            <Link href="/pricing" className="hover:text-slate-200">
              Pricing
            </Link>
            <Link href="/colleges" className="hover:text-slate-200">
              Colleges
            </Link>
            <Link href="/dashboard" className="hover:text-slate-200">
              Dashboard
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-50">
      <PublicNav />
      {children}
      <PublicFooter />
    </div>
  );
}
