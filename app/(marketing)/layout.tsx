// app/(public)/layout.tsx
"use client";

import Link from "next/link";
import React from "react";

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold text-slate-200">
      {children}
    </span>
  );
}

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-50">
      {/* ✅ Public Nav (only once) */}
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
              href="/dashboard/connect"
              className="rounded-full bg-emerald-400 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-emerald-300"
            >
              Get started
            </Link>
          </div>
        </nav>
      </header>

      {/* optional little “trust strip” */}
      <div className="mx-auto max-w-6xl px-4 pt-6">
        <div className="flex flex-wrap gap-2">
          <Pill>Clinician-first</Pill>
          <Pill>Cancel anytime</Pill>
          <Pill>No hype</Pill>
        </div>
      </div>

      {children}
    </div>
  );
}
