// app/dashboard/scheduled/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";

type ScheduledRow = {
  id: string;
  organisation_id: string;
  message: string | null;
  platforms: string[] | null;
  image_url: string | null;
  scheduled_for: string | null;
  posted_at: string | null;
  status: string | null;
  meta: any;
  error_info: any;
  created_at: string | null;
  updated_at: string | null;
};

function fmt(dt?: string | null) {
  if (!dt) return "—";
  const d = new Date(dt);
  if (isNaN(d.getTime())) return dt;
  return d.toLocaleString();
}

function platformLabel(p: string) {
  const k = String(p || "").toLowerCase();
  if (k === "facebook") return "Facebook";
  if (k === "instagram") return "Instagram";
  if (k === "threads") return "Threads";
  if (k === "linkedin") return "LinkedIn";
  if (k === "tiktok") return "TikTok";
  return p;
}

/**
 * Fixes:
 * - "Unknown error" showing for OK results
 * - "[object Object]" showing for failures
 */
function describeResult(r: any) {
  const ok = !!r?.ok;
  const platform = String(r?.platform || "").toLowerCase();

  // OK → show postedId if available, otherwise just OK
  if (ok) {
    const postedId = r?.postedId || r?.details?.postedId || null;
    return postedId ? `OK — ${postedId}` : "OK";
  }

  // Failed / Skipped
  if (r?.skipped) {
    const reason = String(r?.reason || "Skipped");
    return `SKIPPED — ${reason}`;
  }

  // Pull the best possible error message
  const msg =
    r?.error?.message ||
    r?.error?.error_user_msg ||
    r?.error?.error_user_title ||
    r?.error ||
    r?.details?.error?.message ||
    r?.details?.error?.error_user_msg ||
    r?.details?.error?.error_user_title ||
    r?.details?.message ||
    r?.message ||
    null;

  // If error is an object, stringify it safely
  if (msg && typeof msg === "object") {
    try {
      return `FAILED — ${JSON.stringify(msg)}`;
    } catch {
      return "FAILED — Unknown error";
    }
  }

  const text = String(msg || "").trim();
  if (text) return `FAILED — ${text}`;

  // Fallback
  return platform ? "FAILED — Unknown error" : "FAILED";
}

