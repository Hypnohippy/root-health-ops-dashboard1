// app/(marketing)/pricing/CheckoutButton.tsx
"use client";

import React, { useEffect, useState } from "react";

type PlanKey = "solo" | "growth" | "team";

export default function CheckoutButton({
  plan,
  label,
  highlight,
}: {
  plan: PlanKey;
  label: string;
  highlight?: boolean;
}) {
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

  const onClick = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();

    if (loading) return;

    setLoading(true);
    setErr(null);

    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, organisationId: orgId || undefined }),
      });

      const data: any = await res.json().catch(() => null);

      if (!data?.ok) {
        throw new Error(
          data?.error || data?.message || `Checkout failed (HTTP ${res.status}).`
        );
      }

      const url = String(data?.url || "").trim();
      if (!url || !url.startsWith("http")) {
        throw new Error("Stripe session URL missing/invalid.");
      }

      window.location.href = url;
    } catch (e: any) {
      setErr(e?.message || "Could not start checkout.");
      setLoading(false);
    }
  };

  return (
    <div>
      <button
        type="button"
        onClick={onClick}
        disabled={loading}
        className={[
          "inline-flex w-full items-center justify-center rounded-full px-5 py-3 text-sm font-semibold transition",
          loading ? "opacity-70 cursor-not-allowed" : "",
          highlight
            ? "bg-emerald-400 text-slate-950 hover:bg-emerald-300"
            : "border border-white/10 bg-white/5 text-slate-100 hover:bg-white/10",
        ].join(" ")}
      >
        {loading ? "Opening Stripe…" : label}
      </button>

      {err ? (
        <div className="mt-3 rounded-2xl border border-red-500/40 bg-red-950/40 p-3 text-[12px] text-red-200 whitespace-pre-wrap">
          {err}
        </div>
      ) : null}
    </div>
  );
}
