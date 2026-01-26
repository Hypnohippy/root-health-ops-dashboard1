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

export default function HowItWorksPage() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-12 md:py-16 space-y-12">
      <section className="space-y-6">
        <div className="flex flex-wrap gap-2">
          <Pill>Designed for clinicians</Pill>
          <Pill>Calm, consistent visibility</Pill>
          <Pill>No hype</Pill>
        </div>

        <h1 className="text-4xl md:text-5xl font-semibold tracking-tight leading-[1.05]">
          How it works
        </h1>

        <p className="max-w-3xl text-base md:text-lg text-slate-300 leading-relaxed">
          Root Health Ops helps you stay visible without turning your life into
          “content work”. You set it up once, create posts when you have energy,
          and scheduling keeps things moving in the background.
        </p>

        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/pricing"
            className="inline-flex items-center justify-center rounded-full bg-emerald-400 px-6 py-3 text-sm font-semibold text-slate-950 hover:bg-emerald-300"
          >
            See pricing
          </Link>
          <Link
            href="/get-started"
            className="inline-flex items-center justify-center rounded-full border border-white/10 bg-white/5 px-6 py-3 text-sm font-semibold text-slate-100 hover:bg-white/10"
          >
            Get started
          </Link>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-3">
        <Step
          num="1"
          title="Connect once"
          body={
            <>
              Link your social channels in <span className="text-slate-50 font-semibold">Connect</span>.
              You shouldn’t be reconnecting every week.
            </>
          }
        />
        <Step
          num="2"
          title="Create (human-first)"
          body={
            <>
              Use Stories to generate a post, edit it in your voice, then choose{" "}
              <span className="text-slate-50 font-semibold">Post Now</span> or{" "}
              <span className="text-slate-50 font-semibold">Schedule</span>.
            </>
          }
        />
        <Step
          num="3"
          title="Schedule carries it"
          body={
            <>
              Your queue tracks each post with status (scheduled / sent / failed) so you’re never guessing.
            </>
          }
        />
      </section>

      <section className="rounded-[32px] border border-white/10 bg-white/5 p-8 md:p-10">
        <div className="grid gap-8 lg:grid-cols-2 lg:items-start">
          <div>
            <div className="text-2xl md:text-3xl font-semibold tracking-tight">
              Where does “How the app works” live?
            </div>
            <p className="mt-3 text-sm text-slate-300 leading-relaxed">
              Right here — high level, clinician-friendly. The deeper detail can live
              inside the Dashboard as tooltips and short demo videos (your idea is perfect).
            </p>
          </div>

          <div className="rounded-3xl border border-white/10 bg-black/20 p-6">
            <div className="text-sm font-semibold text-slate-50">Next best step</div>
            <p className="mt-2 text-sm text-slate-300 leading-relaxed">
              If you’re ready, pricing is your guardrail: clear tiers, then setup.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
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
                Colleges route →
              </Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
