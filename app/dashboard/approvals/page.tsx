// app/dashboard/approvals/page.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

type ScheduledPost = {
  id: string;
  organisation_id: string;
  message: string;
  platforms: string[];
  image_url?: string | null;
  scheduled_for: string;
  status?: string | null;
  created_at?: string;
  meta?: any;
};

type ApiListResp = { items?: ScheduledPost[]; error?: string; ok?: boolean };

function safeDate(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function prettyPlatforms(list: any) {
  if (!Array.isArray(list) || list.length === 0) return "(none)";
  return list.map((x) => String(x)).join(", ");
}

function normStatus(s: any) {
  return String(s || "").toLowerCase().trim();
}

function isPending(s: any) {
  const v = normStatus(s);
  // accept older variants too, just in case
  return v === "pending" || v === "pending_approval" || v === "needs_approval";
}

function isQueued(s: any) {
  const v = normStatus(s);
  return v === "queued";
}

function statusTone(status: string): "good" | "warn" | "bad" | "neutral" {
  const s = String(status || "").toLowerCase();
  if (s.includes("queued") || s.includes("approved")) return "good";
  if (s.includes("pending")) return "warn";
  if (s.includes("rejected") || s.includes("failed") || s.includes("error")) return "bad";
  return "neutral";
}

function useDebouncedValue<T>(value: T, delayMs: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

export default function ApprovalsPage() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [organisationId, setOrganisationId] = useState<string | null>(null);
  const [rows, setRows] = useState<ScheduledPost[]>([]);

  // 🔥 SEARCH: keep typing smooth by not re-rendering on every keystroke
  const searchRef = useRef<HTMLInputElement | null>(null);
  const [queryRaw, setQueryRaw] = useState("");
  const query = useDebouncedValue(queryRaw, 180);

  const [tab, setTab] = useState<"pending" | "queued" | "all">("pending");

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [note, setNote] = useState("");

  const resolveOrg = async () => {
    const res = await fetch("/api/social-accounts", { method: "GET" });
    const data: any = await res.json().catch(() => null);

    const org =
      typeof data?.organisationId === "string"
        ? data.organisationId
        : typeof data?.organisation_id === "string"
        ? data.organisation_id
        : null;

    if (!org) throw new Error("Workspace not loaded yet. Please refresh and try again.");
    setOrganisationId(org);
    return org;
  };

  const load = async () => {
    setLoading(true);
    setError(null);

    try {
      const org = organisationId || (await resolveOrg());

      const res = await fetch(`/api/schedule/list?organisationId=${encodeURIComponent(org)}`, {
        cache: "no-store",
      });
      const data: ApiListResp = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error((data as any)?.error || `Failed to load scheduled posts (HTTP ${res.status}).`);
      }

      setRows(Array.isArray((data as any)?.items) ? (data as any).items : []);
    } catch (e: any) {
      setError(e?.message || "Could not load approvals queue.");
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep selection stable: if selected item is no longer in filtered list, clear it
  useEffect(() => {
    const exists = rows.some((r) => r.id === selectedId);
    if (selectedId && !exists) setSelectedId(null);
  }, [rows, selectedId]);

  useEffect(() => setNote(""), [selectedId]);

  const filtered = useMemo(() => {
    const q = (query || "").trim().toLowerCase();

    let base = rows;

    if (tab === "pending") base = rows.filter((r) => isPending(r.status));
    if (tab === "queued") base = rows.filter((r) => isQueued(r.status));

    if (!q) return base;

    return base.filter((r) => {
      const hay = `${r.message || ""} ${prettyPlatforms(r.platforms)} ${r.scheduled_for || ""} ${normStatus(
        r.status
      )}`.toLowerCase();
      return hay.includes(q);
    });
  }, [rows, query, tab]);

  const selected = useMemo(() => filtered.find((x) => x.id === selectedId) || null, [filtered, selectedId]);

  const counts = useMemo(() => {
    const pending = rows.filter((r) => isPending(r.status)).length;
    const queued = rows.filter((r) => isQueued(r.status)).length;
    return { pending, queued, all: rows.length };
  }, [rows]);

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
      <span className={["inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-semibold", cls].join(" ")}>
        {children}
      </span>
    );
  };

  const GlassCard = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
    <div
      className={[
        "rounded-3xl border border-white/10 bg-white/5 shadow-[0_20px_60px_rgba(0,0,0,0.35)] backdrop-blur-xl",
        className,
      ].join(" ")}
    >
      {children}
    </div>
  );

  const act = async (action: "approve" | "reject") => {
    if (!selected) return;
    setError(null);

    try {
      const org = organisationId || (await resolveOrg());

      const res = await fetch(`/api/approvals/update?organisationId=${encodeURIComponent(org)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: selected.id, action, note: note.trim() || null }),
      });

      const data: any = await res.json().catch(() => null);
      if (!res.ok || data?.success === false) throw new Error(data?.error || `Failed (HTTP ${res.status}).`);

      const newStatus = action === "approve" ? "queued" : "rejected";

      // Update in-place so it can appear in the Queued tab
      setRows((prev) => prev.map((r) => (r.id === selected.id ? { ...r, status: newStatus } : r)));

      // If user is on Pending tab and approved, the item will vanish from current view (correct).
      // They can switch to Queued tab to see it.
      setSelectedId(null);
      setNote("");
    } catch (e: any) {
      setError(e?.message || "Action failed.");
    }
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
            <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">Approvals</h1>
            <p className="mt-2 text-sm text-slate-300 max-w-2xl">
              Review scheduled posts safely. Approve moves items into <span className="text-slate-100 font-semibold">queued</span>.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Pill tone="warn">Pending: {counts.pending}</Pill>
            <Pill tone="good">Queued: {counts.queued}</Pill>
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

        <GlassCard className="p-6 space-y-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <div className="text-base font-semibold">Search</div>
              <div className="mt-1 text-xs text-slate-300">Smooth typing (debounced) — no more “one letter then stop”.</div>
            </div>

            <input
              ref={searchRef}
              className="w-full md:w-[420px] rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-50 placeholder:text-slate-500 outline-none focus:border-emerald-400/50 focus:ring-1 focus:ring-emerald-400/30"
              placeholder="Search…"
              value={queryRaw}
              onChange={(e) => setQueryRaw(e.target.value)}
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setTab("pending")}
              className={[
                "rounded-full px-4 py-2 text-xs font-semibold border transition",
                tab === "pending" ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-100" : "border-white/10 bg-white/5 text-slate-200 hover:bg-white/10",
              ].join(" ")}
            >
              Pending
            </button>
            <button
              type="button"
              onClick={() => setTab("queued")}
              className={[
                "rounded-full px-4 py-2 text-xs font-semibold border transition",
                tab === "queued" ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-100" : "border-white/10 bg-white/5 text-slate-200 hover:bg-white/10",
              ].join(" ")}
            >
              Queued
            </button>
            <button
              type="button"
              onClick={() => setTab("all")}
              className={[
                "rounded-full px-4 py-2 text-xs font-semibold border transition",
                tab === "all" ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-100" : "border-white/10 bg-white/5 text-slate-200 hover:bg-white/10",
              ].join(" ")}
            >
              All
            </button>
          </div>

          {error && (
            <div className="rounded-2xl border border-red-500/40 bg-red-950/40 p-4 text-sm text-red-200 whitespace-pre-wrap">
              {error}
            </div>
          )}

          {loading && (
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-slate-300">
              Loading…
            </div>
          )}
        </GlassCard>

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-3">
            {!loading && filtered.length === 0 ? (
              <div className="rounded-3xl border border-white/10 bg-white/5 p-6 text-sm text-slate-300">
                No items in this view.
              </div>
            ) : (
              filtered.map((p) => {
                const isSelected = p.id === selectedId;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setSelectedId(p.id)}
                    className={[
                      "w-full text-left rounded-2xl border p-4 transition",
                      isSelected ? "border-emerald-300/30 bg-emerald-300/5" : "border-white/10 bg-black/20 hover:bg-white/5",
                    ].join(" ")}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-xs font-semibold text-slate-100 truncate">
                        {prettyPlatforms(p.platforms)}
                        <span className="ml-2 text-[11px] font-normal text-slate-400">{safeDate(p.scheduled_for)}</span>
                      </div>
                      <span className="inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-semibold border-white/10 bg-white/5 text-slate-200">
                        {normStatus(p.status) || "scheduled"}
                      </span>
                    </div>

                    <div className="mt-3 text-sm text-slate-100 line-clamp-3 whitespace-pre-wrap">{p.message}</div>
                  </button>
                );
              })
            )}
          </div>

          <div className="space-y-6">
            <GlassCard className="p-6">
              <div className="text-base font-semibold">Review</div>
              <div className="mt-1 text-xs text-slate-300">Approve moves it to queued. Reject marks rejected.</div>

              {!selected ? (
                <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-slate-300">
                  Select an item to review.
                </div>
              ) : (
                <div className="mt-4 space-y-4">
                  <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-semibold">{prettyPlatforms(selected.platforms)}</div>
                      <span className="inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-semibold border-white/10 bg-white/5 text-slate-200">
                        {normStatus(selected.status) || "scheduled"}
                      </span>
                    </div>
                    <div className="mt-2 text-[11px] text-slate-400">{safeDate(selected.scheduled_for)}</div>
                    <div className="mt-3 text-sm whitespace-pre-wrap">{selected.message}</div>
                  </div>

                  <textarea
                    className="w-full min-h-[90px] rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:border-emerald-400/50 focus:ring-1 focus:ring-emerald-400/30"
                    placeholder="Optional note…"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => act("approve")}
                      className="flex-1 rounded-2xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-slate-950 hover:bg-emerald-400 transition"
                    >
                      Approve
                    </button>

                    <button
                      type="button"
                      onClick={() => act("reject")}
                      className="flex-1 rounded-2xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm font-semibold text-red-100 hover:bg-red-400/15 transition"
                    >
                      Reject
                    </button>
                  </div>

                  <div className="text-[11px] text-slate-500">
                    Tip: after approving, switch to the <span className="text-slate-200 font-semibold">Queued</span> tab to see it.
                  </div>
                </div>
              )}
            </GlassCard>

            <GlassCard className="p-6">
              <div className="text-base font-semibold">Note</div>
              <div className="mt-2 text-sm text-slate-300 whitespace-pre-wrap">
                If your DB didn’t previously have a status column, run the SQL we discussed:
                {"\n"}• add status text
                {"\n"}• default “scheduled”
                {"\n"}• use “pending/queued/posted/failed/rejected”
              </div>
            </GlassCard>
          </div>
        </div>
      </div>
    </div>
  );
}
