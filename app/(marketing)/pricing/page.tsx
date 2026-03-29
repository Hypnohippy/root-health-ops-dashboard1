import Link from "next/link";
import React from "react";
import CheckoutButton from "./CheckoutButton";

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
  plan,
  highlight,
  footerNote,
}: {
  badge?: string;
  title: string;
  price: string;
  subtitle: string;
  features: React.ReactNode[];
  plan: "solo" | "growth" | "team";
  highlight?: boolean;
  footerNote?: React.ReactNode;
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

      <ul className="mt-6 space-y-3">
        {features.map((f, i) => (
          <Feature key={i}>{f}</Feature>
        ))}
      </ul>

      {footerNote ? (
        <div className="mt-6 rounded-2xl border border-white/10 bg-black/20 p-4 text-[12px] text-slate-300 leading-relaxed">
          {footerNote}
        </div>
      ) : null}

      <div className="mt-8">
        <CheckoutButton
          plan={plan}
          label={plan === "team" ? "Talk to us / Start Team" : `Choose ${title}`}
          highlight={highlight}
        />
      </div>
    </div>
  );
}

function InfoBlock({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-3xl border border-white/10 bg-black/20 p-6">
      <div className="text-sm font-semibold text-slate-50">{title}</div>
      <div className="mt-2 text-sm text-slate-300 leading-relaxed">
        {children}
      </div>
    </div>
  );
}

export default function PricingPage() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-12 md:py-16 space-y-14">
      <section className="space-y-6">
        <div className="flex flex-wrap gap-2">
          <Pill>Calm professional visibility</Pill>
          <Pill>Cancel anytime</Pill>
          <Pill>No hype</Pill>
          <Pill>For practitioners and communities</Pill>
        </div>

        <h1 className="text-4xl md:text-5xl font-semibold tracking-tight leading-[1.05]">
          Pricing that respects real life
        </h1>

        <p className="text-base md:text-lg text-slate-300 leading-relaxed max-w-3xl">
          Root Health Ops is designed to reduce friction and help people stay
          professionally visible in a way that still feels thoughtful, ethical,
          and human.
        </p>

        <p className="text-sm md:text-base text-slate-400 leading-relaxed max-w-3xl">
          Whether you are building your own practice, rebuilding confidence, or
          supporting a wider professional team, the platform is built to create
          steadier presence without turning the week into a performance.
        </p>

        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/how-it-works"
            className="inline-flex items-center justify-center rounded-full border border-white/10 bg-white/5 px-6 py-3 text-sm font-semibold text-slate-100 hover:bg-white/10"
          >
            See how it works
          </Link>

          <Link
            href="/colleges"
            className="inline-flex items-center justify-center rounded-full border border-white/10 bg-white/5 px-6 py-3 text-sm font-semibold text-slate-100 hover:bg-white/10"
          >
            Training providers / colleges
          </Link>

          <Link
            href="/cohort"
            className="inline-flex items-center justify-center rounded-full border border-emerald-400/30 bg-emerald-400/10 px-6 py-3 text-sm font-semibold text-emerald-200 hover:bg-emerald-400/15"
          >
            Have a community code?
          </Link>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-3">
        <PriceCard
          title="Solo"
          subtitle="For a single practitioner who wants calm momentum."
          price="£49"
          plan="solo"
          features={[
  <>Connect your channels once</>,
  <>Develop ideas into posts and stories</>,
  <>Schedule content so presence stays steady</>,
  <>Track sent / scheduled / failed status clearly</>,
  <>🧠 Brainstorm for low-energy planning and drafting</>,
  <>20 AI-powered resource creations per month</>,
]}
          footerNote={
            <>
              Built for thoughtful consistency rather than hustle. <br />
              A good fit for individual practitioners who want a calmer rhythm.
            </>
          }
        />

        <PriceCard
          badge="Most popular"
          title="Growth"
          subtitle="For practitioners building confidence and steadier visibility."
          price="£99"
          plan="growth"
          highlight
          features={[
  <>Everything in Solo</>,
  <>More structure for themes, series, and visibility rhythm</>,
  <>Deeper scheduling workflows</>,
  <>Priority help getting set up</>,
  <>🧠 Brainstorm included</>,
  <>60 AI-powered resource creations per month</>,
]}          footerNote={
            <>
              Often the best fit for people moving from qualified but invisible
              to more visible, connected, and confident in practice.
            </>
          }
        />

        <PriceCard
          title="Team"
          subtitle="For multi-practitioner practices, collectives, and shared communities."
          price="£199"
          plan="team"
          features={[
  <>Everything in Growth</>,
  <>Organisation-first setup</>,
  <>Shared visibility workflows</>,
  <>✅ Approvals before posts go live</>,
  <>Priority support</>,
  <>150 AI-powered resource creations per month</>,
]}
          footerNote={
            <>
              Useful where multiple practitioners contribute and a gentler
              review step helps keep the whole community aligned.
            </>
          }
        />
      </section>

