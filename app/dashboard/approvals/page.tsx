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

type ApiListResp = { items?: ScheduledPost[]; error?: string; ok?: boolean; organisationId?: string };

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

type PlanKey = "solo" | "growth" | "team" | "unknown";

function planLabel(p: PlanKey) {
  if (p === "team") return "Team";
  if (p === "growth") return "Growth";
  if (p === "solo") return "Solo";
  return "Unknown";
}

export default function ApprovalsPage() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [organisationId, setOrganisationId] = useState<string | null>(null);
  const [rows, setRows] = useState<ScheduledPost[]>([]);

  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [note, setNote] = useState("");

  // Guardrails
  const [plan, setPlan] = useState<PlanKey>("unknown");
  const [locked, setLocked] = useState<boolean>(true);
  const [demoMode, setDemoMode] = useState<boolean>(false);

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

  const loadPlan = async () => {
    try {
      const res = await fetch("/api/org/plan", { cache: "no-store" });
      const data: any = await res.json().catch(() => null);

      const p = String(data?.plan || "").toLowerCase().trim();
      const resolved: PlanKey =
        p === "team" || p === "enterprise" ? "team" : p === "growth" || p === "pro" ? "growth" : p === "solo" || p === "basic" ? "solo" : "unknown";

      setPlan(resolved);

      const isTeam = resolved === "team";
      setLocked(!isTeam);

      // Demo mode: locked users see demo items
      setDemoMode(!isTeam);
    } catch {
      setPlan("unknown");
      setLocked(true);
      setDemoMode(true);
    }
  };

  const demoItems: ScheduledPost[] = [
    {
      id: "demo-1",
      organisation_id: "demo",
      message: "🌿 Demo: A gentle reminder — progress is built from small steps, not pressure.",
      platforms: ["instagram", "facebook"],
      scheduled_for: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      status: "pending_approval",
      meta: { demo: true },
    },
    {
      id: "demo-2",
      organisation_id: "demo",
      message: "🧠 Demo: ‘Brainstorm’ makes content feel like a conversation, not a chore.",
      platforms: ["linkedin"],
      scheduled_for: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
      status: "pending_approval",
      meta: { demo: true },
    },
  ];

  const load = async () => {
    setLoading(true);
    setError(null);

    try {
      await loadPlan();

      // If locked, show demo items and stop here.
      if (demoMode) {
        setRows(demoItems);
        return;
      }

      const org = organisationId || (await resolveOrg());

      const res = await fetch(`/api/schedule/list?organisationId=${encodeURIComponent(org)}`, {
        cache: "no-store",
      });

      const data: ApiListResp = await res.json().catch(() => ({}));

      if (!res.ok || data?.ok === false) {
        throw new Error(data?.error || `Failed to load scheduled posts (HTTP ${res.status}).`);
      }

      setRows(Array.isArray(data?.items) ? data.items : []);
    } catch (e: any) {
      setError(e?.message || "Could not load approvals queue.");
      setRows(demoMode ? demoItems : []);
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

    // Locked = show a friendly message and do nothing
    if (locked) {
      setError("Approvals are available on the Team plan. This page is in Demo mode right now.");
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

      const newStatus = action === "approve" ? "queued" : "rejected";
      setRows((prev) => prev.map((r) => (r.id === selected.id ? { ...r, status: newStatus } : r)));

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
              Posts with <span className="text-slate-100 font-semibold">status = pending_approval</span> appear here.
              Approve → status becomes <span className="text-slate-100 font-semibold">queued</span>.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Pill tone={locked ? "warn" : "good"}>{locked ? `Locked (${planLabel(plan)}) • Demo mode` : `Enabled (${planLabel(plan)})`}</Pill>
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

          {locked && (
            <div className="mt-4 rounded-2xl border border-amber-400/30 bg-amber-400/10 p-4 text-sm text-amber-100">
              Approvals are a <span className="font-semibold">Team</span> feature. You’re viewing <span className="font-semibold">Demo mode</span>.
              <div className="mt-2">
                <a href="/pricing" className="underline hover:text-amber-50">View plans →</a>
              </div>
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
                  <div
                    key={p.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedId(p.id)}
                    onKeyDown={(e) => {
                      // prevents page scroll/focus jumps from keypresses
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setSelectedId(p.id);
                      }
                    }}
                    className={[
                      "w-full text-left rounded-2xl border p-4 transition cursor-pointer select-none outline-none",
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
                  </div>
                );
              })
            )}
          </div>

          <div className="space-y-6">
            <GlassCard className="p-6">
              <div className="text-base font-semibold">Review</div>
              <div className="mt-1 text-xs text-slate-300">Approve moves it to publishing queue (queued).</div>

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
                    onKeyDown={(e) => {
                      // 🔥 critical: stop key events bubbling into the list (prevents scroll jumps)
                      e.stopPropagation();
                    }}
                    onKeyUp={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                  />

                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={locked}
                      onClick={() => act("approve")}
                      className={[
                        "flex-1 rounded-2xl px-4 py-3 text-sm font-semibold transition",
                        locked
                          ? "bg-white/5 text-slate-400 cursor-not-allowed border border-white/10"
                          : "bg-emerald-500 text-slate-950 hover:bg-emerald-400",
                      ].join(" ")}
                    >
                      Approve
                    </button>

                    <button
                      type="button"
                      disabled={locked}
                      onClick={() => act("reject")}
                      className={[
                        "flex-1 rounded-2xl px-4 py-3 text-sm font-semibold transition",
                        locked
                          ? "bg-white/5 text-slate-400 cursor-not-allowed border border-white/10"
                          : "border border-red-400/30 bg-red-400/10 text-red-100 hover:bg-red-400/15",
                      ].join(" ")}
                    >
                      Reject
                    </button>
                  </div>
                </div>
              )}
            </GlassCard>

            <GlassCard className="p-6">
              <div className="text-base font-semibold">Enterprise safety</div>
              <div className="mt-2 text-sm text-slate-300 whitespace-pre-wrap">
                • Approvals do not create posts.{"\n"}
                • They only move existing scheduled posts into the publish queue.{"\n"}
                • Next step after this: permissions + audit trail.
              </div>
            </GlassCard>
          </div>
        </div>

        <div className="text-[11px] text-slate-500">Organisation IDs remain hidden from users.</div>
      </div>
    </div>
  );
}
