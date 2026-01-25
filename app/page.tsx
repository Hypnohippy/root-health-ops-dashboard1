// app/page.tsx
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

export default function HomePage() {
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
                Run your practice. Stay human.
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

      {/* Hero */}
      <main className="mx-auto max-w-6xl px-4 py-12 md:py-16 space-y-12">
        <section className="grid gap-10 lg:grid-cols-2 lg:items-center">
          <div className="space-y-6">
            <div className="flex flex-wrap gap-2">
              <Pill>For therapists & coaches</Pill>
              <Pill>Calm, ethical growth</Pill>
              <Pill>Built to reduce overwhelm</Pill>
            </div>

            <h1 className="text-4xl md:text-5xl font-semibold tracking-tight leading-[1.05]">
              A calmer way to stay visible —
              <span className="text-emerald-300">
                {" "}
                without becoming a marketing machine.
              </span>
            </h1>

            <p className="text-base md:text-lg text-slate-300 leading-relaxed">
              Root Health Ops helps you show up consistently, protect your
              energy, and grow your practice in a way that still feels like{" "}
              <span className="text-slate-100 font-semibold">you</span>. Less
              admin. Less “selling”. More steady momentum.
            </p>

            <div className="flex flex-wrap items-center gap-3">
              <Link
                href="/pricing"
                className="inline-flex items-center justify-center rounded-full bg-emerald-400 px-6 py-3 text-sm font-semibold text-slate-950 hover:bg-emerald-300"
              >
                See pricing
              </Link>
              <Link
                href="/how-it-works"
                className="inline-flex items-center justify-center rounded-full border border-white/10 bg-white/5 px-6 py-3 text-sm font-semibold text-slate-100 hover:bg-white/10"
              >
                How it works
              </Link>
              <Link
                href="/dashboard"
                className="inline-flex items-center justify-center rounded-full px-3 py-3 text-sm font-semibold text-slate-200 hover:bg-white/10"
              >
                Go to dashboard →
              </Link>
            </div>

            <div className="text-[12px] text-slate-400 leading-relaxed">
              This isn’t “ad spam”. It’s a values-led system for visibility — so
              your clients can find you, and you can keep your focus where it
              belongs.
            </div>
          </div>

          <div className="rounded-[32px] border border-white/10 bg-white/5 p-6 md:p-8 shadow-[0_30px_120px_rgba(0,0,0,0.45)]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-slate-50">
                  What you can do today
                </div>
                <div className="mt-1 text-xs text-slate-300">
                  Real features already inside your dashboard.
                </div>
              </div>
              <Pill>Live</Pill>
            </div>

            <div className="mt-6 grid gap-3">
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="text-sm font-semibold text-slate-100">
                  Post across platforms
                </div>
                <div className="mt-1 text-[13px] text-slate-300">
                  Publish to your connected channels from one place.
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="text-sm font-semibold text-slate-100">
                  Schedule content while you sleep
                </div>
                <div className="mt-1 text-[13px] text-slate-300">
                  Queue posts so visibility stays consistent.
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="text-sm font-semibold text-slate-100">
                  Stories generator
                </div>
                <div className="mt-1 text-[13px] text-slate-300">
                  Turn ideas into posts you can edit, then send now or schedule.
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="text-sm font-semibold text-slate-100">
                  Brainstorm space
                </div>
                <div className="mt-1 text-[13px] text-slate-300">
                  A calm place to shape your message and stay aligned.
                </div>
              </div>
            </div>

            <div className="mt-6 text-[12px] text-slate-400">
              Next we’ll add a demo section so you can embed your short videos.
            </div>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-3">
          <Card title="Built for the human reality">
            Most clinicians don’t need “more tools”. They need fewer decisions,
            less friction, and support when energy is low.
          </Card>

          <Card title="Visibility without pressure">
            You don’t have to become someone else to grow. We focus on calm,
            ethical consistency — not hype, not hustle, not spam.
          </Card>

          <Card title="Designed to protect your focus">
            Let the platform do repetitive work so you can stay present with
            clients — and still build momentum.
          </Card>
        </section>

        <section className="rounded-[32px] border border-white/10 bg-gradient-to-br from-emerald-400/15 via-white/5 to-white/5 p-8 md:p-10">
          <div className="grid gap-6 lg:grid-cols-2 lg:items-center">
            <div>
              <div className="text-2xl md:text-3xl font-semibold tracking-tight">
                Ready to explore the journey?
              </div>
              <p className="mt-2 text-sm text-slate-300 leading-relaxed">
                Next we’ll fill:{" "}
                <span className="text-slate-100 font-semibold">How it works</span>,{" "}
                <span className="text-slate-100 font-semibold">Pricing</span>, and{" "}
                <span className="text-slate-100 font-semibold">Colleges</span>.
                Clear, compassionate copy that converts without feeling salesy.
              </p>
            </div>

            <div className="flex flex-wrap gap-3 lg:justify-end">
              <Link
                href="/how-it-works"
                className="inline-flex items-center justify-center rounded-full border border-white/10 bg-white/5 px-6 py-3 text-sm font-semibold text-slate-100 hover:bg-white/10"
              >
                How it works
              </Link>
              <Link
                href="/pricing"
                className="inline-flex items-center justify-center rounded-full bg-emerald-400 px-6 py-3 text-sm font-semibold text-slate-950 hover:bg-emerald-300"
              >
                Pricing
              </Link>
            </div>
          </div>
        </section>

        <footer className="border-t border-white/10 pt-8 pb-10 text-[12px] text-slate-400">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>© {new Date().getFullYear()} Root Health Ops</div>
            <div className="flex flex-wrap gap-3">
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
