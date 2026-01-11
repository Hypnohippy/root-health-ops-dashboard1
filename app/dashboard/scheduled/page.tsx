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
};

// ✅ Confirmed correct org (internal only, never displayed)
const LEGACY_ORG_ID = "23a054db-7040-40b1-b193-2f43cfa139de";

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
  if (s.includes("sent") || s.includes("posted") || s.includes("success")) return "good";
  if (s.includes("failed") || s.includes("error")) return "bad";
  if (s.includes("pending") || s.includes("scheduled") || s.includes("queued")) return "warn";
  return "neutral";
}

export default function ScheduledPage() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<ScheduledPost[]>([]);

  // Queue UX controls
  const [query, setQuery] = useState("");
  const [showPastCount, setShowPastCount] = useState(25);

  const loadScheduled = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/schedule/list?organisationId=${encodeURIComponent(LEGACY_ORG_ID)}`,
        { cache: "no-store" }
      );

      const data: any = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(
          data?.error || `Failed to load scheduled posts (HTTP ${res.status}).`
        );
      }

      const items = Array.isArray(data?.items) ? data.items : [];
      setRows(items);
    } catch (e: any) {
      setError(e?.message || "Could not load scheduled posts.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  const refresh = async () => {
    setRefreshing(true);
    try {
      await loadScheduled();
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    let cancelled = false;

    const boot = async () => {
      if (cancelled) return;
      await loadScheduled();
    };

    void boot();

    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;

    return rows.filter((r) => {
      const hay = `${r.message || ""} ${prettyPlatforms(r.platforms)} ${r.status || ""} ${
        r.scheduled_for || ""
      }`.toLowerCase();
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

  const GlassCard = ({
    children,
    className = "",
  }: {
    children: React.ReactNode;
    className?: string;
  }) => (
    <div
      className={[
        "rounded-3xl border border-white/10 bg-white/5 shadow-[0_20px_60px_rgba(0,0,0,0.35)] backdrop-blur-xl",
        className,
      ].join(" ")}
    >
      {children}
    </div>
  );

  const RowCard = ({ p }: { p: ScheduledPost }) => {
    const tone = statusTone(p.status);
    return (
      <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-[11px] text-slate-300">
            {safeDate(p.scheduled_for)} ·{" "}
            <span className="text-slate-100 font-semibold">
              {prettyPlatforms(p.platforms)}
            </span>
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
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/2 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-emerald-500/10 blur-3xl" />
        <div className="absolute top-40 -left-40 h-[420px] w-[420px] rounded-full bg-sky-500/10 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-[520px] w-[520px] rounded-full bg-pink-500/10 blur-3xl" />
      </div>

      <div className="relative mx-auto w-full max-w-6xl px-4 py-10 space-y-8">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">
              Scheduled
            </h1>
            <p className="mt-2 text-sm text-slate-300 max-w-2xl">
              This page is a read-only queue of everything scheduled from elsewhere
              (Stories, Campaigns, Sequences, etc.). We keep it read-only to avoid
              duplicated workflows.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Pill>Upcoming: {upcoming.length}</Pill>
            <Pill>Past: {past.length}</Pill>
            <button
              type="button"
              onClick={refresh}
              disabled={refreshing}
              className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-100 hover:bg-white/10 disabled:opacity-60 disabled:cursor-not-allowed transition"
            >
              {refreshing ? "Refreshing…" : "Refresh"}
            </button>
          </div>
        </div>

        <GlassCard className="p-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <div className="text-base font-semibold">Search the queue</div>
              <div className="mt-1 text-xs text-slate-300">
                Search by message text, platforms, status, or date.
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
        </GlassCard>

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
          Note: organisation IDs are internal and intentionally hidden from users.
        </div>
      </div>
    </div>
  );
}
