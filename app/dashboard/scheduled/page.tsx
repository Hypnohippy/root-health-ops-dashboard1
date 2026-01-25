// app/dashboard/scheduled/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";

type ScheduledPost = {
  id: string;
  organisation_id: string;
  message: string;
  platforms: string[];
  image_url?: string | null;
  scheduled_for: string;
  status: string;
  created_at?: string;
  meta?: any;
  error_info?: any;
  posted_at?: string | null;
};

function prettyPlatforms(list: any) {
  if (!Array.isArray(list) || list.length === 0) return "(none)";
  return list.map((x) => String(x)).join(", ");
}

function safeDate(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function statusTone(status: string): "good" | "warn" | "bad" | "neutral" {
  const s = String(status || "").toLowerCase();
  if (s.includes("sent") || s.includes("posted") || s.includes("success"))
    return "good";
  if (s.includes("failed") || s.includes("error")) return "bad";
  if (s.includes("pending") || s.includes("scheduled") || s.includes("queued"))
    return "warn";
  return "neutral";
}

/**
 * Pull out a human-friendly error summary from our various shapes of error_info
 * (quick-blast style: { success, results: [{platform, ok, error, details}] })
 */
function summarizeErrorInfo(errorInfo: any): { title: string; lines: string[] } | null {
  if (!errorInfo) return null;

  // If it's already a string
  if (typeof errorInfo === "string") {
    return { title: "Error", lines: [errorInfo] };
  }

  // Common quick-blast format
  const results = Array.isArray(errorInfo?.results) ? errorInfo.results : null;
  if (results && results.length) {
    const lines = results.map((r: any) => {
      const platform = r?.platform ? String(r.platform) : "unknown";
      const ok = !!r?.ok;
      const err = r?.error || r?.reason || r?.message || "Unknown error";
      return `${platform}: ${ok ? "OK" : "FAILED"} — ${String(err)}`;
    });
    const title = errorInfo?.success === false ? "Dispatch failed" : "Dispatch results";
    return { title, lines };
  }

  // Airtable-ish / other shapes
  if (errorInfo?.error) {
    const msg = typeof errorInfo.error === "string" ? errorInfo.error : JSON.stringify(errorInfo.error);
    return { title: "Error", lines: [msg] };
  }

  try {
    return { title: "Error details", lines: [JSON.stringify(errorInfo)] };
  } catch {
    return { title: "Error details", lines: ["(unreadable error_info)"] };
  }
}

export default function ScheduledPage() {
  const [orgId, setOrgId] = useState<string | null>(null);
  const [orgLoadError, setOrgLoadError] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<ScheduledPost[]>([]);

  const [query, setQuery] = useState("");
  const [showPastCount, setShowPastCount] = useState(25);

  // 1) Load orgId from backend
  useEffect(() => {
    (async () => {
      try {
        setOrgLoadError(null);
        const res = await fetch("/api/social-accounts", { cache: "no-store" });
        const data: any = await res.json().catch(() => null);

        const id = data?.organisationId ? String(data.organisationId) : null;

        if (!id) {
          setOrgId(null);
          setOrgLoadError("Could not determine organisationId. (No organisationId returned.)");
          return;
        }

        setOrgId(id);
      } catch (e: any) {
        setOrgId(null);
        setOrgLoadError(e?.message || "Could not determine organisationId.");
      }
    })();
  }, []);
// 2) Auto-refresh scheduled posts every 30 seconds
useEffect(() => {
  if (!orgId) return;

  const interval = setInterval(() => {
    load(orgId);
  }, 30_000); // 30 seconds

  return () => clearInterval(interval);
}, [orgId]);
  

  const load = async (organisationId: string) => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/schedule/list?organisationId=${encodeURIComponent(organisationId)}`,
        { cache: "no-store" }
      );

      const data: any = await res.json().catch(() => null);

      if (!data?.ok) {
        throw new Error(
          data?.error || `Failed to load scheduled posts (HTTP ${res.status}).`
        );
      }

      const items = Array.isArray(data?.items) ? (data.items as ScheduledPost[]) : [];
      setRows(items);
    } catch (e: any) {
      setRows([]);
      setError(e?.message || "Could not load scheduled posts.");
    } finally {
      setLoading(false);
    }
  };

  const refresh = async () => {
    if (!orgId) return;
    setRefreshing(true);
    try {
      await load(orgId);
    } finally {
      setRefreshing(false);
    }
  };

  // 2) Load scheduled posts once orgId is ready
  useEffect(() => {
    if (!orgId) return;
    void load(orgId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);
  // 🔁 Auto-refresh every 30s while page is open
useEffect(() => {
  if (!orgId) return;

  const interval = setInterval(() => {
    load(orgId);
  }, 30_000); // 30 seconds

  return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [orgId]);


  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;

    return rows.filter((r) => {
      const hay = `${r.message || ""} ${prettyPlatforms(r.platforms)} ${r.status || ""} ${
        r.scheduled_for || ""
      } ${r.posted_at || ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [rows, query]);

  const upcoming = useMemo(() => {
    const now = Date.now();
    return filtered
      .filter((r) => new Date(r.scheduled_for).getTime() >= now)
      .sort(
        (a, b) =>
          new Date(a.scheduled_for).getTime() - new Date(b.scheduled_for).getTime()
      );
  }, [filtered]);

  const past = useMemo(() => {
    const now = Date.now();
    return filtered
      .filter((r) => new Date(r.scheduled_for).getTime() < now)
      .sort(
        (a, b) =>
          new Date(b.scheduled_for).getTime() - new Date(a.scheduled_for).getTime()
      );
  }, [filtered]);

  const Pill = ({
    children,
    tone = "neutral",
  }: {
    children: React.ReactNode;
    tone?: "neutral" | "good" | "warn" | "bad";
  }) => {
    const cls =
      tone === "good"
        ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-100"
        : tone === "warn"
        ? "border-amber-400/30 bg-amber-400/10 text-amber-100"
        : tone === "bad"
        ? "border-red-400/30 bg-red-400/10 text-red-100"
        : "border-white/10 bg-white/5 text-slate-200";

    return (
      <span
        className={[
          "inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-semibold",
          cls,
        ].join(" ")}
      >
        {children}
      </span>
    );
  };

  const RowCard = ({ p }: { p: ScheduledPost }) => {
    const tone = statusTone(p.status);
    const errSummary = summarizeErrorInfo(p.error_info);

    return (
      <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-[11px] text-slate-300">
            {safeDate(p.scheduled_for)} ·{" "}
            <span className="text-slate-100 font-semibold">
              {prettyPlatforms(p.platforms)}
            </span>
            {p.posted_at ? (
              <span className="text-slate-400"> · posted {safeDate(p.posted_at)}</span>
            ) : null}
          </div>
          <Pill tone={tone}>{p.status || "unknown"}</Pill>
        </div>

        <div className="mt-3 text-sm whitespace-pre-wrap text-slate-100">
          {p.message || "(empty message)"}
        </div>

        {p.image_url ? (
          <div className="mt-3 text-[11px] text-slate-400 truncate">
            Image: <span className="text-slate-300">{p.image_url}</span>
          </div>
        ) : null}

        {errSummary ? (
          <div className="mt-3 rounded-xl border border-red-500/30 bg-red-950/30 p-3">
            <div className="text-[11px] font-semibold text-red-200">{errSummary.title}</div>
            <ul className="mt-2 space-y-1">
              {errSummary.lines.slice(0, 6).map((line, idx) => (
                <li key={idx} className="text-[11px] text-red-100 whitespace-pre-wrap">
                  • {line}
                </li>
              ))}
            </ul>

            {/* Raw details toggle-like (always visible but compact) */}
            <pre className="mt-3 text-[10px] text-red-100/80 whitespace-pre-wrap bg-black/30 border border-white/10 rounded-lg p-2 overflow-x-auto">
              {JSON.stringify(p.error_info, null, 2)}
            </pre>
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="relative mx-auto w-full max-w-6xl px-4 py-10 space-y-8">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">
              Scheduled <span className="text-xs text-slate-400">(org-aware)</span>
            </h1>
            <p className="mt-2 text-sm text-slate-300 max-w-2xl">
              Read-only queue of everything scheduled from elsewhere (Stories, Campaigns, Sequences, etc.).
            </p>

            <p className="mt-1 text-[11px] text-slate-500">
              Org: {orgId ? orgId : "loading…"}
            </p>

            {orgLoadError ? (
              <div className="mt-2 text-[11px] text-red-300 whitespace-pre-wrap">
                {orgLoadError}
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Pill>Upcoming: {upcoming.length}</Pill>
            <Pill>Past: {past.length}</Pill>

            <button
              type="button"
              onClick={refresh}
              disabled={refreshing || !orgId}
              className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-100 hover:bg-white/10 disabled:opacity-60 disabled:cursor-not-allowed transition"
            >
              {refreshing ? "Refreshing…" : "Refresh"}
            </button>
          </div>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <div className="text-base font-semibold">Search the queue</div>
              <div className="mt-1 text-xs text-slate-300">
                Search by message, platforms, status, date, or posted time.
              </div>
            </div>

            <input
              className="w-full md:w-[420px] rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-50 placeholder:text-slate-500 outline-none focus:border-emerald-400/50 focus:ring-1 focus:ring-emerald-400/30"
              placeholder="Search…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          {error && (
            <div className="mt-4 rounded-2xl border border-red-500/40 bg-red-950/40 p-4 text-sm text-red-200 whitespace-pre-wrap">
              {error}
            </div>
          )}

          {loading && (
            <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
              Loading scheduled posts…
            </div>
          )}
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="rounded-3xl border border-white/10 bg-white/5 p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">Upcoming</h2>
              <Pill tone="neutral">{upcoming.length}</Pill>
            </div>

            {!loading && upcoming.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-slate-300">
                No upcoming posts.
              </div>
            ) : (
              <div className="space-y-3">
                {upcoming.map((p) => (
                  <RowCard key={p.id} p={p} />
                ))}
              </div>
            )}
          </section>

          <section className="rounded-3xl border border-white/10 bg-white/5 p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">Past</h2>
              <div className="flex items-center gap-2">
                <Pill tone="neutral">{past.length}</Pill>
                <button
                  type="button"
                  onClick={() => setShowPastCount((n) => Math.min(n + 25, 250))}
                  disabled={past.length <= showPastCount}
                  className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-100 hover:bg-white/10 disabled:opacity-60 disabled:cursor-not-allowed transition"
                >
                  Show more
                </button>
              </div>
            </div>

            {!loading && past.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-slate-300">
                No past posts.
              </div>
            ) : (
              <div className="space-y-3">
                {past.slice(0, showPastCount).map((p) => (
                  <RowCard key={p.id} p={p} />
                ))}
              </div>
            )}

            {past.length > showPastCount && (
              <div className="pt-1 text-[11px] text-slate-400">
                Showing {showPastCount} of {past.length}. Use “Show more” to load more.
              </div>
            )}
          </section>
        </div>

        <div className="text-[11px] text-slate-500">
          Note: internal identifiers are intentionally hidden from users.
        </div>
      </div>
    </div>
  );
}