export default function ScheduledPage() {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<ScheduledRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [includeQuickBlast, setIncludeQuickBlast] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/social/scheduled?range=future&includeQuickBlast=${includeQuickBlast ? "1" : "0"}`,
        { cache: "no-store" }
      );
      const json = await res.json().catch(() => null);

      if (!res.ok || !json?.success) {
        setItems([]);
        setError(json?.error || `Failed to load (${res.status})`);
        setLoading(false);
        return;
      }

      setItems(Array.isArray(json.items) ? json.items : []);
    } catch (e: any) {
      setItems([]);
      setError(e?.message || "Failed to load scheduled posts.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [includeQuickBlast]);

  const emptyState = !loading && !error && items.length === 0;

  const title = useMemo(() => {
    return includeQuickBlast ? "Scheduled Pipeline (including Quick Blast history)" : "Scheduled Pipeline";
  }, [includeQuickBlast]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 px-4 py-10">
      <div className="mx-auto w-full max-w-6xl">
        <div className="rounded-3xl border border-slate-700 bg-slate-900/70 p-6 md:p-10 shadow-xl backdrop-blur">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <div className="text-xs text-slate-400">Root Health Ops</div>
              <h1 className="mt-1 text-2xl md:text-3xl font-semibold">{title}</h1>
              <p className="mt-2 text-sm text-slate-300 max-w-3xl">
                This is your forward-looking pipeline (future posts). Quick Blast is “send now”, so it’s hidden by default.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={load}
                className="rounded-2xl border border-slate-600 bg-slate-950 px-4 py-2 text-sm text-slate-200 hover:border-slate-500"
              >
                Refresh
              </button>

              <label className="flex items-center gap-2 text-sm text-slate-300">
                <input
                  type="checkbox"
                  checked={includeQuickBlast}
                  onChange={(e) => setIncludeQuickBlast(e.target.checked)}
                  className="h-4 w-4"
                />
                Include Quick Blast history
              </label>
            </div>
          </div>

          {loading && (
            <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-950/60 p-4 text-slate-300">
              Loading…
            </div>
          )}

          {error && (
            <div className="mt-6 rounded-2xl border border-red-500/40 bg-red-950/30 p-4 text-red-100">
              {error}
            </div>
          )}

          {emptyState && (
            <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-950/60 p-5 text-slate-300">
              No future scheduled posts right now ✅
              <div className="mt-2 text-xs text-slate-500">
                Tip: Use “Queue for approval” (or Stories) to build a future pipeline.
              </div>
            </div>
          )}

          {!loading && !error && items.length > 0 && (
            <div className="mt-6 space-y-4">
              {items.map((it) => {
                const platforms = Array.isArray(it.platforms) ? it.platforms : [];
                const results = it?.error_info?.results;
                const hasResults = Array.isArray(results) && results.length > 0;

                const source = String(it?.meta?.source || "").trim();
                const sourceBadge =
                  source === "quick_blast"
                    ? "Quick Blast"
                    : source
                    ? source
                    : "Scheduled";

                return (
                  <div
                    key={it.id}
                    className="rounded-3xl border border-slate-700 bg-slate-950 p-5"
                  >
                    <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                      <div>
                        <div className="text-xs text-slate-400">
                          {fmt(it.scheduled_for)} · {platforms.map(platformLabel).join(", ") || "—"}
                        </div>

                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold text-slate-100">
                            {it.status || "—"}
                          </span>

                          <span className="text-xs rounded-full border border-slate-700 bg-slate-900 px-2 py-0.5 text-slate-200">
                            {sourceBadge}
                          </span>

                          {it.posted_at ? (
                            <span className="text-xs text-slate-400">
                              posted {fmt(it.posted_at)}
                            </span>
                          ) : null}
                        </div>

                        <div className="mt-3 whitespace-pre-wrap text-sm text-slate-200">
                          {String(it.message || "").trim() || "—"}
                        </div>

                        {it.image_url ? (
                          <div className="mt-2 text-xs text-slate-400 break-all">
                            Media: {it.image_url}
                          </div>
                        ) : null}
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <button
                          className="rounded-2xl border border-slate-700 bg-slate-900/70 px-4 py-2 text-sm text-slate-200 hover:border-slate-600"
                          onClick={() => navigator.clipboard.writeText(it.id)}
                        >
                          Copy ID
                        </button>
                      </div>
                    </div>

                    <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
                      <div className="text-sm font-semibold text-slate-100">
                        Dispatch results
                      </div>

                      {!hasResults ? (
                        <div className="mt-2 text-sm text-slate-400">
                          No dispatch results stored yet.
                        </div>
                      ) : (
                        <div className="mt-3 space-y-2">
                          {results.map((r: any, idx: number) => {
                            const platform = String(r?.platform || "—");
                            const ok = !!r?.ok;
                            const skipped = !!r?.skipped;

                            const badge = ok
                              ? "✅ OK"
                              : skipped
                              ? "⚠️ Skipped"
                              : "❌ Failed";

                            return (
                              <div
                                key={`${platform}-${idx}`}
                                className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2"
                              >
                                <div className="text-sm text-slate-200">
                                  <span className="font-semibold">
                                    {platformLabel(platform)}:
                                  </span>{" "}
                                  {describeResult(r)}
                                </div>

                                <div
                                  className={[
                                    "text-xs rounded-full border px-2 py-0.5",
                                    ok
                                      ? "border-emerald-500/60 text-emerald-200 bg-emerald-500/10"
                                      : skipped
                                      ? "border-slate-600 text-slate-300 bg-slate-900/40"
                                      : "border-red-500/50 text-red-200 bg-red-500/10",
                                  ].join(" ")}
                                >
                                  {badge}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="mt-8 text-xs text-slate-500">
            Tip: Quick Blast writes rows for audit + reliability, but Scheduled Pipeline should stay focused on future posts.
          </div>
        </div>
      </div>
    </div>
  );
}
