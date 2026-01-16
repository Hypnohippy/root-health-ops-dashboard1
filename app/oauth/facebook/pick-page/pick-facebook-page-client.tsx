// app/oauth/facebook/pick-page/pick-facebook-page-client.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";

type FbPage = {
  id: string;
  name: string;
  tasks?: string[];
};

export default function PickFacebookPageClient({
  token,
  state,
}: {
  token: string;
  state: string;
}) {
  const [loading, setLoading] = useState(true);
  const [pages, setPages] = useState<FbPage[]>([]);
  const [error, setError] = useState<string | null>(null);

  const safeState = useMemo(() => {
    // keep state around, but we don't *need* to decode it here
    return state || "";
  }, [state]);

  useEffect(() => {
    async function run() {
      setLoading(true);
      setError(null);

      if (!token) {
        setError("Missing token. Please go back and click Connect again.");
        setLoading(false);
        return;
      }

      try {
        const res = await fetch(`/api/oauth/facebook/pages?token=${encodeURIComponent(token)}`, {
          method: "GET",
          cache: "no-store",
        });

        const data: any = await res.json().catch(() => null);

        if (!res.ok) {
          throw new Error(data?.error || "Failed to load Facebook Pages.");
        }

        const list: FbPage[] = Array.isArray(data?.data) ? data.data : [];
        if (list.length === 0) {
          throw new Error(
            "No Pages were returned for this Facebook user. (Facebook returned an empty list.)"
          );
        }

        setPages(list);
      } catch (e: any) {
        setError(e?.message || "Could not load Facebook Pages.");
      } finally {
        setLoading(false);
      }
    }

    void run();
  }, [token]);

  const pick = (p: FbPage) => {
    // ✅ window is only used in a click handler (client-only)
    const url =
      `/connect?provider=facebook&success=1` +
      `&pageId=${encodeURIComponent(p.id)}` +
      `&pageName=${encodeURIComponent(p.name)}` +
      (safeState ? `&state=${encodeURIComponent(safeState)}` : "");

    window.location.href = url;
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-2xl rounded-3xl border border-white/10 bg-white/5 p-6 shadow-[0_20px_60px_rgba(0,0,0,0.35)] backdrop-blur-xl">
        <h1 className="text-2xl font-semibold">Pick your Facebook Page</h1>
        <p className="mt-2 text-sm text-slate-300">
          Select which Page Root Health Ops should connect to.
        </p>

        {loading && (
          <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-slate-300">
            Loading your Pages…
          </div>
        )}

        {error && (
          <div className="mt-5 rounded-2xl border border-red-500/40 bg-red-950/40 p-4 text-sm text-red-200 whitespace-pre-wrap">
            {error}
          </div>
        )}

        {!loading && !error && (
          <div className="mt-5 space-y-3">
            {pages.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => pick(p)}
                className="w-full text-left rounded-2xl border border-white/10 bg-black/20 p-4 hover:bg-white/5 transition"
              >
                <div className="text-sm font-semibold text-slate-100">{p.name}</div>
                <div className="mt-1 text-xs text-slate-400">Page ID: {p.id}</div>
              </button>
            ))}
          </div>
        )}

        <div className="mt-6 text-[11px] text-slate-500">
          If you don’t see the right Page, double-check you are logging into the correct Facebook account,
          and that the Page exists under your Page access/business portfolio.
        </div>
      </div>
    </div>
  );
}
