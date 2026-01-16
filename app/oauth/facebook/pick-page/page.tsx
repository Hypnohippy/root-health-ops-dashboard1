// app/oauth/facebook/pick-page/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";

type PageRow = {
  id: string;
  name: string;
  category?: string;
  pageAccessToken: string;
};

export default function PickFacebookPage() {
  const [loading, setLoading] = useState(true);
  const [pages, setPages] = useState<PageRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const token = params.get("token") || "";
  const state = params.get("state") || "";

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setError(null);

        const res = await fetch(
          `/api/oauth/facebook/pages?token=${encodeURIComponent(token)}&state=${encodeURIComponent(
            state
          )}`,
          { method: "GET", cache: "no-store" }
        );

        const data: any = await res.json().catch(() => null);
        if (!res.ok || !data?.success) {
          throw new Error(data?.error || "Could not load your Facebook Pages.");
        }

        setPages(Array.isArray(data.pages) ? data.pages : []);
      } catch (e: any) {
        setError(e?.message || "Failed to load Pages.");
      } finally {
        setLoading(false);
      }
    })();
  }, [token, state]);

  const choose = async (p: PageRow) => {
    setSavingId(p.id);
    setError(null);

    try {
      // Save selection in your existing API
      const res = await fetch("/api/social-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform: "facebook",
          pageId: p.id,
          pageName: p.name,
          connectionType: "oauth",
          // NOTE: we are NOT storing the token yet because your schema doesn't have it.
          // We'll add secure token storage next.
        }),
      });

      const text = await res.text().catch(() => "");
      if (!res.ok) throw new Error(text || "Failed to save selected Page.");

      // Go back to connect page, mark success
      window.location.href = `/connect?success=1&provider=facebook&pageName=${encodeURIComponent(
        p.name
      )}`;
    } catch (e: any) {
      setError(e?.message || "Failed to save selection.");
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 px-4 py-10">
      <div className="mx-auto w-full max-w-3xl rounded-3xl border border-white/10 bg-white/5 p-6 shadow-[0_30px_90px_rgba(0,0,0,0.5)] backdrop-blur-xl">
        <h1 className="text-2xl font-semibold">Choose which Facebook Page to connect</h1>
        <p className="mt-2 text-sm text-slate-300">
          Facebook found multiple Pages under your account. Pick the one you want Root Health Ops to
          post to.
        </p>

        {loading && (
          <div className="mt-6 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-slate-300">
            Loading your Pages…
          </div>
        )}

        {error && (
          <div className="mt-6 rounded-2xl border border-red-500/40 bg-red-950/40 p-4 text-sm text-red-200 whitespace-pre-wrap">
            {error}
          </div>
        )}

        {!loading && !error && pages.length === 0 && (
          <div className="mt-6 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-slate-300">
            No Pages returned. (This usually means you didn’t grant Page permissions.)
          </div>
        )}

        <div className="mt-6 space-y-3">
          {pages.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => choose(p)}
              disabled={!!savingId}
              className="w-full text-left rounded-2xl border border-white/10 bg-black/20 hover:bg-white/5 transition p-4 disabled:opacity-60"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-semibold truncate">{p.name}</div>
                  <div className="text-xs text-slate-400 truncate">
                    {p.category ? p.category : "Facebook Page"} · {p.id}
                  </div>
                </div>
                <div className="text-xs text-emerald-300 font-semibold">
                  {savingId === p.id ? "Saving…" : "Select"}
                </div>
              </div>
            </button>
          ))}
        </div>

        <div className="mt-6 text-[11px] text-slate-500">
          Tip: If you see “The Wellbeing Café” here, just don’t select it — choose your Root Health
          Page instead.
        </div>
      </div>
    </div>
  );
}
