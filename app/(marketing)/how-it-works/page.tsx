// app/(marketing)/how-it-works/page.tsx
import Link from "next/link";
import React from "react";

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold text-slate-200">
      {children}
    </span>
  );
}

function Step({
  num,
  title,
  body,
}: {
  num: string;
  title: string;
  body: React.ReactNode;
}) {
  return (
    <div className="rounded-3xl border border-white/10 bg-black/20 p-6">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 inline-flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-400/80 text-sm font-extrabold text-slate-950 shadow-lg shadow-emerald-500/30">
          {num}
        </div>
        <div>
          <div className="text-base font-semibold text-slate-50">{title}</div>
          <div className="mt-2 text-sm leading-relaxed text-slate-300">
            {body}
          </div>
        </div>
      </div>
    </div>
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
    <div className="rounded-3xl border border-white/10 bg-black/20 p-6">
      <div className="text-sm font-semibold text-slate-50">{title}</div>
      <div className="mt-2 text-sm leading-relaxed text-slate-300">
        {children}
      </div>
    </div>
  );
}

export default function HowItWorksPage() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-12 md:py-16 space-y-12">
      <section className="space-y-6">
        <div className="flex flex-wrap gap-2">
          <Pill>Designed for practitioners</Pill>
          <Pill>Calm professional visibility</Pill>
          <Pill>Students, alumni, clinicians</Pill>
          <Pill>No hype</Pill>
        </div>

        <h1 className="text-4xl md:text-5xl font-semibold tracking-tight leading-[1.05]">
          A calmer way to stay professionally visible
        </h1>

        <p className="max-w-3xl text-base md:text-lg text-slate-300 leading-relaxed">
          Root Health Ops helps practitioners share ideas, insights, and
          professional perspectives consistently — without turning the week into
          content admin.
        </p>

        <p className="max-w-3xl text-sm md:text-base text-slate-400 leading-relaxed">
          The system provides structure so visibility becomes a steady rhythm
          rather than a constant task. It is designed for students, alumni,
          clinicians, and training-provider communities who want a more ethical,
          thoughtful way to show up publicly.
        </p>

        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/pricing"
            className="inline-flex items-center justify-center rounded-full bg-emerald-400 px-6 py-3 text-sm font-semibold text-slate-950 hover:bg-emerald-300"
          >
            See pricing
          </Link>
          <Link
            href="/colleges"
            className="inline-flex items-center justify-center rounded-full border border-white/10 bg-white/5 px-6 py-3 text-sm font-semibold text-slate-100 hover:bg-white/10"
          >
            Training providers / colleges
          </Link>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-3">
        <Step
          num="1"
          title="Connect once"
          body={
            <>
              Practitioners connect their channels once and avoid the friction
              of redoing setup repeatedly. Root Health Ops is built to reduce
              operational drag, not add more of it.
            </>
          }
        />
        <Step
          num="2"
          title="Develop ideas"
          body={
            <>
              Instead of staring at a blank screen, practitioners can turn
              thoughts, insights, and professional themes into structured ideas,
              story prompts, and draft content.
            </>
          }
        />
        <Step
          num="3"
          title="Shape the message"
          body={
            <>
              Content can be edited and refined before anything goes live. This
              keeps the process human, reflective, and aligned with the
              practitioner’s voice rather than rushed or performative.
            </>
          }
        />
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <Step
          num="4"
          title="Schedule a steady presence"
          body={
            <>
              Posts can be scheduled so professional visibility continues during
              busy clinical weeks, placements, study periods, or lower-energy
              seasons. The result is steadier presence without constant effort.
            </>
          }
        />
        <Step
          num="5"
          title="Stay connected to the wider ecosystem"
          body={
            <>
              Root Health Ops helps practitioners remain part of a wider
              professional ecosystem that includes training providers, alumni
              communities, practice networks, and health partners — strengthening
              the link between the profession and the public.
            </>
          }
        />
      </section>

      <section className="rounded-[32px] border border-white/10 bg-white/5 p-8 md:p-10">
        <div className="grid gap-8 lg:grid-cols-2 lg:items-start">
          <div>
            <div className="text-2xl md:text-3xl font-semibold tracking-tight">
              What kind of system is this?
            </div>
            <p className="mt-3 text-sm text-slate-300 leading-relaxed">
              Root Health Ops is not just a posting tool. It acts as a calm
              operational layer for professional visibility — helping people
              move from qualified but invisible to more visible, connected, and
              confident in practice.
            </p>
            <p className="mt-3 text-sm text-slate-400 leading-relaxed">
              It supports the transition from training into professional life,
              while also helping established practitioners and communities stay
              connected in thoughtful ways.
            </p>
          </div>

          <div className="grid gap-4">
            <BenefitBlock title="For practitioners">
              A calmer structure for sharing professional ideas, building
              confidence, and developing a steady presence without feeling like
              you have to become a marketer.
            </BenefitBlock>

            <BenefitBlock title="For students and alumni">
              A bridge between training and practice — helping people begin
              showing up professionally while confidence is still developing.
            </BenefitBlock>

            <BenefitBlock title="For training providers">
              A practical way to stay connected to the communities you help
              create, supporting students and alumni beyond qualification.
            </BenefitBlock>
          </div>
        </div>
      </section>

      <section className="space-y-6">
        <div className="max-w-3xl">
          <div className="text-2xl md:text-3xl font-semibold tracking-tight">
            Visibility without pressure
          </div>
          <p className="mt-3 text-sm md:text-base text-slate-300 leading-relaxed">
            Many practitioners leave training highly skilled but professionally
            invisible. Root Health Ops helps close that gap in a way that feels
            calm, ethical, and sustainable.
          </p>
          <p className="mt-3 text-sm md:text-base text-slate-400 leading-relaxed">
            One idea. One post. One conversation at a time.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link
            href="/pricing"
            className="inline-flex items-center justify-center rounded-full bg-emerald-400 px-6 py-3 text-sm font-semibold text-slate-950 hover:bg-emerald-300"
          >
            Go to pricing
          </Link>
          <Link
            href="/colleges"
            className="inline-flex items-center justify-center rounded-full border border-white/10 bg-white/5 px-6 py-3 text-sm font-semibold text-slate-100 hover:bg-white/10"
          >
            Training providers route →
          </Link>
        </div>
      </section>
    </main>
  );
}
