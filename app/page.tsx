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

function FeaturePanel({
  title,
  body,
}: {
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <div className="text-sm font-semibold text-slate-100">{title}</div>
      <div className="mt-1 text-[13px] text-slate-300">{body}</div>
    </div>
  );
}

function safeYear() {
  try {
    return new Date().getFullYear();
  } catch {
    return 2026;
  }
}

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-50">
      <header className="sticky top-0 z-20 border-b border-white/10 bg-black/30 backdrop-blur-xl">
        <nav className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link href="/" className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-xl bg-emerald-400/80 shadow-lg shadow-emerald-500/40" />
            <div className="flex flex-col leading-tight">
              <span className="text-sm font-semibold text-slate-50">
                Root Health Ops
              </span>
              <span className="text-[11px] text-slate-300">
                Calm professional visibility
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
              href="/signin"
              className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-slate-100 hover:bg-white/10"
            >
              Sign in
            </Link>
            <Link
              href="/pricing"
              className="rounded-full bg-emerald-400 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-emerald-300"
            >
              Get started
            </Link>
          </div>
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-12 md:py-16 space-y-12">
        <section className="grid gap-10 lg:grid-cols-2 lg:items-center">
          <div className="space-y-6">
            <div className="flex flex-wrap gap-2">
              <Pill>For practitioners, students, and alumni</Pill>
              <Pill>Calm professional visibility</Pill>
              <Pill>Built for the wider ecosystem</Pill>
            </div>

            <h1 className="text-4xl md:text-5xl font-semibold tracking-tight leading-[1.05]">
              A calmer way to become professionally visible —
              <span className="text-emerald-300">
                {" "}
                without becoming a marketing machine.
              </span>
            </h1>

            <p className="text-base md:text-lg text-slate-300 leading-relaxed">
              Root Health Ops helps practitioners, students, and alumni develop
              a steady professional presence in ways that still feel thoughtful,
              ethical, and human.
            </p>

            <p className="text-sm md:text-base text-slate-400 leading-relaxed max-w-3xl">
              It is designed to reduce friction, lower overwhelm, and help the
              wider health ecosystem stay more connected — from training
              providers and alumni communities to practitioners building visible
              practice in the real world.
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
                href="/colleges"
                className="inline-flex items-center justify-center rounded-full px-3 py-3 text-sm font-semibold text-slate-200 hover:bg-white/10"
              >
                Training providers →
              </Link>
            </div>

            <div className="text-[12px] text-slate-400 leading-relaxed">
              Root Health Ops is not built for hype. It is built for thoughtful
              professional visibility — so people can be found, communities can
              stay connected, and practice can grow without losing its values.
            </div>
          </div>

          <div className="rounded-[32px] border border-white/10 bg-white/5 p-6 md:p-8 shadow-[0_30px_120px_rgba(0,0,0,0.45)]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-slate-50">
                  What Root Health Ops supports
                </div>
                <div className="mt-1 text-xs text-slate-300">
                  Real workflows already inside the platform.
                </div>
              </div>
              <Pill>Live</Pill>
            </div>

            <div className="mt-6 grid gap-3">
              <FeaturePanel
                title="Develop ideas without the blank-page pressure"
                body="Turn thoughts, themes, and professional insights into structured drafts, prompts, and stories."
              />

              <FeaturePanel
                title="Schedule a steadier professional presence"
                body="Queue content so visibility continues during busy weeks, low-energy seasons, placement periods, or clinical work."
              />

              <FeaturePanel
                title="Stay aligned with your own voice"
                body="Edit and shape content before it goes live so the process stays reflective, human, and ethically grounded."
              />

              <FeaturePanel
                title="Support wider communities"
                body="Useful for practitioners, students, alumni groups, and training-provider communities who want a calmer route into public visibility."
              />
            </div>

            <div className="mt-6 text-[12px] text-slate-400">
              The goal is simple: one idea, one post, one conversation at a
              time.
            </div>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-3">
          <Card title="Built for the human reality">
            Most people do not need more noise, more tools, or more pressure.
            They need fewer decisions, less friction, and a structure that still
            works when energy is low.
          </Card>

          <Card title="Professional visibility without performance">
            Root Health Ops helps people become visible without pushing them into
            hype, hustle, or a version of themselves that feels false. The focus
            stays on thoughtful presence, not self-promotion.
          </Card>

          <Card title="A shared ecosystem, not just a solo tool">
            This is not only for individual practitioners. It also helps bring
            training providers, students, alumni, and wider professional
            communities into a more connected and supportive visibility journey.
          </Card>
        </section>

        <section className="rounded-[32px] border border-white/10 bg-gradient-to-br from-emerald-400/15 via-white/5 to-white/5 p-8 md:p-10">
          <div className="grid gap-6 lg:grid-cols-2 lg:items-center">
            <div>
              <div className="text-2xl md:text-3xl font-semibold tracking-tight">
                A calmer bridge between training and practice
              </div>
              <p className="mt-2 text-sm text-slate-300 leading-relaxed">
                Many practitioners leave training highly skilled but
                professionally invisible. Root Health Ops helps close that gap
                by creating a calmer path into public presence, professional
                rhythm, and community connection.
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
              <Link
                href="/colleges"
                className="inline-flex items-center justify-center rounded-full border border-white/10 bg-white/5 px-6 py-3 text-sm font-semibold text-slate-100 hover:bg-white/10"
              >
                Colleges
              </Link>
            </div>
          </div>
        </section>

        <footer className="border-t border-white/10 pt-8 pb-10 text-[12px] text-slate-400">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>© {safeYear()} Root Health Ops</div>
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
              <Link href="/terms" className="hover:text-slate-200">
                Terms of Service
              </Link>
              <Link href="/privacy" className="hover:text-slate-200">
                Privacy Policy
              </Link>
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
}
