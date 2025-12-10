// app/billing/page.tsx
"use client";

import React, { useState } from "react";

type PlanKey = "basic" | "pro" | "enterprise";

const PLAN_CONFIG: Record<
  PlanKey,
  {
    name: string;
    priceLabel: string;
    priceId: string;
    postsPerMonth: number;
    highlight?: boolean;
    description: string;
    features: string[];
  }
> = {
  basic: {
    name: "Basic",
    priceLabel: "£29 / month",
    priceId: "price_rootops_basic_monthly",
    postsPerMonth: 8,
    description:
      "Perfect for solo therapists who want a gentle, guided marketing engine without touching ad managers or APIs.",
    features: [
      "Up to 8 social posts per month",
      "Facebook, Instagram, LinkedIn, Reddit",
      "Quick Blast composer",
      "AI Root Coach support",
      "1 practice / organisation",
    ],
  },
  pro: {
    name: "Pro",
    priceLabel: "£79 / month",
    priceId: "price_rootops_pro_monthly",
    postsPerMonth: 20,
    highlight: true,
    description:
      "For growing practices who want campaigns, scheduling, and TikTok switched on without hiring a marketing team.",
    features: [
      "Up to 20 social posts per month",
      "TikTok unlocked",
      "Campaigns & scheduling (coming online)",
      "AI content generator & brainstorm tools",
      "Priority support",
    ],
  },
  enterprise: {
    name: "Enterprise",
    priceLabel: "£149 / month",
    priceId: "price_rootops_enterprise_monthly",
    postsPerMonth: 40,
    description:
      "For clinics, organisations, or training providers who want Root Health Ops across multiple brands and teams.",
    features: [
      "Up to 40 social posts per month",
      "All supported channels",
      "Multi-organisation / multi-brand",
      "Team members & advanced analytics (roadmap)",
      "Hands-on onboarding",
    ],
  },
};

