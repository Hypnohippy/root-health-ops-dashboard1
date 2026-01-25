// app/pricing/page.tsx
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

function Feature({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2 text-sm text-slate-200">
      <span className="mt-[6px] inline-block h-1.5 w-1.5 rounded-full bg-emerald-300/90" />
      <span className="text-slate-300 leading-relaxed">{children}</span>
    </li>
  );
}

function PriceCard({
  badge,
  title,
  price,
  subtitle,
  features,
  ctaLabel,
  ctaHref,
  highlight,
}: {
  badge?: string;
  title: string;
  price: string;
  subtitle: string;
  features: React.ReactNode[];
  ctaLabel: string;
  ctaHref: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={[
        "rounded-[32px] border p-7 shadow-[0_20px_90px_rgba(0,0,0,0.35)]",
        highlight
          ? "border-emerald-400/40 bg-gradient-to-br from-emerald-400/15 via-white/5 to-white/5"
          : "border-white/10 bg-white/5",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xl font-semibold text-slate-50">{title}</div>
          <div className="mt-1 text-sm text-slate-300">{subtitle}</div>
        </div>
        {badge ? (
          <span className="inline-flex items-center rounded-full bg-emerald-400 px-3 py-1 text-[11px] font-extrabold text-slate-950">
            {badge}
          </span>
        ) : null}
      </div>

      <div className="mt-6">
        <div className="flex items-end gap-2">
          <div className="text-4xl font-semibold tracking-tight text-slate-50">
            {price}
          </div>
          <div className="pb-1 text-sm text-slate-400">/ month</div>
        </div>
        <div className="mt-2 text-[12px] text-slate-400">
          Simple monthly pricing. Cancel anytime.
        </div>
      </div>

      <ul className="mt-6 space-y-3">{features.map((f, i) => <Feature key={i}>{f}</Feature>)}</ul>

      <div className="mt-8">
        <Link
          href={ctaHref}
          className={[
            "inline-flex w-full items-center justify-center rounded-full px-5 py-3 text-sm font-semibold transition",
            highlight
              ? "bg-emerald-400 text-slate-950 hover:bg-emerald-300"
              : "border border-white/10 bg-white/5 text-slate-100 hover:bg-white/10",
          ].join(" ")}
        >
          {ctaLabel}
        </Link>

        <div className="mt-3 text-center text-[11px] text-slate-500">
          No pressure. Set up takes minutes.
        </div>
      </div>
    </div>
  );
}

export default function PricingPage() {
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
              className="rounded-full px-4 py-2 text-xs font-semibold text-slate-200 hover:bg-white/10"
            >
              How it works
            </Link>
            <Link
              href="/pricing"
              className="rounded-full bg-white/10 px-4 py-2 text-xs font-semibold text-slate-100"
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

      <main className="mx-auto max-w-6xl px-4 py-12 md:py-16 space-y-14">
        {/* Hero */}
        <section className="space-y-6">
          <div className="flex flex-wrap gap-2">
            <Pill>Clinician-first</Pill>
            <Pill>Cancel anytime</Pill>
            <Pill>No hype</Pill>
          </div>

          <h1 className="text-4xl md:text-5xl font-semibold tracking-tight leading-[1.05]">
            Pricing that respects real life
          </h1>

          <p className="text-base md:text-lg text-slate-300 leading-relaxed max-w-3xl">
            Therapists shouldn’t need a marketing degree (or extra stress) to
            stay visible. Root Health Ops is built to reduce overwhelm and help
            you show up consistently — in a way that still feels human.
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/dashboard/connect"
              className="inline-flex items-center justify-center rounded-full bg-emerald-400 px-6 py-3 text-sm font-semibold text-slate-950 hover:bg-emerald-300"
            >
              Start in minutes
            </Link>
            <Link
              href="/how-it-works"
              className="inline-flex items-center justify-center rounded-full border border-white/10 bg-white/5 px-6 py-3 text-sm font-semibold text-slate-100 hover:bg-white/10"
            >
              See how it works
            </Link>
          </div>
        </section>

        {/* Cards */}
        <section className="grid gap-6 lg:grid-cols-3">
          <PriceCard
            title="Solo"
            subtitle="For a single clinician who wants calm momentum."
            price="£49"
            features={[
              <>Connect your channels once</>,
              <>Create Stories and edit before publishing</>,
              <>Schedule posts so visibility stays steady</>,
              <>Queue view with clear “sent / scheduled / failed” status</>,
              <>Built to reduce overwhelm, not add tasks</>,
            ]}
            ctaLabel="Choose Solo"
            ctaHref="/dashboard/connect"
          />

          <PriceCard
            badge="Most popular"
            title="Growth"
            subtitle="For clinicians rebuilding confidence and consistency."
            price="£99"
            highlight
            features={[
              <>Everything in Solo</>,
              <>More structure for content themes and series</>,
              <>Deeper scheduling workflows (steady drumbeat)</>,
              <>Priority help getting set up</>,
              <>Designed for sustainable practice growth</>,
            ]}
            ctaLabel="Choose Growth"
            ctaHref="/dashboard/connect"
          />

          <PriceCard
            title="Team"
            subtitle="For multi-practitioner practices and collectives."
            price="£199"
            features={[
              <>Everything in Growth</>,
              <>Organisation-first setup</>,
              <>Shared visibility workflows</>,
              <>Priority support</>,
              <>Best for clinics, groups, and larger teams</>,
            ]}
            ctaLabel="Talk to us"
            ctaHref="/colleges"
          />
        </section>

        {/* Price vs “cheap tools” objection handling */}
        <section className="rounded-[32px] border border-white/10 bg-white/5 p-8 md:p-10">
          <div className="grid gap-8 lg:grid-cols-2 lg:items-start">
            <div>
              <div className="text-2xl md:text-3xl font-semibold tracking-tight">
                “But I’ve seen tools starting at £19…”
              </div>
              <p className="mt-3 text-sm text-slate-300 leading-relaxed">
                Totally fair. When money is tight, it’s normal to choose the
                cheapest option — even when it doesn’t actually help.
              </p>
              <p className="mt-3 text-sm text-slate-300 leading-relaxed">
                Root Health Ops is priced around one session per month, because
                it’s designed to give you something different: a calm system you
                can rely on — not another platform you have to wrestle.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Pill>Less admin energy</Pill>
                <Pill>More consistency</Pill>
                <Pill>Feels human</Pill>
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-black/20 p-6">
              <div className="text-sm font-semibold text-slate-50">
                The simple ROI test
              </div>
              <p className="mt-2 text-sm text-slate-300 leading-relaxed">
                If Root Health Ops helps you retain or gain just{" "}
                <span className="text-slate-50 font-semibold">
                  one extra client/session per month
                </span>
                , it pays for itself — while reducing stress.
              </p>

              <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="text-[12px] text-slate-400">Example</div>
                <div className="mt-1 text-sm text-slate-200">
                  1 session/month saved or gained → covers the subscription
                </div>
              </div>

              <div className="mt-5 flex flex-wrap gap-3">
                <Link
                  href="/dashboard/connect"
                  className="inline-flex items-center justify-center rounded-full bg-emerald-400 px-6 py-3 text-sm font-semibold text-slate-950 hover:bg-emerald-300"
                >
                  Get started
                </Link>
                <Link
                  href="/colleges"
                  className="inline-flex items-center justify-center rounded-full border border-white/10 bg-white/5 px-6 py-3 text-sm font-semibold text-slate-100 hover:bg-white/10"
                >
                  College options →
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="space-y-6">
          <div className="text-2xl md:text-3xl font-semibold tracking-tight">
            Common questions
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <div className="rounded-3xl border border-white/10 bg-black/20 p-6">
              <div className="text-sm font-semibold text-slate-50">
                Do I need to be “good at marketing”?
              </div>
              <div className="mt-2 text-sm text-slate-300 leading-relaxed">
                No. The goal is consistency without pressure. One idea becomes a
                post (or a series), and the schedule carries it forward.
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-black/20 p-6">
              <div className="text-sm font-semibold text-slate-50">
                Can I cancel anytime?
              </div>
              <div className="mt-2 text-sm text-slate-300 leading-relaxed">
                Yes. Simple monthly pricing, no lock-in.
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-black/20 p-6">
              <div className="text-sm font-semibold text-slate-50">
                What about colleges and cohorts?
              </div>
              <div className="mt-2 text-sm text-slate-300 leading-relaxed">
                We have a colleges route designed for cohorts and student
                onboarding. See the options on the Colleges page.
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
