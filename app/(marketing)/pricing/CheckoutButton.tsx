"use client";

import React, { useState } from "react";

export default function CheckoutButton({
  plan,
  label,
  highlight,
}: {
  plan: "solo" | "growth" | "team";
  label: string;
  highlight?: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const onClick = async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const data: any = await res.json().catch(() => null);

      if (!data?.ok || !data?.url) {
        throw new Error(data?.error || "Could not start checkout.");
      }

      window.location.href = data.url;
    } catch (e: any) {
      setErr(e?.message || "Checkout failed.");
    } finally {
      setLoading(false);
    }
  };

  const cls = highlight
    ? "bg-emerald-400 text-slate-950 hover:bg-emerald-300"
    : "border border-white/10 bg-white/5 text-slate-100 hover:bg-white/10";

  return (
    <div>
      <button
        type="button"
        onClick={onClick}
        disabled={loading}
        className={[
          "inline-flex w-full items-center justify-center rounded-full px-5 py-3 text-sm font-semibold transition disabled:opacity-60 disabled:cursor-not-allowed",
          cls,
        ].join(" ")}
      >
        {loading ? "Opening checkout…" : label}
      </button>

      {err ? (
        <div className="mt-2 text-[11px] text-red-300 whitespace-pre-wrap">
          {err}
        </div>
      ) : null}

      <div className="mt-3 text-center text-[11px] text-slate-500">
        Secure checkout · cancel anytime
      </div>
    </div>
  );
}