export default function BillingPage() {
  const [selectedPlan, setSelectedPlan] = useState<PlanKey | null>("pro");
  const [isLoading, setIsLoading] = useState<PlanKey | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 🔴 PLACEHOLDERS:
  // In a later step we will replace these with real values from Supabase auth + your org context.
  const organisationId = "REPLACE_ME_WITH_ORG_ID";
  const userEmail = "replace-me-with-user-email@example.com";

  const handleSubscribe = async (planKey: PlanKey) => {
    setError(null);
    setIsLoading(planKey);

    try {
      if (!organisationId || organisationId === "REPLACE_ME_WITH_ORG_ID") {
        throw new Error(
          "Organisation is not yet wired to billing. Ask Dave's AI dev buddy to hook this up properly."
        );
      }

      if (!userEmail || userEmail === "replace-me-with-user-email@example.com") {
        throw new Error(
          "User email not set. Make sure you're passing the signed-in user's email to the billing page."
        );
      }

      const plan = PLAN_CONFIG[planKey];

      const res = await fetch("/api/upgrade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organisationId,
          priceId: plan.priceId,
          userEmail,
        }),
      });

      const data = await res.json();

      if (!data?.success || !data?.url) {
        throw new Error(
          data?.error ||
            "Could not start secure checkout. Please try again or contact support."
        );
      }

      // Redirect to Stripe hosted checkout
      window.location.href = data.url;
    } catch (err: any) {
      console.error("[billing] subscribe error", err);
      setError(err?.message || "Something went wrong starting checkout.");
    } finally {
      setIsLoading(null);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 px-4 py-10 flex justify-center">
      <div className="w-full max-w-5xl space-y-10">
        {/* Header */}
        <header className="space-y-3 text-center">
          <h1 className="text-3xl md:text-4xl font-semibold">
            Choose your Root Health Ops plan
          </h1>
          <p className="text-sm md:text-base text-slate-300 max-w-2xl mx-auto">
            Start on Basic, grow into Pro, and graduate to Enterprise when your
            practice or organisation is ready. All plans are billed monthly via
            secure Stripe checkout.
          </p>
        </header>

        {/* Plans grid */}
        <section className="grid gap-6 md:grid-cols-3">
          {(
            Object.entries(PLAN_CONFIG) as [PlanKey, (typeof PLAN_CONFIG)[PlanKey]][]
          ).map(([key, plan]) => {
            const isSelected = selectedPlan === key;
            const isPro = key === "pro";

            return (
              <button
                key={key}
                type="button"
                onClick={() => setSelectedPlan(key)}
                className={[
                  "relative flex flex-col rounded-3xl border p-5 text-left transition-all",
                  plan.highlight
                    ? "border-emerald-400 bg-slate-900/80 shadow-lg shadow-emerald-500/20"
                    : "border-slate-700 bg-slate-900/60 hover:border-slate-500",
                  isSelected ? "ring-2 ring-emerald-400" : "",
                ].join(" ")}
              >
                {plan.highlight && (
                  <span className="absolute -top-3 right-4 rounded-full bg-emerald-500 px-3 py-1 text-[10px] font-semibold text-slate-950 uppercase tracking-wide">
                    Most popular
                  </span>
                )}

                <div className="mb-4">
                  <h2 className="text-lg md:text-xl font-semibold">
                    {plan.name}
                  </h2>
                  <p className="mt-1 text-[13px] text-emerald-300">
                    {plan.priceLabel}
                  </p>
                </div>

                <p className="text-[12px] text-slate-300 mb-4">
                  {plan.description}
                </p>

                <div className="text-[12px] text-slate-200 mb-4">
                  <span className="font-semibold">
                    Up to {plan.postsPerMonth} posts / month
                  </span>
                  <span className="text-slate-400"> on your connected channels</span>
                </div>

                <ul className="flex-1 space-y-1.5 text-[12px] text-slate-200 mb-4">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2">
                      <span className="mt-[3px] inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>

                <div className="mt-auto pt-3 flex flex-col gap-1">
                  <span className="text-[11px] text-slate-400 mb-1">
                    Secure checkout via Stripe
                  </span>
                  <span
                    className={[
                      "inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-medium",
                      isPro
                        ? "bg-emerald-500 text-slate-950 hover:bg-emerald-400"
                        : "bg-slate-800 text-slate-100 hover:bg-slate-700",
                    ].join(" ")}
                  >
                    {isSelected ? "Selected" : "Tap to select"}
                  </span>
                </div>
              </button>
            );
          })}
        </section>

        {/* Subscribe bar */}
        <section className="mt-4 rounded-3xl border border-slate-800 bg-slate-900/80 p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="text-sm text-slate-200">
            {selectedPlan ? (
              <>
                <span className="font-semibold">
                  {PLAN_CONFIG[selectedPlan].name} plan selected.
                </span>{" "}
                <span className="text-slate-300">
                  You’ll be taken to a secure Stripe checkout page to confirm your
                  subscription.
                </span>
              </>
            ) : (
              <span>Select a plan to continue.</span>
            )}
          </div>

          <div className="flex items-center gap-3">
            {error && (
              <span className="text-[11px] text-red-400 max-w-xs">{error}</span>
            )}

            <button
              type="button"
              disabled={!selectedPlan || isLoading !== null}
              onClick={() =>
                selectedPlan ? handleSubscribe(selectedPlan) : null
              }
              className="inline-flex items-center rounded-full bg-emerald-500 px-5 py-2 text-sm font-semibold text-slate-950 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-emerald-400 transition"
            >
              {isLoading
                ? "Starting secure checkout..."
                : selectedPlan
                ? `Subscribe to ${PLAN_CONFIG[selectedPlan].name}`
                : "Select a plan"}
            </button>
          </div>
        </section>

        <section className="text-[11px] text-slate-500 text-center max-w-2xl mx-auto">
          You can change or cancel your plan at any time. Posting limits and channel
          access update automatically as soon as Stripe confirms your subscription.
        </section>
      </div>
    </div>
  );
}
