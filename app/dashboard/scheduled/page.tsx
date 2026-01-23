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
  error_info?: any; // if your table uses this
};

type FilterMode = "all" | "scheduled" | "sent" | "failed";

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

function normalizeStatus(s: any) {
  return String(s || "").toLowerCase().trim();
}

export default function ScheduledPage() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<ScheduledPost[]>([]);

  const [organisationId, setOrganisationId] = useState<string | null>(null);

  // Queue UX controls
  const [query, setQuery] = useState("");
  const [showPastCount, setShowPastCount] = useState(25);
  const [filterMode, setFilterMode] = useState<FilterMode>("all");

  async function resolveOrgId() {
    // This endpoint already exists in your project and returns organisationId
    const res = await fetch("/api/social-accounts", { cache: "no-store" });
    const data: any = await res.json().catch(() => null);

    const orgId = data?.organisationId ? String(data.organisationId) : "";
    if (!orgId) throw new Error("Could not determine organisationId. (No org returned from /api/social-accounts)");
    return orgId;
  }

  const load = async () => {
    setLoading(true);
    setError(null);

    try {
      const orgId = organisationId || (await resolveOrgId());
      if (!organisationId) setOrganisationId(orgId);

      const res = await fetch(
        `/api/schedule/list?organisationId=${encodeURIComponent(orgId)}`,
        { cache: "no-store" }
      );

      const data: any = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(
          data?.error || `Failed to load scheduled posts (HTTP ${res.status}).`
        );
      }

      setRows(Array.isArray(data?.items) ? data.items : []);
    } catch (e: any) {
      setRows([]);
      setError(e?.message || "Could not load scheduled posts.");
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredBySearch = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;

    return rows.filter((r) => {
      const hay = `${r.message || ""} ${prettyPlatforms(r.platforms)} ${r.status || ""} ${
        r.scheduled_for || ""
      }`.toLowerCase();
      return hay.includes(q);
    });
  }, [rows, query]);

  const filteredByMode = useMemo(() => {
    const mode = filterMode;

    if (mode === "all") return filteredBySearch;

    return filteredBySearch.filter((r) => {
      const s = normalizeStatus(r.status);

      if (mode === "scheduled") {
        // treat anything "scheduled/queued/pending" as scheduled bucket
        return s.includes("scheduled") || s.includes("queued") || s.includes("pending");
      }

      if (mode === "sent") {
        return s.includes("sent") || s.includes("posted") || s.includes("success");
      }

      if (mode === "failed") {
        return s.includes("failed") || s.includes("error");
      }

      return true;
    });
  }, [filteredBySearch, filterMode]);

  const upcoming = useMemo(() => {
    const now = Date.now();
    return filteredByMode
      .filter((r) => new Date(r.scheduled_for).getTime() >= now)
      .sort(
        (a, b) =>
          new Date(a.scheduled_for).getTime() - new Date(b.scheduled_for).getTime()
      );
  }, [filteredByMode]);

  const past = useMemo(() => {
    const now = Date.now();
    return filteredByMode
      .filter((r) => new Date(r.scheduled_for).getTime() < now)
      .sort(
        (a, b) =>
          new Date(b.scheduled_for).getTime() - new Date(a.scheduled_for).getTime()
      );
  }, [filteredByMode]);

  const counts = useMemo(() => {
    const all = filteredBySearch.length;

    const scheduled = filteredBySearch.filter((r) => {
      const s = normalizeStatus(r.status);
      return s.includes("scheduled") || s.includes("queued") || s.includes("pending");
    }).length;

    const sent = filteredBySearch.filter((r) => {
      const s = normalizeStatus(r.status);
      return s.includes("sent") || s.includes("posted") || s.includes("success");
    }).length;

    const failed = filteredBySearch.filter((r) => {
      const s = normalizeStatus(r.status);
      return s.includes("failed") || s.includes("error");
    }).length;

    return { all, scheduled, sent, failed };
  }, [filteredBySearch]);

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

  const FilterButton = ({
    label,
    mode,
    count,
  }: {
    label: string;
    mode: FilterMode;
    count: number;
  }) => {
    const active = filterMode === mode;
    return (
      <button
        type="button"
        onClick={() => setFilterMode(mode)}
        className={[
          "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold transition",
          active ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-100" : "border-white/10 bg-white/5 text-slate-100 hover:bg-white/10",
        ].join(" ")}
      >
        <span>{label}</span>
        <span className="text-[11px] opacity-80">{count}</span>
      </button>
    );
  };

  const RowCard = ({ p }: { p: ScheduledPost }) => {
    const tone = statusTone(p.status);

    // Try to surface useful error detail (without breaking if field is different)
    const err =
      (p as any)?.error_info ||
      (p as any)?.meta?.error_info ||
      (p as any)?.meta?.error ||
      null;

    return (
      <div className="rounded-2xl border border-white/10 bg-black/20 p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-[11px] text-slate-300">
            {safeDate(p.scheduled_for)} ·{" "}
            <span className="text-slate-100 font-semibold">
              {prettyPlatforms(p.platforms)}
            </span>
          </div>
          <Pill tone={tone}>{p.status || "unknown"}</Pill>
        </div>

        <div className="text-sm whitespace-pre-wrap text-slate-100">
          {p.message || "(empty message)"}
        </div>

        {p.image_url ? (
          <div className="text-[11px] text-slate-400 truncate">
            Image: <span className="text-slate-300">{p.image_url}</span>
          </div>
        ) : null}

        {err ? (
          <details className="rounded-2xl border border-red-500/25 bg-red-950/20 p-3">
            <summary className="cursor-pointer text-[11px] font-semibold text-red-200">
              View error details
            </summary>
            <pre className="mt-2 whitespace-pre-wrap text-[11px] text-red-100">
              {JSON.stringify(err, null, 2)}
            </pre>
          </details>
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
              Scheduled <span className="text-xs text-slate-400">(fixed)</span>
            </h1>
            <p className="mt-2 text-sm text-slate-300 max-w-2xl">
              Read-only queue of everything scheduled from elsewhere (Stories, Campaigns, Sequences, etc.).
            </p>
            {organisationId ? (
              <p className="mt-2 text-[11px] text-slate-500">
                Org detected: {organisationId}
              </p>
            ) : null}
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

        <div className="rounded-3xl border border-white/10 bg-white/5 p-6 space-y-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <div className="text-base font-semibold">Search + Filter</div>
              <div className="mt-1 text-xs text-slate-300">
                Search by message, platforms, status, or date. Use filters to show Sent/Failed.
              </div>
            </div>

            <input
              className="w-full md:w-[420px] rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-50 placeholder:text-slate-500 outline-none focus:border-emerald-400/50 focus:ring-1 focus:ring-emerald-400/30"
              placeholder="Search…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <FilterButton label="All" mode="all" count={counts.all} />
            <FilterButton label="Scheduled" mode="scheduled" count={counts.scheduled} />
            <FilterButton label="Sent" mode="sent" count={counts.sent} />
            <FilterButton label="Failed" mode="failed" count={counts.failed} />
          </div>

          {error && (
            <div className="rounded-2xl border border-red-500/40 bg-red-950/40 p-4 text-sm text-red-200 whitespace-pre-wrap">
              {error}
            </div>
          )}

          {loading && (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
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
                No upcoming posts in this filter.
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
                No past posts in this filter.
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
          Note: this page no longer hard-codes an organisation id.
        </div>
      </div>
    </div>
  );
}
