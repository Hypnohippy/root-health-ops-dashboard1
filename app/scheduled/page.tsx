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

// ✅ Single-tenant production org (internal only)
const ORG_ID = "23a054db-7040-40b1-b193-2f43cfa139de";

function safeDate(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function prettyPlatforms(list: any) {
  if (!Array.isArray(list) || list.length === 0) return "(none)";
  return list.join(", ");
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

export default function ScheduledPage() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<ScheduledPost[]>([]);
  const [query, setQuery] = useState("");
  const [showPastCount, setShowPastCount] = useState(25);

  const load = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/schedule/list?organisationId=${encodeURIComponent(ORG_ID)}`,
        { cache: "no-store" }
      );

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || "Failed to load scheduled posts");
      }

      setRows(Array.isArray(data?.items) ? data.items : []);
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
      await load();
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;

    return rows.filter((r) =>
      `${r.message} ${prettyPlatforms(r.platforms)} ${r.status} ${r.scheduled_for}`
        .toLowerCase()
        .includes(q)
    );
  }, [rows, query]);

  const now = Date.now();

  const upcoming = useMemo(
    () =>
      filtered
        .filter((r) => new Date(r.scheduled_for).getTime() >= now)
        .sort(
          (a, b) =>
            new Date(a.scheduled_for).getTime() -
            new Date(b.scheduled_for).getTime()
        ),
    [filtered, now]
  );

  const past = useMemo(
    () =>
      filtered
        .filter((r) => new Date(r.scheduled_for).getTime() < now)
        .sort(
          (a, b) =>
            new Date(b.scheduled_for).getTime() -
            new Date(a.scheduled_for).getTime()
        ),
    [filtered, now]
  );

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
      <span className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-semibold ${cls}`}>
        {children}
      </span>
    );
  };

  const Row = ({ p }: { p: ScheduledPost }) => (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <div className="flex justify-between items-center text-[11px] text-slate-400">
        <span>{safeDate(p.scheduled_for)}</span>
        <Pill tone={statusTone(p.status)}>{p.status}</Pill>
      </div>

      <div className="mt-2 text-sm whitespace-pre-wrap text-slate-100">
        {p.message}
      </div>

      <div className="mt-2 text-[11px] text-slate-400">
        {prettyPlatforms(p.platforms)}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 px-4 py-10">
      <div className="mx-auto max-w-6xl space-y-8">
        <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold">Scheduled</h1>
            <p className="mt-2 text-sm text-slate-300 max-w-2xl">
              A read-only queue of everything scheduled from Stories, Campaigns,
              Sequences, and Quick Blast.
            </p>
          </div>

          <div className="flex gap-2">
            <Pill>Upcoming: {upcoming.length}</Pill>
            <Pill>Past: {past.length}</Pill>
            <button
              onClick={refresh}
              disabled={refreshing}
              className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold hover:bg-white/10 disabled:opacity-60"
            >
              {refreshing ? "Refreshing…" : "Refresh"}
            </button>
          </div>
        </header>

        <input
          className="w-full max-w-md rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm"
          placeholder="Search scheduled posts…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />

        {error && (
          <div className="rounded-2xl border border-red-500/40 bg-red-950/40 p-4 text-sm">
            {error}
          </div>
        )}

        {loading ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm">
            Loading scheduled posts…
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-2">
            <section className="space-y-3">
              <h2 className="font-semibold">Upcoming</h2>
              {upcoming.length === 0 ? (
                <div className="text-sm text-slate-400">No upcoming posts.</div>
              ) : (
                upcoming.map((p) => <Row key={p.id} p={p} />)
              )}
            </section>

            <section className="space-y-3">
              <h2 className="font-semibold">Past</h2>
              {past.slice(0, showPastCount).map((p) => (
                <Row key={p.id} p={p} />
              ))}

              {past.length > showPastCount && (
                <button
                  onClick={() =>
                    setShowPastCount((n) => Math.min(n + 25, past.length))
                  }
                  className="text-xs text-slate-300 underline"
                >
                  Show more
                </button>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
