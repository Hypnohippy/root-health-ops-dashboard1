// app/(marketing)/pricing/page.tsx
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
  footnote,
}: {
  badge?: string;
  title: string;
  price: string;
  subtitle: string;
  features: React.ReactNode[];
  plan: "solo" | "growth" | "team";
  highlight?: boolean;
  footnote?: React.ReactNode;
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

      {footnote ? (
        <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4 text-[12px] text-slate-300 leading-relaxed">
          {footnote}
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

function MiniCard({
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

export default function PricingPage() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-12 md:py-16 space-y-14">
      {/* Header */}
      <section className="space-y-6">
        <div className="flex flex-wrap gap-2">
          <Pill>Clinician-first</Pill>
          <Pill>Cancel anytime</Pill>
          <Pill>No hype</Pill>
          <Pill>Built to reduce overwhelm</Pill>
        </div>

        <h1 className="text-4xl md:text-5xl font-semibold tracking-tight leading-[1.05]">
          Pricing that respects real life
        </h1>

        <p className="text-base md:text-lg text-slate-300 leading-relaxed max-w-3xl">
          Root Health Ops helps you stay visible without becoming a marketing machine.
          Calm structure, simple workflows, and a supportive{" "}
          <span className="text-slate-50 font-semibold">Brainstorm</span>{" "}
          space that keeps you aligned when energy is low.
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
            Colleges →
          </Link>
        </div>

        <div className="text-[11px] text-slate-500 leading-relaxed">
          We don’t do “credits” or confusing limits. If you join early, you keep the generous model.
        </div>
      </section>

      {/* Highlight: Brainstorm */}
      <section className="rounded-[32px] border border-white/10 bg-gradient-to-br from-emerald-400/15 via-white/5 to-white/5 p-8 md:p-10">
        <div className="grid gap-8 lg:grid-cols-2 lg:items-start">
          <div>
            <div className="flex flex-wrap gap-2 mb-3">
              <Pill>Brainstorm (Gold)</Pill>
              <Pill>Included in every plan</Pill>
            </div>

            <div className="text-2xl md:text-3xl font-semibold tracking-tight">
              Brainstorm is the calm superpower
            </div>

            <p className="mt-3 text-sm text-slate-300 leading-relaxed">
              This isn’t “AI content spam”. It’s a conversational space that helps you:
              find your angle, soften your tone, and turn real expertise into posts that still feel like you.
              It’s built for the days when you’re tired — not just when you’re “on”.
            </p>

            <div className="mt-4 text-[12px] text-slate-300 leading-relaxed">
              <span className="text-slate-50 font-semibold">Early adopter promise:</span>{" "}
              no surprise paywalls on Brainstorm for early supporters.
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-black/20 p-6">
            <div className="text-sm font-semibold text-slate-50">
              What Brainstorm helps you do (fast)
            </div>
            <ul className="mt-3 space-y-2 text-sm text-slate-300 leading-relaxed list-disc list-inside">
              <li>Turn a messy idea into a clear post you can edit</li>
              <li>Rewrite to sound more “you” (warm, grounded, not salesy)</li>
              <li>Create a simple weekly rhythm when confidence is low</li>
              <li>Draft replies without drifting into “marketing robot” language</li>
            </ul>
            <div className="mt-5 flex flex-wrap gap-2">
              <Link
                href="/dashboard"
                className="inline-flex items-center justify-center rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-slate-100 hover:bg-white/10"
              >
                Try the dashboard →
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Plans */}
      <section className="grid gap-6 lg:grid-cols-3">
        <PriceCard
          title="Solo"
          subtitle="For one clinician who wants calm momentum."
          price="£49"
          plan="solo"
          features={[
            <>Connect your channels once</>,
            <>Post now or schedule from one place</>,
            <>Queue view with clear status (sent / scheduled / failed)</>,
            <>Brainstorm (Gold): shape posts in a calm conversation</>,
            <>Designed to reduce overwhelm, not add tasks</>,
          ]}
          footnote={
            <>
              <span className="text-slate-50 font-semibold">Best for:</span>{" "}
              solo clinicians who want consistency without turning their week into content work.
            </>
          }
        />

        <PriceCard
          badge="Most popular"
          title="Growth"
          subtitle="For rebuilding confidence and consistency."
          price="£99"
          plan="growth"
          highlight
          features={[
            <>Everything in Solo</>,
            <>Deeper scheduling workflow (steady drumbeat)</>,
            <>More structure for themes + series (coming next)</>,
            <>Priority help getting set up</>,
            <>Brainstorm (Gold): faster drafts + better tone alignment</>,
          ]}
          footnote={
            <>
              <span className="text-slate-50 font-semibold">Note:</span>{" "}
              “Themes + series” is on the roadmap next — Growth supporters help shape it early.
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
            <>Organisation-first setup (multi-user workflows)</>,
            <>Approvals + governance (enterprise guard rails)</>,
            <>Priority support</>,
            <>Best for clinics, groups, and larger teams</>,
          ]}
          footnote={
            <>
              <span className="text-slate-50 font-semibold">Team is for:</span>{" "}
              practices that need oversight, permissions, and shared visibility workflows.
            </>
          }
        />
      </section>

      {/* What exists today (trust section) */}
      <section className="grid gap-6 lg:grid-cols-3">
        <MiniCard title="What’s live right now">
          Posting + scheduling from the dashboard, connected channels, queue/status visibility,
          and Brainstorm drafting support.
        </MiniCard>

        <MiniCard title="What’s next (without breaking anything)">
          Approvals workflow, audit trail, permissions, and structured content themes/series —
          implemented carefully so we don’t destabilise what’s working.
        </MiniCard>

        <MiniCard title="No nasty surprises">
          No “token anxiety”, no hidden AI credit traps. We keep it simple and clinician-safe.
        </MiniCard>
      </section>

      {/* Colleges */}
      <section className="rounded-[32px] border border-white/10 bg-white/5 p-8 md:p-10">
        <div className="grid gap-8 lg:grid-cols-2 lg:items-start">
          <div>
            <div className="text-2xl md:text-3xl font-semibold tracking-tight">
              The 6-month subsidy (college route)
            </div>
            <p className="mt-3 text-sm text-slate-300 leading-relaxed">
              Colleges can provide a promo code to students (e.g.{" "}
              <span className="text-slate-50 font-semibold">COLLEGE50</span>).
              Students enter it during checkout — the discount applies automatically for 6 months.
            </p>
            <p className="mt-3 text-sm text-slate-300 leading-relaxed">
              This is ideal when students need structure and confidence, but money is tight.
            </p>
          </div>

          <div className="rounded-3xl border border-white/10 bg-black/20 p-6">
            <div className="text-sm font-semibold text-slate-50">
              What you do in Stripe
            </div>
            <ol className="mt-2 space-y-2 text-sm text-slate-300 leading-relaxed list-decimal list-inside">
              <li>Create a coupon: 50% off</li>
              <li>Set duration: repeating</li>
              <li>Set months: 6</li>
              <li>Create a promotion code for that coupon</li>
            </ol>
            <div className="mt-4">
              <Link
                href="/colleges"
                className="inline-flex items-center justify-center rounded-full border border-white/10 bg-white/5 px-6 py-3 text-sm font-semibold text-slate-100 hover:bg-white/10"
              >
                See colleges options →
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="rounded-[32px] border border-white/10 bg-white/5 p-8 md:p-10">
        <div className="text-2xl md:text-3xl font-semibold tracking-tight">
          Common questions
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <div className="rounded-3xl border border-white/10 bg-black/20 p-6">
            <div className="text-sm font-semibold text-slate-50">
              Is Brainstorm included in Solo?
            </div>
            <div className="mt-2 text-sm text-slate-300 leading-relaxed">
              Yes. Brainstorm (Gold) is included across plans because it’s part of the “reduce overwhelm” promise —
              not an upsell trick.
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-black/20 p-6">
            <div className="text-sm font-semibold text-slate-50">
              Will features be locked behind higher tiers?
            </div>
            <div className="mt-2 text-sm text-slate-300 leading-relaxed">
              Team-only features are the ones that require governance (like approvals + permissions).
              We’ll guide users to the right tier when they try to activate them.
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-black/20 p-6">
            <div className="text-sm font-semibold text-slate-50">
              Can I cancel anytime?
            </div>
            <div className="mt-2 text-sm text-slate-300 leading-relaxed">
              Yes. Simple monthly billing. No lock-in.
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-black/20 p-6">
            <div className="text-sm font-semibold text-slate-50">
              Is this “AI therapy”?
            </div>
            <div className="mt-2 text-sm text-slate-300 leading-relaxed">
              No. It’s a clinician-first marketing ops cockpit. Brainstorm helps draft and refine content —
              it does not provide clinical advice or diagnosis.
            </div>
          </div>
        </div>
      </section>

      <div className="text-[11px] text-slate-500">
        Pricing and features may evolve, but the core promise stays the same: calm, ethical visibility without burnout.
      </div>
    </main>
  );
}
