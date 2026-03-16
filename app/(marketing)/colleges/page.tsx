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
      <section className="space-y-6">
        <div className="flex flex-wrap items-center gap-2">
          <Pill>Training providers</Pill>
          <Pill>Students + alumni</Pill>
          <Pill>Professional visibility</Pill>
          <Pill>Shared ecosystem</Pill>
        </div>

        <h1 className="text-4xl md:text-5xl font-semibold tracking-tight leading-[1.05]">
          Support students and alumni as they step into visible practice
        </h1>

        <p className="text-base md:text-lg text-slate-300 leading-relaxed max-w-3xl">
          Training providers shape thoughtful, skilled practitioners. Root
          Health Ops helps them develop a calm, ethical professional presence
          without feeling like they have to become marketers.
        </p>

        <p className="text-sm md:text-base text-slate-400 leading-relaxed max-w-3xl">
          Students and alumni gain structure for sharing ideas, expressing their
          values, and becoming visible in ways that reflect the profession they
          represent — while training providers remain connected to the
          communities they help create.
        </p>

        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/how-it-works"
            className="inline-flex items-center justify-center rounded-full bg-emerald-400 px-6 py-3 text-sm font-semibold text-slate-950 hover:bg-emerald-300"
          >
            Explore the platform
          </Link>

          <Link
            href="/pricing"
            className="inline-flex items-center justify-center rounded-full border border-white/10 bg-white/5 px-6 py-3 text-sm font-semibold text-slate-100 hover:bg-white/10"
          >
            See pricing
          </Link>

          <Link
            href="/cohort"
            className="inline-flex items-center justify-center rounded-full border border-emerald-400/30 bg-emerald-400/10 px-6 py-3 text-sm font-semibold text-emerald-200 hover:bg-emerald-400/15"
          >
            Student with a community code?
          </Link>
        </div>
      </section>

      <section className="rounded-[40px] border border-white/10 bg-black/20 p-7 md:p-10 space-y-8">
        <div className="space-y-4">
          <h2 className="text-2xl md:text-3xl font-semibold tracking-tight">
            A shared professional infrastructure
          </h2>

          <p className="text-sm md:text-base text-slate-300 leading-relaxed max-w-3xl">
            Root Health Ops acts as a shared operational layer for professional
            visibility. Practitioners can write, schedule, and publish ideas
            thoughtfully across platforms while maintaining the tone, values,
            and ethics of their profession.
          </p>

          <p className="text-sm md:text-base text-slate-400 leading-relaxed max-w-3xl">
            Training providers remain connected to the communities they help
            create, supporting students, graduates, and alumni as they move into
            visible practice.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <BenefitBlock title="For training providers">
            Support students and alumni beyond qualification, without asking
            faculty to become marketers, tech support, or account managers.
          </BenefitBlock>

          <BenefitBlock title="For practitioners">
            Build a professional presence calmly and ethically, with structure
            that reduces overwhelm and turns visibility into a steady rhythm.
          </BenefitBlock>

          <BenefitBlock title="For the wider community">
            Strengthen the connection between thoughtful practitioners and the
            communities they serve by making professional voices easier to find.
          </BenefitBlock>
        </div>
      </section>

      <section
        id="cohort-offer"
        className="rounded-[40px] border border-white/10 bg-black/20 p-7 md:p-10 space-y-8"
      >
        <div className="space-y-4">
          <h2 className="text-2xl md:text-3xl font-semibold tracking-tight">
            A supported start for students and alumni
          </h2>

          <p className="text-sm md:text-base text-slate-300 leading-relaxed max-w-3xl">
            Training providers can offer Root Health Ops to students and alumni
            through a private enrolment route. Each institution receives a
            community code that can be shared with graduating cohorts, current
            students, or alumni networks.
          </p>

          <p className="text-sm md:text-base text-slate-400 leading-relaxed max-w-3xl">
            The goal is simple: help practitioners move from qualified but
            invisible to professionally visible and more confident — without
            adding pressure or complexity.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-[32px] border border-emerald-400/30 bg-gradient-to-br from-emerald-400/12 via-white/5 to-white/5 p-6 md:p-7">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-emerald-200/90">
              Supported start
            </div>

            <div className="mt-2 text-2xl md:text-3xl font-semibold text-slate-50">
              50% access for the first 6 months
            </div>

            <div className="mt-4 text-sm text-slate-300 leading-relaxed">
              A calm, practical way to support students and alumni as they begin
              developing a professional presence. The offer is private,
              intentional, and simple to communicate.
            </div>

            <ul className="mt-6 space-y-3">
              <Bullet>50% access for the first 6 months</Bullet>
              <Bullet>Private enrolment route for approved communities</Bullet>
              <Bullet>Simple distribution through cohort or alumni channels</Bullet>
              <Bullet>No complex invoicing or extra admin overhead</Bullet>
              <Bullet>
                A clearer bridge between training and early professional
                visibility
              </Bullet>
            </ul>

            <div className="mt-7 flex flex-wrap gap-3">
              <Link
                href="/pricing"
                className="inline-flex items-center justify-center rounded-full bg-emerald-400 px-6 py-3 text-sm font-semibold text-slate-950 hover:bg-emerald-300"
              >
                See public pricing
              </Link>

              <Link
                href="/cohort"
                className="inline-flex items-center justify-center rounded-full border border-white/10 bg-white/5 px-6 py-3 text-sm font-semibold text-slate-100 hover:bg-white/10"
              >
                Student community route
              </Link>
            </div>
          </div>

          <div className="space-y-4">
            <BenefitBlock title="Support the transition into practice">
              Many graduates leave training highly skilled but professionally
              invisible. Root Health Ops gives them a structured bridge between
              training and practice.
            </BenefitBlock>

            <BenefitBlock title="Strengthen alumni connection">
              Training providers remain part of the professional journey.
              Offering Root Health Ops to alumni helps maintain community beyond
              qualification.
            </BenefitBlock>

            <BenefitBlock title="Encourage thoughtful visibility">
              This is not about hype or sales pressure. It is about helping
              practitioners express ideas, values, and professional insight in a
              way that feels aligned and ethical.
            </BenefitBlock>
          </div>
        </div>

        <div className="text-[12px] text-slate-400">
          We keep this human: no “sales-y” framing, no pressure on students, and
          no unnecessary admin for your faculty team.
        </div>
      </section>

      <section className="space-y-6">
        <div className="max-w-3xl space-y-3">
          <h2 className="text-2xl md:text-3xl font-semibold tracking-tight">
            Why this matters for the wider professional ecosystem
          </h2>
          <p className="text-sm md:text-base text-slate-300 leading-relaxed">
            Root Health Ops is designed to bring the therapeutic ecosystem
            closer together. Training providers, practitioners, communities, and
            partners all play a role in how health is understood publicly.
          </p>
          <p className="text-sm md:text-base text-slate-400 leading-relaxed">
            By helping practitioners become visible in thoughtful ways, Root
            Health Ops strengthens the connection between the profession and the
            people it serves.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <BenefitBlock title="Less overwhelm">
            Practitioners are not left staring at an empty screen wondering what
            to say. Prompts, templates, and structured workflows reduce decision
            fatigue.
          </BenefitBlock>

          <BenefitBlock title="Ethical visibility">
            This is not about performance or self-promotion. It is about helping
            practitioners show up clearly, professionally, and with good
            boundaries.
          </BenefitBlock>

          <BenefitBlock title="Stronger alumni networks">
            Colleges and training providers can remain part of the professional
            journey by supporting the communities they have already helped form.
          </BenefitBlock>

          <BenefitBlock title="Confidence through rhythm">
            Instead of relying on motivation, people build a simple repeatable
            habit: one idea, one post, one conversation at a time.
          </BenefitBlock>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-3">
        <Card
          eyebrow="For the institution"
          title="A stronger community outcome"
          ctaLabel="See public pricing"
          ctaHref="/pricing"
          highlight
        >
          Support does not need to stop at qualification. Root Health Ops helps
          training providers stay connected to students and alumni while
          strengthening their transition into visible, confident practice.
        </Card>

        <Card
          eyebrow="For students and alumni"
          title="A calmer way to become visible"
          ctaLabel="See how it works"
          ctaHref="/how-it-works"
        >
          Practitioners can develop a professional presence without feeling like
          they have to become marketers. The process stays structured, calm, and
          aligned with the profession they represent.
        </Card>

        <Card
          eyebrow="For approved communities"
          title="Private enrolment route"
          ctaLabel="Open community enrolment"
          ctaHref="/cohort"
        >
          Approved groups use a separate enrolment route with a private code.
          That keeps public pricing clean while still giving training providers
          a clear supported-start path for students and alumni.
        </Card>
      </section>

      <section className="rounded-[40px] border border-white/10 bg-white/5 p-7 md:p-10 space-y-6">
        <h2 className="text-2xl md:text-3xl font-semibold tracking-tight">
          How a community rollout works
        </h2>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-3xl border border-white/10 bg-black/20 p-5">
            <div className="text-sm font-semibold text-slate-50">1) Setup</div>
            <div className="mt-2 text-sm text-slate-300 leading-relaxed">
              You share your intake or community size and the start window. We
              provide a simple pack with the explanation, links, and a suggested
              first-step workflow.
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-black/20 p-5">
            <div className="text-sm font-semibold text-slate-50">
              2) Enrolment
            </div>
            <div className="mt-2 text-sm text-slate-300 leading-relaxed">
              Students or alumni use their private community route and code to
              begin. The process stays simple and does not rely on public offers
              or coupon hunting.
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-black/20 p-5">
            <div className="text-sm font-semibold text-slate-50">3) Rhythm</div>
            <div className="mt-2 text-sm text-slate-300 leading-relaxed">
              The system helps practitioners build a steadier professional
              presence over time — one idea, one post, one conversation at a
              time.
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/pricing"
            className="inline-flex items-center justify-center rounded-full bg-emerald-400 px-6 py-3 text-sm font-semibold text-slate-950 hover:bg-emerald-300"
          >
            See public pricing
          </Link>
          <Link
            href="/cohort"
            className="inline-flex items-center justify-center rounded-full border border-white/10 bg-white/5 px-6 py-3 text-sm font-semibold text-slate-100 hover:bg-white/10"
          >
            Student community route
          </Link>
        </div>
      </section>
    </main>
  );
}