<div className="rounded-2xl border border-white/10 bg-black/20 px-5 py-4 text-sm text-slate-300 leading-relaxed">
  AI-powered resource creations include courses, programmes, Deep Teach, and Elite Deep Teach. Allowances reset monthly with your subscription cycle.
</div>

      <section className="rounded-[32px] border border-white/10 bg-white/5 p-8 md:p-10">
        <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
          <div className="space-y-4">
            <div className="text-2xl md:text-3xl font-semibold tracking-tight text-slate-50">
              For training providers, students, and alumni
            </div>

            <p className="text-sm md:text-base text-slate-300 leading-relaxed">
              Training providers can offer Root Health Ops through a supported
              start route for approved communities. This can include students,
              graduating cohorts, and alumni networks.
            </p>

            <p className="text-sm text-slate-400 leading-relaxed">
              Public pricing stays simple. Approved communities receive their
              own private enrolment route and community code after setup.
            </p>

            <div className="flex flex-wrap gap-3">
              <Link
                href="/colleges#cohort-offer"
                className="inline-flex items-center justify-center rounded-full bg-emerald-400 px-6 py-3 text-sm font-semibold text-slate-950 hover:bg-emerald-300"
              >
                Visit colleges page
              </Link>

              <Link
                href="/colleges#cohort-offer"
                className="inline-flex items-center justify-center rounded-full border border-white/10 bg-white/5 px-6 py-3 text-sm font-semibold text-slate-100 hover:bg-white/10"
              >
                Request community info
              </Link>
            </div>
          </div>

          <div className="grid gap-4">
            <InfoBlock title="Simple for training providers">
              No public discount confusion, no awkward money framing, and no
              need to explain multiple special cases to each intake or alumni
              group.
            </InfoBlock>

            <InfoBlock title="Clear for students and alumni">
              Approved communities use a private route, so the offer feels
              intentional and supportive rather than like a public sale or
              coupon hunt.
            </InfoBlock>

            <InfoBlock title="Better control">
              You can approve communities, cap usage, set dates, and keep the
              supported-start route separate from normal public pricing.
            </InfoBlock>
          </div>
        </div>
      </section>

      <section className="rounded-[32px] border border-white/10 bg-gradient-to-br from-emerald-400/15 via-white/5 to-white/5 p-8 md:p-10">
        <div className="grid gap-6 lg:grid-cols-2 lg:items-center">
          <div>
            <div className="text-2xl md:text-3xl font-semibold tracking-tight">
              A calmer investment in professional visibility
            </div>
            <p className="mt-2 text-sm text-slate-300 leading-relaxed">
              Root Health Ops is designed for people who want steadier presence,
              clearer structure, and less friction — without drifting into
              hype, pressure, or constant self-promotion.
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
              href="/colleges"
              className="inline-flex items-center justify-center rounded-full border border-white/10 bg-white/5 px-6 py-3 text-sm font-semibold text-slate-100 hover:bg-white/10"
            >
              Colleges
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
