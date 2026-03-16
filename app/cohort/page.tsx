"use client";

import Link from "next/link";
import React, { useEffect, useMemo, useState } from "react";

type PlanKey = "solo" | "growth" | "team";

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold text-slate-200">
      {children}
    </span>
  );
}

function PlanCard({
  title,
  subtitle,
  price,
  selected,
  onClick,
  badge,
}: {
  title: string;
  subtitle: string;
  price: string;
  selected: boolean;
  onClick: () => void;
  badge?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "w-full rounded-[28px] border p-5 text-left transition shadow-[0_20px_70px_rgba(0,0,0,0.30)]",
        selected
          ? "border-emerald-400/40 bg-gradient-to-br from-emerald-400/15 via-white/5 to-white/5"
          : "border-white/10 bg-white/5 hover:bg-white/10",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-lg font-semibold text-slate-50">{title}</div>
          <div className="mt-1 text-sm text-slate-300">{subtitle}</div>
        </div>

        {badge ? (
          <span className="inline-flex items-center rounded-full bg-emerald-400 px-3 py-1 text-[11px] font-extrabold text-slate-950">
            {badge}
          </span>
        ) : null}
      </div>

      <div className="mt-5 flex items-end gap-2">
        <div className="text-3xl font-semibold tracking-tight text-slate-50">
          {price}
        </div>
        <div className="pb-1 text-sm text-slate-400">/ month</div>
      </div>

      <div className="mt-4 text-[12px] text-slate-400">
        {selected ? "Selected" : "Choose this plan"}
      </div>
    </button>
  );
}

export default function CohortPage() {
  const [cohortCode, setCohortCode] = useState("");
  const [plan, setPlan] = useState<PlanKey>("growth");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [orgId, setOrgId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/social-accounts", { cache: "no-store" });
        const data: any = await res.json().catch(() => null);
        const id = data?.organisationId ? String(data.organisationId) : null;
        setOrgId(id);
      } catch {
        setOrgId(null);
      }
    })();
  }, []);

  const cleanedCode = useMemo(
    () => String(cohortCode || "").trim().toUpperCase(),
    [cohortCode]
  );

  const onContinue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    setErr(null);

    if (!cleanedCode) {
      setErr("Please enter your community code.");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan,
          cohortCode: cleanedCode,
          organisationId: orgId || undefined,
        }),
      });

      const data: any = await res.json().catch(() => null);

      if (!data?.ok) {
        throw new Error(
          data?.error ||
            data?.message ||
            `Could not start supported-start checkout (HTTP ${res.status}).`
        );
      }

      try {
        localStorage.setItem("root_cohort_code", cleanedCode);
        if (data?.cohort) {
          localStorage.setItem("root_cohort_info", JSON.stringify(data.cohort));
        }
      } catch {}

      const url = String(data?.url || "").trim();
      if (!url || !url.startsWith("http")) {
        throw new Error("Stripe session URL missing or invalid.");
      }

      window.location.href = url;
    } catch (e: any) {
      setErr(e?.message || "Could not start supported-start checkout.");
      setLoading(false);
    }
  };

  return (
    <main className="mx-auto max-w-5xl px-4 py-12 md:py-16 space-y-12">
      <section className="space-y-6">
        <div className="flex flex-wrap gap-2">
          <Pill>Approved communities</Pill>
          <Pill>Students + alumni</Pill>
          <Pill>Supported start</Pill>
        </div>

        <h1 className="text-4xl md:text-5xl font-semibold tracking-tight leading-[1.05]">
          Supported community enrolment
        </h1>

        <p className="max-w-3xl text-base md:text-lg text-slate-300 leading-relaxed">
          If your training provider, college, or approved community has arranged
          a supported-start route, enter your community code below and choose
          your plan.
        </p>

        <p className="max-w-3xl text-sm md:text-base text-slate-400 leading-relaxed">
          If the code is valid, we will take you to your private checkout route
          with the supported offer applied behind the scenes.
        </p>

        <div className="rounded-3xl border border-white/10 bg-white/5 p-5 text-sm text-slate-300 leading-relaxed">
          This route is for approved communities only. Public pricing remains
          available on the standard pricing page.
        </div>
      </section>

      <form onSubmit={onContinue} className="space-y-8">
        <section className="rounded-[32px] border border-white/10 bg-white/5 p-6 md:p-8 space-y-5">
          <div>
            <div className="text-sm font-semibold text-slate-50">
              1) Enter your community code
            </div>
            <div className="mt-2 text-sm text-slate-400">
              Your college, training provider, or alumni community should have
              shared a code with you.
            </div>
          </div>

          <div className="max-w-xl">
            <label className="block text-[12px] font-semibold uppercase tracking-wide text-slate-400">
              Community code
            </label>
            <input
              value={cohortCode}
              onChange={(e) => setCohortCode(e.target.value.toUpperCase())}
              placeholder="e.g. KINGS-SEP26"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-base text-slate-100 outline-none placeholder:text-slate-500 focus:border-emerald-400/50"
            />
          </div>
        </section>

        <section className="rounded-[32px] border border-white/10 bg-white/5 p-6 md:p-8 space-y-5">
          <div>
            <div className="text-sm font-semibold text-slate-50">
              2) Choose your plan
            </div>
            <div className="mt-2 text-sm text-slate-400">
              Your supported-start offer is applied privately during checkout if
              your community code is valid.
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <PlanCard
              title="Solo"
              subtitle="For a single practitioner who wants calm momentum."
              price="£49"
              selected={plan === "solo"}
              onClick={() => setPlan("solo")}
            />

            <PlanCard
              title="Growth"
              subtitle="For people building confidence and steadier visibility."
              price="£99"
              selected={plan === "growth"}
              onClick={() => setPlan("growth")}
              badge="Most popular"
            />

            <PlanCard
              title="Team"
              subtitle="For practices, collectives, and shared communities."
              price="£199"
              selected={plan === "team"}
              onClick={() => setPlan("team")}
            />
          </div>
        </section>

        <section className="rounded-[32px] border border-white/10 bg-black/20 p-6 md:p-8 space-y-5">
          <div className="text-sm font-semibold text-slate-50">
            3) Continue to your private checkout
          </div>

          <div className="text-sm text-slate-300 leading-relaxed">
            We will check your community code and, if approved, send you to the
            correct Stripe checkout for your supported-start route.
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={loading}
              className={[
                "inline-flex items-center justify-center rounded-full px-6 py-3 text-sm font-semibold transition",
                loading
                  ? "cursor-not-allowed bg-emerald-400/70 text-slate-950"
                  : "bg-emerald-400 text-slate-950 hover:bg-emerald-300",
              ].join(" ")}
            >
              {loading ? "Opening Stripe…" : "Continue to supported checkout"}
            </button>

            <Link
              href="/pricing"
              className="inline-flex items-center justify-center rounded-full border border-white/10 bg-white/5 px-6 py-3 text-sm font-semibold text-slate-100 hover:bg-white/10"
            >
              Back to public pricing
            </Link>
          </div>

          {err ? (
            <div className="rounded-2xl border border-red-500/40 bg-red-950/40 p-4 text-sm text-red-200 whitespace-pre-wrap">
              {err}
            </div>
          ) : null}
        </section>
      </form>
    </main>
  );
}
