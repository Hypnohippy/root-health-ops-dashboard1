// app/dashboard/approvals/page.tsx
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

type ApiListResp = { items?: ScheduledPost[]; error?: string };
type SocialAccountsResp = { organisationId?: string | null; organisation_id?: string | null };

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

function statusTone(status: string): "good" | "warn" | "bad" | "neutral" {
  const s = String(status || "").toLowerCase();
  if (s.includes("approved") || s.includes("queued")) return "good";
  if (s.includes("pending")) return "warn";
  if (s.includes("rejected") || s.includes("failed") || s.includes("error")) return "bad";
  return "neutral";
}

export default function ApprovalsPage() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [organisationId, setOrganisationId] = useState<string | null>(null);
  const [rows, setRows] = useState<ScheduledPost[]>([]);

  // UX
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [note, setNote] = useState(""); // optional reason for reject

  const resolveOrg = async () => {
    const res = await fetch("/api/social-accounts", { method: "GET" });
    const data: SocialAccountsResp = await res.json().catch(() => ({}));

    const org =
      typeof data?.organisationId === "string"
        ? data.organisationId
        : typeof (data as any)?.organisation_id === "string"
        ? (data as any).organisation_id
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
        throw new Error(data?.error || `Failed to load scheduled posts (HTTP ${res.status}).`);
      }

      setRows(Array.isArray(data?.items) ? data.items : []);
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

  const pending = useMemo(() => {
    const q = query.trim().toLowerCase();

    const filtered = rows.filter((r) => String(r.status || "").toLowerCase() === "pending_approval");

    if (!q) return filtered;

    return filtered.filter((r) => {
      const hay = `${r.message || ""} ${prettyPlatforms(r.platforms)} ${r.scheduled_for || ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [rows, query]);

  const recentlyDecided = useMemo(() => {
    // show last 25 approvals/rejections for confidence
    return rows
      .filter((r) => {
        const s = String(r.status || "").toLowerCase();
        return s === "queued" || s === "rejected";
      })
      .sort((a, b) => new Date(b.scheduled_for).getTime() - new Date(a.scheduled_for).getTime())
      .slice(0, 25);
  }, [rows]);

  const selected = useMemo(() => {
    return pending.find((x) => x.id === selectedId) || null;
  }, [pending, selectedId]);

  useEffect(() => {
    setNote("");
  }, [selectedId]);

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
        body: JSON.stringify({
          id: selected.id,
          action,
          note: note.trim() || null,
        }),
      });

      const data: any = await res.json().catch(() => null);

      if (!res.ok || data?.success === false) {
        throw new Error(data?.error || `Failed to ${action} (HTTP ${res.status}).`);
      }

      // Optimistic UI: update local row status
      setRows((prev) =>
        prev.map((r) => {
          if (r.id !== selected.id) return r;
          const newStatus = action === "approve" ? "queued" : "rejected";
          const nextMeta = { ...(r.meta || {}), decision_note: note.trim() || null, decided_at: new Date().toISOString() };
          return { ...r, status: newStatus, meta: nextMeta };
        })
      );

      // Clear selection (so it doesn't feel "stuck")
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
              Enterprise safety: posts can be created anywhere, but only move to the publishing queue after approval.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Pill tone="warn">Pending: {pending.length}</Pill>
            <Pill>Recent decisions: {recentlyDecided.length}</Pill>

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
              <div className="text-base font-semibold">Search</div>
              <div className="mt-1 text-xs text-slate-300">Filter pending approvals by text/platform/date.</div>
            </div>

            <input
              className="w-full md:w-[420px] rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-50 placeholder:text-slate-500 outline-none focus:border-emerald-400/50 focus:ring-1 focus:ring-emerald-400/30"
              placeholder="Search pending approvals…"
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
            <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-slate-300">
              Loading approvals…
            </div>
          )}
        </GlassCard>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Left list */}
          <div className="lg:col-span-2 space-y-3">
            {!loading && pending.length === 0 ? (
              <div className="rounded-3xl border border-white/10 bg-white/5 p-6 text-sm text-slate-300">
                No pending approvals right now.
                <div className="mt-2 text-[11px] text-slate-400">
                  Tip: set any scheduled_posts row status to <span className="text-slate-200 font-semibold">pending_approval</span> to test.
                </div>
              </div>
            ) : (
              pending.map((p) => {
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
                        <span className="ml-2 text-[11px] font-normal text-slate-400">
                          {safeDate(p.scheduled_for)}
                        </span>
                      </div>
                      <Pill tone={statusTone(p.status)}>{p.status}</Pill>
                    </div>

                    <div className="mt-3 text-sm text-slate-100 line-clamp-3 whitespace-pre-wrap">{p.message}</div>

                    {p.image_url ? (
                      <div className="mt-2 text-[11px] text-slate-400 truncate">Image: {p.image_url}</div>
                    ) : null}
                  </button>
                );
              })
            )}
          </div>

          {/* Right panel */}
          <div className="space-y-6">
            <GlassCard className="p-6">
              <div className="text-base font-semibold">Review</div>
              <div className="mt-1 text-xs text-slate-300">Approve moves it to the publishing queue (status becomes queued).</div>

              {!selected ? (
                <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-slate-300">
                  Select a pending item to review.
                </div>
              ) : (
                <div className="mt-4 space-y-4">
                  <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-semibold">{prettyPlatforms(selected.platforms)}</div>
                      <Pill tone="warn">pending_approval</Pill>
                    </div>
                    <div className="mt-2 text-[11px] text-slate-400">{safeDate(selected.scheduled_for)}</div>
                    <div className="mt-3 text-sm whitespace-pre-wrap">{selected.message}</div>
                    {selected.image_url ? (
                      <div className="mt-3 text-[11px] text-slate-400 truncate">Image: {selected.image_url}</div>
                    ) : null}
                  </div>

                  <textarea
                    className="w-full min-h-[90px] rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:border-emerald-400/50 focus:ring-1 focus:ring-emerald-400/30"
                    placeholder="Optional note (why approved/rejected)…"
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

                  <div className="text-[11px] text-slate-400">
                    Approve = status <span className="text-slate-200 font-semibold">queued</span> (dispatcher can publish). Reject = status{" "}
                    <span className="text-slate-200 font-semibold">rejected</span>.
                  </div>
                </div>
              )}
            </GlassCard>

            <GlassCard className="p-6">
              <div className="text-base font-semibold">Recent decisions</div>
              <div className="mt-2 text-xs text-slate-300">Confidence panel: shows the last 25 items you approved/rejected.</div>

              {recentlyDecided.length === 0 ? (
                <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-slate-300">
                  Nothing decided yet.
                </div>
              ) : (
                <div className="mt-4 space-y-3">
                  {recentlyDecided.map((p) => (
                    <div key={p.id} className="rounded-2xl border border-white/10 bg-black/20 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-[11px] text-slate-400">
                          {safeDate(p.scheduled_for)} · <span className="text-slate-200">{prettyPlatforms(p.platforms)}</span>
                        </div>
                        <Pill tone={statusTone(p.status)}>{p.status}</Pill>
                      </div>
                      <div className="mt-2 text-sm line-clamp-2 whitespace-pre-wrap">{p.message}</div>
                    </div>
                  ))}
                </div>
              )}
            </GlassCard>
          </div>
        </div>

        <div className="text-[11px] text-slate-500">
          Enterprise note: No organisation IDs are displayed anywhere on this page.
        </div>
      </div>
    </div>
  );
}
