// app/(marketing)/pricing/page.tsx
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

      <ul className="mt-6 space-y-3">
        {features.map((f, i) => (
          <Feature key={i}>{f}</Feature>
        ))}
      </ul>

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
    <main className="mx-auto max-w-6xl px-4 py-12 md:py-16 space-y-14">
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
          When money is tight, it’s normal to choose the cheapest tool — even if
          it doesn’t actually reduce stress. Root Health Ops is built to create
          calm momentum and consistent visibility without turning your week into
          “content work”.
        </p>

        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/get-started"
            className="inline-flex items-center justify-center rounded-full bg-emerald-400 px-6 py-3 text-sm font-semibold text-slate-950 hover:bg-emerald-300"
          >
            Get started
          </Link>
          <Link
            href="/how-it-works"
            className="inline-flex items-center justify-center rounded-full border border-white/10 bg-white/5 px-6 py-3 text-sm font-semibold text-slate-100 hover:bg-white/10"
          >
            See how it works
          </Link>
        </div>
      </section>

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
          ctaHref="/get-started"
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
          ctaHref="/get-started"
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
    </main>
  );
}
