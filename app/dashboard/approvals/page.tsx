"use client";

import React, { useEffect, useMemo, useState } from "react";

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

type PlanKey = "solo" | "growth" | "team" | "unknown";

// ---------- helpers (TOP LEVEL — do not define inside component) ----------
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
  return v === "pending" || v === "pending_approval" || v === "needs_approval";
}

function isQueued(s: any) {
  return normStatus(s) === "queued";
}

function isDemoId(id: string) {
  return String(id || "").startsWith("demo-");
}

function useDebouncedValue<T>(value: T, delayMs: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

function buildDemoRows(orgId: string): ScheduledPost[] {
  const now = Date.now();
  const in10 = new Date(now + 10 * 60 * 1000).toISOString();
  const in30 = new Date(now + 30 * 60 * 1000).toISOString();
  const in60 = new Date(now + 60 * 60 * 1000).toISOString();

  return [
    {
      id: `demo-${crypto.randomUUID()}`,
      organisation_id: orgId,
      message:
        "Demo: A gentle reminder — you don’t have to carry it all alone. If today is heavy, you can do one small kind thing and call it enough.",
      platforms: ["instagram", "threads"],
      image_url: null,
      scheduled_for: in10,
      status: "pending_approval",
      created_at: new Date().toISOString(),
      meta: { demo: true },
    },
    {
      id: `demo-${crypto.randomUUID()}`,
      organisation_id: orgId,
      message:
        "Demo: ‘Progress’ can be quiet. Showing up consistently — without burning out — is a win.",
      platforms: ["linkedin"],
      image_url: null,
      scheduled_for: in30,
      status: "pending_approval",
      created_at: new Date().toISOString(),
      meta: { demo: true },
    },
    {
      id: `demo-${crypto.randomUUID()}`,
      organisation_id: orgId,
      message:
        "Demo: This one is already queued — imagine it has passed review and is ready to publish at the scheduled time.",
      platforms: ["facebook"],
      image_url: null,
      scheduled_for: in60,
      status: "queued",
      created_at: new Date().toISOString(),
      meta: { demo: true },
    },
  ];
}

// ---------- UI components (TOP LEVEL — stable component identities) ----------
function Pill({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "good" | "warn" | "bad";
}) {
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
}

function GlassCard({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={[
        "rounded-3xl border border-white/10 bg-white/5 shadow-[0_20px_60px_rgba(0,0,0,0.35)] backdrop-blur-xl",
        className,
      ].join(" ")}
    >
      {children}
    </div>
  );
}

// -------------------------------------------------------------------------
export default function ApprovalsPage() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [organisationId, setOrganisationId] = useState<string | null>(null);
  const [rows, setRows] = useState<ScheduledPost[]>([]);

  // Search (debounced)
  const [queryRaw, setQueryRaw] = useState("");
  const query = useDebouncedValue(queryRaw, 180);

  const [tab, setTab] = useState<"pending" | "queued" | "all">("pending");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [note, setNote] = useState("");

  // Plan / gating
  const [plan, setPlan] = useState<PlanKey>("unknown");
  const approvalsUnlocked = plan === "team";

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

  const loadPlan = async () => {
    try {
      const res = await fetch("/api/billing/plan", { cache: "no-store" });
      const data: any = await res.json().catch(() => null);
      const p = String(data?.plan || "").toLowerCase().trim();

      if (p === "enterprise" || p === "team") return setPlan("team");
      if (p === "pro" || p === "growth") return setPlan("growth");
      if (p === "basic" || p === "solo") return setPlan("solo");

      setPlan("unknown");
    } catch {
      setPlan("unknown");
    }
  };

  const load = async () => {
    setLoading(true);
    setError(null);

    try {
      const org = organisationId || (await resolveOrg());
      void loadPlan();

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

  // Keep selection stable
  useEffect(() => {
    const exists = rows.some((r) => r.id === selectedId);
    if (selectedId && !exists) setSelectedId(null);
  }, [rows, selectedId]);

  useEffect(() => setNote(""), [selectedId]);

  const counts = useMemo(() => {
    const pending = rows.filter((r) => isPending(r.status)).length;
    const queued = rows.filter((r) => isQueued(r.status)).length;
    return { pending, queued, all: rows.length };
  }, [rows]);

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

  const act = async (action: "approve" | "reject") => {
    if (!selected) return;

    // Demo rows: local-only
    if (isDemoId(selected.id)) {
      const newStatus = action === "approve" ? "queued" : "rejected";
      setRows((prev) =>
        prev.map((r) => (r.id === selected.id ? { ...r, status: newStatus, meta: { ...(r.meta || {}), note } } : r))
      );
      setSelectedId(null);
      setNote("");
      return;
    }

    // Real rows: Team-only actions
    if (!approvalsUnlocked) {
      setError("Approvals actions are available on the Team plan.");
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

  const injectDemo = async () => {
    setError(null);
    try {
      const org = organisationId || (await resolveOrg());
      const demo = buildDemoRows(org);

      setRows((prev) => {
        const prevNonDemo = prev.filter((r) => !isDemoId(r.id));
        return [...demo, ...prevNonDemo];
      });

      setTab("pending");
      setQueryRaw("");
      setSelectedId(demo[0]?.id || null);
    } catch (e: any) {
      setError(e?.message || "Could not load demo items.");
    }
  };

  const teamTooltip = "Team plan feature: unlocks collaborative approvals + shared workflows.";

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
              Review scheduled posts safely. Approve moves items into{" "}
              <span className="text-slate-100 font-semibold">queued</span>.
            </p>
            <div className="mt-2 text-[12px] text-slate-400">
              Plan detected:{" "}
              <span className="text-slate-200 font-semibold">
                {plan === "unknown" ? "—" : plan.toUpperCase()}
              </span>
              {approvalsUnlocked ? (
                <span className="ml-2 text-emerald-300">• approvals enabled</span>
              ) : (
                <span className="ml-2 text-amber-300">• actions locked (Team)</span>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Pill tone="warn">Pending: {counts.pending}</Pill>
            <Pill tone="good">Queued: {counts.queued}</Pill>

            <button
              type="button"
              onClick={injectDemo}
              className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-100 hover:bg-white/10 transition"
              title="Adds demo approvals (does not touch your database)."
            >
              Load demo items
            </button>

            <button
              type="button"
              onClick={refresh}
              disabled={refreshing}
              className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-100 hover:bg-white/10 disabled:opacity-60 disabled:cursor-not-allowed transition"
              title="Reload from your scheduled_posts table."
            >
              {refreshing ? "Refreshing…" : "Refresh"}
            </button>
          </div>
        </div>

        {!approvalsUnlocked && (
          <div className="rounded-3xl border border-emerald-400/20 bg-emerald-400/5 p-6">
            <div className="text-lg font-semibold text-slate-50">Approvals are part of the Team plan</div>
            <p className="mt-2 text-sm text-slate-300 leading-relaxed max-w-3xl">
              As practices grow, it can help to slow things down just enough to stay aligned.
              <br />
              <br />
              Approvals add a gentle review step — useful when you’re working with multiple practitioners,
              or when you want a second set of eyes before posts go live.
              <br />
              <br />
              Many clinicians see this as a future step — something that comes into its own as a practice becomes more collaborative.
              When the time feels right, Team unlocks approvals and shared workflows designed for clinics and collectives.
            </p>

            <div className="mt-4 flex flex-wrap gap-3">
              <a
                href="/pricing"
                className="inline-flex items-center justify-center rounded-full bg-emerald-400 px-5 py-3 text-sm font-semibold text-slate-950 hover:bg-emerald-300 transition"
              >
                Move to Team when you’re ready
              </a>
              <button
                type="button"
                onClick={injectDemo}
                className="inline-flex items-center justify-center rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-slate-100 hover:bg-white/10 transition"
              >
                Try a demo queue
              </button>
            </div>

            <div className="mt-3 text-[11px] text-slate-400">
              You can still browse this page. The approve/reject actions unlock on Team.
            </div>
          </div>
        )}

        <GlassCard className="p-6 space-y-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <div className="text-base font-semibold">Search</div>
              <div className="mt-1 text-xs text-slate-300">Filter by message, platforms, date, status.</div>
            </div>

            <input
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
                tab === "pending"
                  ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-100"
                  : "border-white/10 bg-white/5 text-slate-200 hover:bg-white/10",
              ].join(" ")}
            >
              Pending
            </button>
            <button
              type="button"
              onClick={() => setTab("queued")}
              className={[
                "rounded-full px-4 py-2 text-xs font-semibold border transition",
                tab === "queued"
                  ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-100"
                  : "border-white/10 bg-white/5 text-slate-200 hover:bg-white/10",
              ].join(" ")}
            >
              Queued
            </button>
            <button
              type="button"
              onClick={() => setTab("all")}
              className={[
                "rounded-full px-4 py-2 text-xs font-semibold border transition",
                tab === "all"
                  ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-100"
                  : "border-white/10 bg-white/5 text-slate-200 hover:bg-white/10",
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
                <div className="mt-2 text-[12px] text-slate-400">
                  Tip: click <span className="text-slate-200 font-semibold">Load demo items</span> to test approvals instantly.
                </div>
              </div>
            ) : (
              filtered.map((p) => {
                const isSelected = p.id === selectedId;
                const st = normStatus(p.status) || "scheduled";
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setSelectedId(p.id)}
                    className={[
                      "w-full text-left rounded-2xl border p-4 transition",
                      isSelected
                        ? "border-emerald-300/30 bg-emerald-300/5"
                        : "border-white/10 bg-black/20 hover:bg-white/5",
                    ].join(" ")}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-xs font-semibold text-slate-100 truncate">
                        {prettyPlatforms(p.platforms)}
                        <span className="ml-2 text-[11px] font-normal text-slate-400">
                          {safeDate(p.scheduled_for)}
                        </span>
                        {isDemoId(p.id) && <span className="ml-2 text-[11px] text-emerald-300">(demo)</span>}
                      </div>
                      <span className="inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-semibold border-white/10 bg-white/5 text-slate-200">
                        {st}
                      </span>
                    </div>

                    <div className="mt-3 text-sm text-slate-100 line-clamp-3 whitespace-pre-wrap">
                      {p.message}
                    </div>
                  </button>
                );
              })
            )}
          </div>

          <div className="space-y-6">
            <GlassCard className="p-6">
              <div className="text-base font-semibold">Review</div>
              <div className="mt-1 text-xs text-slate-300">
                Approve → queued. Reject → rejected.
                {!approvalsUnlocked && <span className="ml-2 text-amber-300">(Team unlocks actions)</span>}
              </div>

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
                      disabled={!approvalsUnlocked && !isDemoId(selected.id)}
                      title={!approvalsUnlocked && !isDemoId(selected.id) ? teamTooltip : "Approve"}
                      className={[
                        "flex-1 rounded-2xl px-4 py-3 text-sm font-semibold transition",
                        !approvalsUnlocked && !isDemoId(selected.id)
                          ? "bg-emerald-500/40 text-slate-200 cursor-not-allowed"
                          : "bg-emerald-500 text-slate-950 hover:bg-emerald-400",
                      ].join(" ")}
                    >
                      Approve
                    </button>

                    <button
                      type="button"
                      onClick={() => act("reject")}
                      disabled={!approvalsUnlocked && !isDemoId(selected.id)}
                      title={!approvalsUnlocked && !isDemoId(selected.id) ? teamTooltip : "Reject"}
                      className={[
                        "flex-1 rounded-2xl border px-4 py-3 text-sm font-semibold transition",
                        !approvalsUnlocked && !isDemoId(selected.id)
                          ? "border-red-400/20 bg-red-400/5 text-red-200/70 cursor-not-allowed"
                          : "border-red-400/30 bg-red-400/10 text-red-100 hover:bg-red-400/15",
                      ].join(" ")}
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
          </div>
        </div>
      </div>
    </div>
  );
}
