// app/colleges/page.tsx
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
  eyebrow,
  children,
  ctaLabel,
  ctaHref,
  highlight,
}: {
  title: string;
  eyebrow?: string;
  children: React.ReactNode;
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
      {eyebrow ? (
        <div className="text-[11px] font-semibold text-emerald-200/90">
          {eyebrow}
        </div>
      ) : null}

      <div className="mt-2 text-xl font-semibold text-slate-50">{title}</div>

      <div className="mt-4 text-sm text-slate-300 leading-relaxed">{children}</div>

      <div className="mt-7">
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
      </div>
    </div>
  );
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2 text-sm text-slate-300">
      <span className="mt-[7px] inline-block h-1.5 w-1.5 rounded-full bg-emerald-300/90" />
      <span className="leading-relaxed">{children}</span>
    </li>
  );
}

export default function CollegesPage() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-12 md:py-16 space-y-14">
      {/* Hero */}
      <section className="space-y-6">
        <div className="flex flex-wrap items-center gap-2">
          <Pill>Training providers</Pill>
          <Pill>Cohorts</Pill>
          <Pill>Student support</Pill>
          <Pill>Placement-ready visibility</Pill>
        </div>

        <h1 className="text-4xl md:text-5xl font-semibold tracking-tight leading-[1.05]">
          Help students become visible — without turning them into marketers
        </h1>

        <p className="text-base md:text-lg text-slate-300 leading-relaxed max-w-3xl">
          Many students and newly qualified clinicians freeze at outreach.
          Root Health Ops gives them a calm, guided way to build a professional
          presence and publish consistently — with safeguards, templates, and a
          simple “done-for-you” rhythm.
        </p>

        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/dashboard/connect"
            className="inline-flex items-center justify-center rounded-full bg-emerald-400 px-6 py-3 text-sm font-semibold text-slate-950 hover:bg-emerald-300"
          >
            Explore the platform
          </Link>

          <Link
            href="/how-it-works"
            className="inline-flex items-center justify-center rounded-full border border-white/10 bg-white/5 px-6 py-3 text-sm font-semibold text-slate-100 hover:bg-white/10"
          >
            See how it works
          </Link>
        </div>
      </section>

      {/* The “subsidy” model explained (your idea, done cleanly) */}
      <section className="rounded-[40px] border border-white/10 bg-black/20 p-7 md:p-10 space-y-6">
        <h2 className="text-2xl md:text-3xl font-semibold tracking-tight">
          The simple cohort offer (no awkward money talk)
        </h2>

        <p className="text-sm md:text-base text-slate-300 leading-relaxed max-w-3xl">
          Colleges often want to support students for the first few months — but
          students don’t need to feel like they’re on a “special deal”.
          We can run a cohort plan where students simply see a reduced price for
          a fixed period, while the institution can frame it as support.
        </p>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
            <div className="text-sm font-semibold text-slate-50">Option A</div>
            <div className="mt-1 text-[12px] text-slate-400">
              Cohort half-price for 6 months
            </div>
            <ul className="mt-4 space-y-2">
              <Bullet>Students pay 50% for 6 months</Bullet>
              <Bullet>College can frame as “supported start”</Bullet>
              <Bullet>Simple, no invoicing complexity</Bullet>
            </ul>
          </div>

          <div className="rounded-3xl border border-emerald-400/30 bg-emerald-400/10 p-5">
            <div className="text-sm font-semibold text-slate-50">Option B</div>
            <div className="mt-1 text-[12px] text-slate-400">
              Free “onramp” month + reduced months
            </div>
            <ul className="mt-4 space-y-2">
              <Bullet>Month 1 free to remove friction</Bullet>
              <Bullet>Then reduced price for 3–6 months</Bullet>
              <Bullet>Best for anxious / overwhelmed cohorts</Bullet>
            </ul>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
            <div className="text-sm font-semibold text-slate-50">Option C</div>
            <div className="mt-1 text-[12px] text-slate-400">
              Bulk seats (simple cap)
            </div>
            <ul className="mt-4 space-y-2">
              <Bullet>Fixed number of seats per intake</Bullet>
              <Bullet>Predictable budgeting</Bullet>
              <Bullet>Easy to renew per term</Bullet>
            </ul>
          </div>
        </div>

        <div className="text-[12px] text-slate-400">
          We’ll keep this human: no “sales-y” language, no pressure, and no
          extra admin for your faculty.
        </div>
      </section>

      {/* What colleges get */}
      <section className="grid gap-6 lg:grid-cols-3">
        <Card
          eyebrow="For the institution"
          title="A calmer student outcome"
          ctaLabel="Request a cohort pack"
          ctaHref="/dashboard/connect"
          highlight
        >
          Students build a professional presence steadily — without spam, hype,
          or burnout. The goal isn’t “marketing”, it’s readiness: confidence,
          clarity, and ethical visibility.
        </Card>

        <Card
          eyebrow="For students"
          title="Guardrails + structure"
          ctaLabel="See the workflow"
          ctaHref="/how-it-works"
        >
          Templates, story prompts, and scheduling so students aren’t staring at
          a blank page. They can generate, edit, and post in a guided way.
        </Card>

        <Card
          eyebrow="For placement readiness"
          title="A consistent public footprint"
          ctaLabel="View pricing"
          ctaHref="/pricing"
        >
          The most painful gap for students is “I’m qualified but invisible.”
          Root Health Ops helps them show up consistently while they focus on
          learning and client work.
        </Card>
      </section>

      {/* Implementation steps */}
      <section className="rounded-[40px] border border-white/10 bg-white/5 p-7 md:p-10 space-y-6">
        <h2 className="text-2xl md:text-3xl font-semibold tracking-tight">
          How a cohort rolls out
        </h2>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-3xl border border-white/10 bg-black/20 p-5">
            <div className="text-sm font-semibold text-slate-50">1) Intake</div>
            <div className="mt-2 text-sm text-slate-300 leading-relaxed">
              You share your cohort size and start date. We give you a simple
              pack: explanation, links, and a suggested “first week” workflow.
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-black/20 p-5">
            <div className="text-sm font-semibold text-slate-50">2) Connect</div>
            <div className="mt-2 text-sm text-slate-300 leading-relaxed">
              Students connect their social channels once. After that, they can
              write, schedule, and publish without tech headaches.
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-black/20 p-5">
            <div className="text-sm font-semibold text-slate-50">3) Routine</div>
            <div className="mt-2 text-sm text-slate-300 leading-relaxed">
              A simple rhythm: one idea → a post (or series) → scheduled. The
              system keeps visibility going while they study and practice.
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/dashboard/connect"
            className="inline-flex items-center justify-center rounded-full bg-emerald-400 px-6 py-3 text-sm font-semibold text-slate-950 hover:bg-emerald-300"
          >
            Get the cohort pack
          </Link>
          <Link
            href="/pricing"
            className="inline-flex items-center justify-center rounded-full border border-white/10 bg-white/5 px-6 py-3 text-sm font-semibold text-slate-100 hover:bg-white/10"
          >
            See pricing
          </Link>
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
  );
}
