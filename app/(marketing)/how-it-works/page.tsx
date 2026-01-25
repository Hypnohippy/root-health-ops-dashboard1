// app/how-it-works/page.tsx
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

function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-[0_20px_80px_rgba(0,0,0,0.35)]">
      <div className="text-base font-semibold text-slate-50">{title}</div>
      <div className="mt-2 text-sm text-slate-300 leading-relaxed">
        {children}
      </div>
    </div>
  );
}

function Step({
  n,
  title,
  children,
}: {
  n: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-3xl border border-white/10 bg-black/20 p-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-2xl bg-emerald-400/80 text-slate-950 font-extrabold grid place-items-center shadow-lg shadow-emerald-500/30">
            {n}
          </div>
          <div className="text-base font-semibold text-slate-50">{title}</div>
        </div>
        <Pill>Simple</Pill>
      </div>
      <div className="mt-3 text-sm text-slate-300 leading-relaxed">
        {children}
      </div>
    </div>
  );
}

export default function HowItWorksPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-50">
      {/* Public Nav */}
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
              className="rounded-full bg-white/10 px-4 py-2 text-xs font-semibold text-slate-100"
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

      <main className="mx-auto max-w-6xl px-4 py-12 md:py-16 space-y-12">
        {/* Hero */}
        <section className="space-y-6">
          <div className="flex flex-wrap gap-2">
            <Pill>Designed for clinicians</Pill>
            <Pill>Low-friction</Pill>
            <Pill>Values-led visibility</Pill>
          </div>

          <h1 className="text-4xl md:text-5xl font-semibold tracking-tight leading-[1.05]">
            How Root Health Ops works —{" "}
            <span className="text-emerald-300">calm, simple, consistent</span>
          </h1>

          <p className="text-base md:text-lg text-slate-300 leading-relaxed max-w-3xl">
            Most therapists don’t need “more marketing”. They need a system that
            helps them show up without draining their energy — and keeps running
            even when life gets busy.
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/dashboard/connect"
              className="inline-flex items-center justify-center rounded-full bg-emerald-400 px-6 py-3 text-sm font-semibold text-slate-950 hover:bg-emerald-300"
            >
              Connect your channels
            </Link>
            <Link
              href="/pricing"
              className="inline-flex items-center justify-center rounded-full border border-white/10 bg-white/5 px-6 py-3 text-sm font-semibold text-slate-100 hover:bg-white/10"
            >
              View pricing
            </Link>
          </div>
        </section>

        {/* 3-step flow */}
        <section className="grid gap-6 lg:grid-cols-3">
          <Step n="1" title="Connect once">
            Link your practice channels (LinkedIn, Facebook, Instagram, Threads,
            etc.) inside the dashboard. After that, you don’t need to juggle
            tabs, logins, or copy/paste routines.
          </Step>

          <Step n="2" title="Create in a calm space">
            Use Stories to turn a simple idea into posts you can edit. Keep it
            human. Keep it aligned. You stay in control — nothing goes out
            without your intent.
          </Step>

          <Step n="3" title="Schedule and let it run">
            Queue posts so your visibility stays consistent while you sleep,
            while you work, and while you’re with clients. The system handles
            the “steady drumbeat” so you don’t have to.
          </Step>
        </section>

        {/* What you get (truthful to what exists now) */}
        <section className="space-y-6">
          <div className="flex items-end justify-between gap-4 flex-wrap">
            <div>
              <div className="text-2xl md:text-3xl font-semibold tracking-tight">
                What you can do today
              </div>
              <div className="mt-2 text-sm text-slate-300 max-w-3xl">
                This is the real, live feature set in your Ops dashboard right
                now — no fluff.
              </div>
            </div>
            <Pill>Live features</Pill>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <Card title="Stories generator">
              Generate a single post or a short series from one idea, then edit
              before publishing. It’s built to reduce “blank page” fatigue.
            </Card>

            <Card title="Direct posting">
              Publish to connected channels from one place (no bouncing between
              apps). Your posting routes are now direct — not reliant on
              third-party posting caps.
            </Card>

            <Card title="Scheduling that actually sends">
              Schedule posts and let the dispatcher deliver them. The scheduled
              queue shows status so you can trust what’s going out.
            </Card>

            <Card title="Brainstorm space">
              A calm place to shape message direction, angles, and themes —
              especially helpful when confidence is low.
            </Card>

            <Card title="Queue visibility">
              See upcoming and past posts in the Scheduled view, with clear
              status tags (“scheduled”, “sent”, “failed”).
            </Card>

            <Card title="Connect page">
              Manage your connected accounts in one place. Reconnect when a
              token expires — quickly, without drama.
            </Card>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
            <div className="text-sm font-semibold text-slate-50">
              What this is not (and why)
            </div>
            <div className="mt-2 text-sm text-slate-300 leading-relaxed">
              Root Health Ops isn’t trying to turn clinicians into advertisers.
              We’re building a system that supports ethical visibility —
              consistent, grounded, and sustainable.
            </div>
          </div>
        </section>

        {/* Anxiety-aware section */}
        <section className="rounded-[32px] border border-white/10 bg-gradient-to-br from-emerald-400/15 via-white/5 to-white/5 p-8 md:p-10">
          <div className="grid gap-6 lg:grid-cols-2 lg:items-center">
            <div>
              <div className="text-2xl md:text-3xl font-semibold tracking-tight">
                If money is tight, you still deserve momentum.
              </div>
              <p className="mt-2 text-sm text-slate-300 leading-relaxed">
                We’re designing this so one good idea can become a week of
                visibility — without draining you. Consistency should feel like
                support, not another burden.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Pill>Less overwhelm</Pill>
                <Pill>More consistency</Pill>
                <Pill>Stay human</Pill>
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-black/20 p-6">
              <div className="text-sm font-semibold text-slate-50">
                Want to record short demo videos?
              </div>
              <div className="mt-2 text-sm text-slate-300 leading-relaxed">
                Perfect. We’ll add a “Demo” section later where you can embed
                quick walkthrough clips (60–90 seconds) to show Stories,
                Scheduling, and Connect in action.
              </div>
              <div className="mt-4 flex flex-wrap gap-3">
                <Link
                  href="/pricing"
                  className="inline-flex items-center justify-center rounded-full bg-emerald-400 px-6 py-3 text-sm font-semibold text-slate-950 hover:bg-emerald-300"
                >
                  Next: Pricing →
                </Link>
                <Link
                  href="/"
                  className="inline-flex items-center justify-center rounded-full border border-white/10 bg-white/5 px-6 py-3 text-sm font-semibold text-slate-100 hover:bg-white/10"
                >
                  Back to home
                </Link>
              </div>
            </div>
          </div>
        </section>

        <footer className="border-t border-white/10 pt-8 pb-10 text-[12px] text-slate-400">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>© {new Date().getFullYear()} Root Health Ops</div>
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
        </footer>
      </main>
    </div>
  );
}
