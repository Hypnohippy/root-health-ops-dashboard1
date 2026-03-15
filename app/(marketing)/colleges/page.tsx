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

      <div className="mt-4 text-sm text-slate-300 leading-relaxed">
        {children}
      </div>

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

function BenefitBlock({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-3xl border border-white/10 bg-black/20 p-5">
      <div className="text-sm font-semibold text-slate-50">{title}</div>
      <div className="mt-2 text-sm text-slate-300 leading-relaxed">
        {children}
      </div>
    </div>
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

      {/* Cohort offer */}
      <section className="rounded-[40px] border border-white/10 bg-black/20 p-7 md:p-10 space-y-8">
        <div className="space-y-4">
          <h2 className="text-2xl md:text-3xl font-semibold tracking-tight">
            The simple cohort offer
          </h2>

          <p className="text-sm md:text-base text-slate-300 leading-relaxed max-w-3xl">
            Colleges often want to support students for the first few months —
            but students do not need to feel like they are on a “special deal”.
            We keep this simple: students just see a reduced price for a fixed
            period, while the institution can frame it as a supported start.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-[32px] border border-emerald-400/30 bg-gradient-to-br from-emerald-400/12 via-white/5 to-white/5 p-6 md:p-7">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-emerald-200/90">
              Option A
            </div>

            <div className="mt-2 text-2xl md:text-3xl font-semibold text-slate-50">
              Cohort half-price for 6 months
            </div>

            <div className="mt-4 text-sm text-slate-300 leading-relaxed">
              A clean, supportive offer for students starting to build their
              professional presence. No awkward money structure, no bulky admin,
              and no confusing plans to explain.
            </div>

            <ul className="mt-6 space-y-3">
              <Bullet>Students pay 50% for 6 months</Bullet>
              <Bullet>College can frame it as a “supported start”</Bullet>
              <Bullet>Simple to communicate to each intake</Bullet>
              <Bullet>No complex invoicing structure to manage</Bullet>
              <Bullet>Helps reduce the panic of “I’m qualified but invisible”</Bullet>
            </ul>

            <div className="mt-7 flex flex-wrap gap-3">
              <Link
                href="/dashboard/connect"
                className="inline-flex items-center justify-center rounded-full bg-emerald-400 px-6 py-3 text-sm font-semibold text-slate-950 hover:bg-emerald-300"
              >
                Request a cohort pack
              </Link>

              <Link
                href="/pricing"
                className="inline-flex items-center justify-center rounded-full border border-white/10 bg-white/5 px-6 py-3 text-sm font-semibold text-slate-100 hover:bg-white/10"
              >
                See pricing
              </Link>
            </div>
          </div>

          <div className="space-y-4">
            <BenefitBlock title="Why this helps new therapists">
              Newly qualified clinicians often know how to practise — but not
              how to become visible in a calm, ethical way. Root Health Ops
              helps them begin with structure, not pressure.
            </BenefitBlock>

            <BenefitBlock title="Why colleges like it">
              It gives students practical support after training, without asking
              faculty to become marketers, tech support, or account managers.
              The message stays simple and human.
            </BenefitBlock>

            <BenefitBlock title="Why students actually use it">
              It removes the blank-page problem. Students can generate ideas,
              turn them into posts, schedule them, and keep showing up
              consistently while they focus on study, placement, and client
              work.
            </BenefitBlock>
          </div>
        </div>

        <div className="text-[12px] text-slate-400">
          We keep this human: no “sales-y” framing, no pressure on students, and
          no unnecessary admin for your faculty team.
        </div>
      </section>

      {/* Expanded benefits */}
      <section className="space-y-6">
        <div className="max-w-3xl space-y-3">
          <h2 className="text-2xl md:text-3xl font-semibold tracking-tight">
            Why this matters for student confidence and early career readiness
          </h2>
          <p className="text-sm md:text-base text-slate-300 leading-relaxed">
            The biggest problem for many students is not capability — it is
            visibility. They may be thoughtful, ethical, and well-trained, but
            still feel stuck when it comes to showing who they are, what they
            care about, and how they help. Root Health Ops gives them a calmer
            bridge between training and real-world visibility.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <BenefitBlock title="Less overwhelm">
            Students are not left staring at an empty screen wondering what to
            say. Prompts, templates, and simple routines reduce decision fatigue.
          </BenefitBlock>

          <BenefitBlock title="Ethical visibility">
            This is not about hype or self-promotion. It is about helping future
            therapists present themselves clearly, professionally, and with good
            boundaries.
          </BenefitBlock>

          <BenefitBlock title="Placement readiness">
            A steadier public presence can help students feel more prepared for
            placement, first roles, referrals, and professional opportunities.
          </BenefitBlock>

          <BenefitBlock title="Confidence through rhythm">
            Instead of relying on motivation, students build a simple repeatable
            habit: one idea, one post, one small step at a time.
          </BenefitBlock>
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
          or burnout. The goal is not “marketing”, it is readiness: confidence,
          clarity, ethical visibility, and a stronger bridge into early
          practice.
        </Card>

        <Card
          eyebrow="For students"
          title="Guardrails + structure"
          ctaLabel="See the workflow"
          ctaHref="/how-it-works"
        >
          Templates, story prompts, and scheduling support mean students are not
          left guessing. They can generate, edit, and post in a guided way that
          feels manageable rather than performative.
        </Card>

        <Card
          eyebrow="For placement readiness"
          title="A more visible starting point"
          ctaLabel="View pricing"
          ctaHref="/pricing"
        >
          One of the hardest early-career problems is: “I’m qualified, but no
          one knows I exist.” Root Health Ops helps students begin building a
          consistent professional footprint while they are still learning and
          growing.
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
              You share your cohort size and start date. We provide a simple
              pack with the explanation, the links, and a suggested first-week
              workflow.
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-black/20 p-5">
            <div className="text-sm font-semibold text-slate-50">2) Connect</div>
            <div className="mt-2 text-sm text-slate-300 leading-relaxed">
              Students connect their channels once. After that, they can write,
              schedule, and publish without battling unnecessary tech friction.
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-black/20 p-5">
            <div className="text-sm font-semibold text-slate-50">3) Routine</div>
            <div className="mt-2 text-sm text-slate-300 leading-relaxed">
              A simple rhythm: one idea → one post (or short series) →
              scheduled. The system helps visibility continue steadily alongside
              learning, placement, and practice.
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
