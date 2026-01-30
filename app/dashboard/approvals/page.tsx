// app/dashboard/approvals/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";

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
type OrgPlanResp = {
  ok?: boolean;
  organisationId?: string;
  tier?: "solo" | "growth" | "team";
  approvalsEnabled?: boolean;
  error?: string;
};

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
  if (s.includes("queued") || s.includes("approved")) return "good";
  if (s.includes("pending")) return "warn";
  if (s.includes("rejected") || s.includes("failed") || s.includes("error")) return "bad";
  return "neutral";
}

const DEMO_PENDING: ScheduledPost[] = [
  {
    id: "demo-1",
    organisation_id: "demo",
    message: "Demo: A gentle reminder that small steps still count. 🌱",
    platforms: ["instagram", "facebook"],
    scheduled_for: new Date(Date.now() + 1000 * 60 * 60 * 6).toISOString(),
    status: "pending_approval",
  },
  {
    id: "demo-2",
    organisation_id: "demo",
    message: "Demo: 3 grounding tips for anxious mornings (save this).",
    platforms: ["linkedin"],
    scheduled_for: new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString(),
    status: "pending_approval",
  },
];

export default function ApprovalsPage() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [organisationId, setOrganisationId] = useState<string | null>(null);
  const [rows, setRows] = useState<ScheduledPost[]>([]);

  const [tier, setTier] = useState<"solo" | "growth" | "team">("solo");
  const [approvalsEnabled, setApprovalsEnabled] = useState(false);

  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [note, setNote] = useState("");

  const resolveOrg = async () => {
    const res = await fetch("/api/social-accounts", { method: "GET", cache: "no-store" });
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

  const loadPlan = async (org: string) => {
    const res = await fetch(`/api/org/plan?organisationId=${encodeURIComponent(org)}`, {
      cache: "no-store",
    });
    const data: OrgPlanResp = await res.json().catch(() => ({} as any));

    if (!data?.ok) {
      // fail safe: lock approvals
      setTier("solo");
      setApprovalsEnabled(false);
      return;
    }

    setTier(data.tier || "solo");
    setApprovalsEnabled(Boolean(data.approvalsEnabled));
  };

  const load = async () => {
    setLoading(true);
    setError(null);

    try {
      const org = organisationId || (await resolveOrg());

      // 1) plan guard
      await loadPlan(org);

      // 2) if locked, we still allow demo view (no DB calls required)
      // But we DO load scheduled posts so Team users see real queue.
      const planRes = await fetch(`/api/org/plan?organisationId=${encodeURIComponent(org)}`, {
        cache: "no-store",
      });
      const planJson: OrgPlanResp = await planRes.json().catch(() => ({} as any));
      const canLoadReal = Boolean(planJson?.approvalsEnabled);

      if (!canLoadReal) {
        setRows(DEMO_PENDING);
        return;
      }

      const res = await fetch(`/api/schedule/list?organisationId=${encodeURIComponent(org)}`, {
        cache: "no-store",
      });
      const data: any = await res.json().catch(() => ({}));

      if (!res.ok || data?.ok === false) {
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
    const base = rows.filter((r) => String(r.status || "").toLowerCase() === "pending_approval");
    if (!q) return base;

    return base.filter((r) => {
      const hay = `${r.message || ""} ${prettyPlatforms(r.platforms)} ${r.scheduled_for || ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [rows, query]);

  const selected = useMemo(() => pending.find((x) => x.id === selectedId) || null, [pending, selectedId]);

  useEffect(() => setNote(""), [selectedId]);

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

    // UI guard too
    if (!approvalsEnabled || tier !== "team") {
      setError("Approvals are available on the Team plan.");
      return;
    }

    // Demo items should not call API
    if (String(selected.id || "").startsWith("demo-")) {
      setError("This is a demo item. Upgrade to Team to use approvals on real scheduled posts.");
      return;
    }

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

      // Optimistic UI update
      const newStatus = action === "approve" ? "queued" : "rejected";
      setRows((prev) => prev.map((r) => (r.id === selected.id ? { ...r, status: newStatus } : r)));

      setSelectedId(null);
      setNote("");
    } catch (e: any) {
      setError(e?.message || "Action failed.");
    }
  };

  const locked = !approvalsEnabled || tier !== "team";

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
              Enterprise guard rail: approvals are a <span className="text-slate-100 font-semibold">Team</span> feature.
              {locked ? " You can still demo the screen here." : " Approve → status becomes queued."}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Pill tone={locked ? "warn" : "good"}>{locked ? `Locked (${tier})` : "Enabled (team)"}</Pill>
            <Pill tone="warn">Pending: {pending.length}</Pill>
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

        {locked ? (
          <GlassCard className="p-6">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <div className="text-base font-semibold">Team feature</div>
                <div className="mt-1 text-xs text-slate-300">
                  Approvals are designed for clinics / collectives where posts need sign-off.
                </div>
              </div>

              <div className="flex gap-2 flex-wrap">
                <Link
                  href="/pricing"
                  className="rounded-2xl bg-emerald-400 px-4 py-3 text-sm font-semibold text-slate-950 hover:bg-emerald-300 transition"
                >
                  See Team pricing →
                </Link>
                <Link
                  href="/dashboard/connect"
                  className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-slate-100 hover:bg-white/10 transition"
                >
                  Back to dashboard
                </Link>
              </div>
            </div>
          </GlassCard>
        ) : null}

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
          <div className="lg:col-span-2 space-y-3">
            {!loading && pending.length === 0 ? (
              <div className="rounded-3xl border border-white/10 bg-white/5 p-6 text-sm text-slate-300">
                No pending approvals right now.
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
                        <span className="ml-2 text-[11px] font-normal text-slate-400">{safeDate(p.scheduled_for)}</span>
                      </div>
                      <Pill tone={statusTone(p.status)}>{p.status}</Pill>
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
              <div className="mt-1 text-xs text-slate-300">
                {locked ? "Demo mode: upgrade to Team to approve/reject real posts." : "Approve moves it to publishing queue (queued)."}
              </div>

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
                      disabled={locked}
                      className={[
                        "flex-1 rounded-2xl px-4 py-3 text-sm font-semibold transition",
                        locked
                          ? "bg-emerald-500/30 text-slate-200 cursor-not-allowed"
                          : "bg-emerald-500 text-slate-950 hover:bg-emerald-400",
                      ].join(" ")}
                    >
                      Approve
                    </button>

                    <button
                      type="button"
                      onClick={() => act("reject")}
                      disabled={locked}
                      className={[
                        "flex-1 rounded-2xl border px-4 py-3 text-sm font-semibold transition",
                        locked
                          ? "border-red-400/20 bg-red-400/5 text-red-200/70 cursor-not-allowed"
                          : "border-red-400/30 bg-red-400/10 text-red-100 hover:bg-red-400/15",
                      ].join(" ")}
                    >
                      Reject
                    </button>
                  </div>

                  {locked ? (
                    <Link
                      href="/pricing"
                      className="block text-center rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-slate-100 hover:bg-white/10 transition"
                    >
                      Upgrade to Team to unlock approvals →
                    </Link>
                  ) : null}
                </div>
              )}
            </GlassCard>

            <GlassCard className="p-6">
              <div className="text-base font-semibold">Enterprise safety</div>
              <div className="mt-2 text-sm text-slate-300 whitespace-pre-wrap">
                • Approvals do not create posts.\n
                • They only move existing scheduled posts into the publish queue.\n
                • Next step: permissions + audit trail.
              </div>
            </GlassCard>
          </div>
        </div>

        <div className="text-[11px] text-slate-500">Organisation IDs remain hidden from users.</div>
      </div>
    </div>
  );
}
