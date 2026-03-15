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
          <Pill>Clinician-first</Pill>
          <Pill>Cancel anytime</Pill>
          <Pill>No hype</Pill>
        </div>

        <h1 className="text-4xl md:text-5xl font-semibold tracking-tight leading-[1.05]">
          Pricing that respects real life
        </h1>

        <p className="text-base md:text-lg text-slate-300 leading-relaxed max-w-3xl">
          Root Health Ops is designed to reduce overwhelm and help you stay
          visible consistently — without turning your week into content admin.
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
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-3">
        <PriceCard
          title="Solo"
          subtitle="For a single clinician who wants calm momentum."
          price="£49"
          plan="solo"
          features={[
            <>Connect your channels once</>,
            <>Create Stories and edit before publishing</>,
            <>Schedule posts so visibility stays steady</>,
            <>Queue view with clear sent / scheduled / failed status</>,
            <>🧠 Brainstorm for low-energy content planning</>,
          ]}
          footerNote={
            <>
              Built for steady consistency — not hustle. <br />
              When your practice grows later, Team adds a gentle approvals step.
            </>
          }
        />

        <PriceCard
          badge="Most popular"
          title="Growth"
          subtitle="For clinicians rebuilding confidence and consistency."
          price="£99"
          plan="growth"
          highlight
          features={[
            <>Everything in Solo</>,
            <>More structure for themes and post series</>,
            <>Deeper scheduling workflows</>,
            <>Priority help getting set up</>,
            <>🧠 Brainstorm included</>,
          ]}
          footerNote={
            <>
              Many clinicians use Growth as the bridge into clinic-level systems. <br />
              When the time feels right, Team unlocks approvals and shared workflows.
            </>
          }
        />

        <PriceCard
          title="Team"
          subtitle="For multi-practitioner practices and collectives."
          price="£199"
          plan="team"
          features={[
            <>Everything in Growth</>,
            <>Organisation-first setup</>,
            <>Shared visibility workflows</>,
            <>✅ Approvals before posts go live</>,
            <>Priority support</>,
          ]}
          footerNote={
            <>
              As practices grow, it can help to slow things down just enough to
              stay aligned. Approvals add a gentle review step when more than one
              person contributes.
            </>
          }
        />
      </section>

      <section className="rounded-[32px] border border-white/10 bg-white/5 p-8 md:p-10">
        <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
          <div className="space-y-4">
            <div className="text-2xl md:text-3xl font-semibold tracking-tight text-slate-50">
              For colleges and training providers
            </div>

            <p className="text-sm md:text-base text-slate-300 leading-relaxed">
              We offer a simple supported-start route for approved student
              cohorts and newly qualified clinicians. This is arranged directly
              with each college or training provider, so the student experience
              stays clear, calm, and easy to understand.
            </p>

            <p className="text-sm text-slate-400 leading-relaxed">
              Public pricing stays simple. Approved cohorts receive their own
              private enrolment route after setup.
            </p>

            <div className="flex flex-wrap gap-3">
              <Link
                href="/colleges"
                className="inline-flex items-center justify-center rounded-full bg-emerald-400 px-6 py-3 text-sm font-semibold text-slate-950 hover:bg-emerald-300"
              >
                Visit colleges page
              </Link>

              <Link
                href="/dashboard/connect"
                className="inline-flex items-center justify-center rounded-full border border-white/10 bg-white/5 px-6 py-3 text-sm font-semibold text-slate-100 hover:bg-white/10"
              >
                Request cohort info
              </Link>
            </div>
          </div>

          <div className="grid gap-4">
            <InfoBlock title="Simple for faculty">
              No public discount confusion, no awkward money framing, and no
              need to explain multiple special cases to each intake.
            </InfoBlock>

            <InfoBlock title="Clear for students">
              Approved cohorts get their own private enrolment route, so the
              offer feels intentional and supportive rather than like a public
              sale or coupon hunt.
            </InfoBlock>

            <InfoBlock title="Better control">
              You can approve cohorts, cap usage, set dates, and keep the
              supported-start offer separate from normal public pricing.
            </InfoBlock>
          </div>
        </div>
      </section>
    </main>
  );
}
