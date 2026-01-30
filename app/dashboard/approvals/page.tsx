// app/dashboard/approvals/page.tsx
"use client";

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

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

type ApiListResp = {
  ok?: boolean;
  organisationId?: string;
  items?: ScheduledPost[];
  error?: string;
};

type ApiUpdateResp = {
  success?: boolean;
  id?: string;
  status?: string;
  error?: string;
  details?: string;
};

type TabKey = "pending" | "queued" | "rejected" | "all";

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

function uid(prefix = "demo") {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
}

function demoSeed(orgId: string): ScheduledPost[] {
  const now = Date.now();
  return [
    {
      id: uid("demo"),
      organisation_id: orgId,
      message:
        "🧠 Brainstorm prompt: “What’s one gentle reframe for someone who feels stuck?”\n\nDraft a calm post inviting clients to take one small step today.",
      platforms: ["instagram", "facebook"],
      scheduled_for: new Date(now + 60 * 60 * 1000).toISOString(),
      status: "pending_approval",
      created_at: new Date(now - 15 * 60 * 1000).toISOString(),
      meta: { demo: true },
    },
    {
      id: uid("demo"),
      organisation_id: orgId,
      message:
        "🌿 Quick story idea: “3 signs you’re making progress (even if you can’t feel it yet).”\n\nKeep it compassionate. No hype. One small CTA.",
      platforms: ["linkedin"],
      scheduled_for: new Date(now + 2 * 60 * 60 * 1000).toISOString(),
      status: "pending_approval",
      created_at: new Date(now - 22 * 60 * 1000).toISOString(),
      meta: { demo: true },
    },
    {
      id: uid("demo"),
      organisation_id: orgId,
      message:
        "✅ Queued example: after you approve something, it should show here.\n\n(So you can SEE the queued list.)",
      platforms: ["facebook"],
      scheduled_for: new Date(now + 4 * 60 * 60 * 1000).toISOString(),
      status: "queued",
      created_at: new Date(now - 60 * 60 * 1000).toISOString(),
      meta: { demo: true },
    },
    {
      id: uid("demo"),
      organisation_id: orgId,
      message:
        "❌ Rejected example: too salesy / not aligned.\n\n(So you can SEE the rejected list.)",
      platforms: ["instagram"],
      scheduled_for: new Date(now + 6 * 60 * 60 * 1000).toISOString(),
      status: "rejected",
      created_at: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
      meta: { demo: true },
    },
  ];
}

export default function ApprovalsPage() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [organisationId, setOrganisationId] = useState<string | null>(null);
  const [rows, setRows] = useState<ScheduledPost[]>([]);

  const [tab, setTab] = useState<TabKey>("pending");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [note, setNote] = useState("");

  // Search input: keep focus stable
  const searchRef = useRef<HTMLInputElement | null>(null);
  const searchHadFocus = useRef(false);

  // Note textarea: preserve caret (THIS fixes mirrored typing)
  const noteRef = useRef<HTMLTextAreaElement | null>(null);
  const noteSelectionRef = useRef<{ start: number; end: number } | null>(null);
  const noteHadFocus = useRef(false);

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

  const ensureActionableOrDemo = (orgId: string, incoming: ScheduledPost[]) => {
    const list = Array.isArray(incoming) ? incoming : [];
    const actionableCount = list.filter((r) => {
      const s = String(r.status || "").toLowerCase();
      return s === "pending_approval" || s === "queued" || s === "rejected";
    }).length;

    if (actionableCount === 0) return [...demoSeed(orgId), ...list];
    return list;
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

      if (!data?.ok) throw new Error(data?.error || "Failed to load scheduled posts.");

      const list = Array.isArray(data?.items) ? data.items : [];
      setRows(ensureActionableOrDemo(org, list));
    } catch (e: any) {
      try {
        const org = organisationId || (await resolveOrg());
        setRows(demoSeed(org));
      } catch {
        setRows(demoSeed("demo-org"));
      }
      setError(e?.message || "Could not load approvals queue.");
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

  // Keep focus on search after re-renders if it had focus
  useEffect(() => {
    if (searchHadFocus.current) {
      requestAnimationFrame(() => searchRef.current?.focus());
    }
  }, [query, tab, rows.length]);

  // Restore textarea caret after note updates (no forced focus, just caret restore)
  useLayoutEffect(() => {
    if (!noteHadFocus.current) return;
    const el = noteRef.current;
    const sel = noteSelectionRef.current;
    if (!el || !sel) return;

    try {
      el.setSelectionRange(sel.start, sel.end);
    } catch {
      // ignore
    }
  }, [note]);

  const counts = useMemo(() => {
    const pending = rows.filter((r) => String(r.status || "").toLowerCase() === "pending_approval").length;
    const queued = rows.filter((r) => String(r.status || "").toLowerCase() === "queued").length;
    const rejected = rows.filter((r) => String(r.status || "").toLowerCase() === "rejected").length;
    return { pending, queued, rejected, all: rows.length };
  }, [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();

    const base =
      tab === "pending"
        ? rows.filter((r) => String(r.status || "").toLowerCase() === "pending_approval")
        : tab === "queued"
        ? rows.filter((r) => String(r.status || "").toLowerCase() === "queued")
        : tab === "rejected"
        ? rows.filter((r) => String(r.status || "").toLowerCase() === "rejected")
        : rows;

    if (!q) return base;

    return base.filter((r) => {
      const hay = `${r.message || ""} ${prettyPlatforms(r.platforms)} ${r.scheduled_for || ""} ${r.status || ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [rows, tab, query]);

  const selected = useMemo(() => rows.find((x) => x.id === selectedId) || null, [rows, selectedId]);

  useEffect(() => setNote(""), [selectedId]);

  const isDemo = useMemo(() => rows.some((r) => Boolean(r?.meta?.demo)), [rows]);

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

  const TabButton = ({ k, label, count }: { k: TabKey; label: string; count: number }) => {
    const active = tab === k;
    return (
      <button
        type="button"
        onClick={() => setTab(k)}
        className={[
          "rounded-full px-4 py-2 text-xs font-semibold border transition",
          active
            ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-100"
            : "border-white/10 bg-white/5 text-slate-200 hover:bg-white/10",
        ].join(" ")}
      >
        {label} <span className="ml-2 text-[11px] text-slate-400">({count})</span>
      </button>
    );
  };

  const act = async (action: "approve" | "reject") => {
    if (!selected) return;
    setError(null);

    const newStatus = action === "approve" ? "queued" : "rejected";

    // Demo: local update only
    if (selected?.meta?.demo) {
      setRows((prev) => prev.map((r) => (r.id === selected.id ? { ...r, status: newStatus } : r)));
      if (action === "approve") setTab("queued");
      setSelectedId(null);
      setNote("");
      return;
    }

    try {
      const org = organisationId || (await resolveOrg());

      const res = await fetch(`/api/approvals/update?organisationId=${encodeURIComponent(org)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: selected.id, action, note: note.trim() || null }),
      });

      const data: ApiUpdateResp = await res.json().catch(() => ({}));
      if (!res.ok || data?.success === false) throw new Error(data?.error || data?.details || `Failed (HTTP ${res.status}).`);

      setRows((prev) => prev.map((r) => (r.id === selected.id ? { ...r, status: newStatus } : r)));
      if (action === "approve") setTab("queued");
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
              Review scheduled posts before they publish. Approve → moves to <span className="text-slate-100 font-semibold">Queued</span>.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {isDemo ? <Pill tone="warn">Demo mode</Pill> : null}
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
          <div className="flex flex-wrap gap-2">
            <TabButton k="pending" label="Pending" count={counts.pending} />
            <TabButton k="queued" label="Queued" count={counts.queued} />
            <TabButton k="rejected" label="Rejected" count={counts.rejected} />
            <TabButton k="all" label="All" count={counts.all} />
          </div>

          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <div className="text-base font-semibold">Search</div>
              <div className="mt-1 text-xs text-slate-300">Filter by text/platform/date/status.</div>
            </div>

            <input
              ref={searchRef}
              className="w-full md:w-[420px] rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-50 placeholder:text-slate-500 outline-none focus:border-emerald-400/50 focus:ring-1 focus:ring-emerald-400/30"
              placeholder="Search…"
              value={query}
              onFocus={() => (searchHadFocus.current = true)}
              onBlur={() => (searchHadFocus.current = false)}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDownCapture={(e) => e.stopPropagation()}
            />
          </div>

          {error && (
            <div className="rounded-2xl border border-red-500/40 bg-red-950/40 p-4 text-sm text-red-200 whitespace-pre-wrap">
              {error}
            </div>
          )}

          {loading && (
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-slate-300">Loading…</div>
          )}
        </GlassCard>

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-3">
            {!loading && filtered.length === 0 ? (
              <div className="rounded-3xl border border-white/10 bg-white/5 p-6 text-sm text-slate-300">Nothing in this view.</div>
            ) : (
              filtered.map((p) => {
                const isSelected = p.id === selectedId;

                return (
                  <div
                    key={p.id}
                    tabIndex={-1}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => setSelectedId(p.id)}
                    className={[
                      "w-full cursor-pointer text-left rounded-2xl border p-4 transition select-none",
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
              <div className="mt-1 text-xs text-slate-300">Approve → queued. Reject → rejected.</div>

              {!selected ? (
                <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-slate-300">Select an item to review.</div>
              ) : (
                <div className="mt-4 space-y-4">
                  <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-semibold">{prettyPlatforms(selected.platforms)}</div>
                      <Pill tone={statusTone(selected.status)}>{selected.status}</Pill>
                    </div>
                    <div className="mt-2 text-[11px] text-slate-400">{safeDate(selected.scheduled_for)}</div>
                    <div className="mt-3 text-sm whitespace-pre-wrap">{selected.message}</div>
                  </div>

                  <textarea
                    ref={noteRef}
                    dir="ltr"
                    className="w-full min-h-[110px] rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:border-emerald-400/50 focus:ring-1 focus:ring-emerald-400/30"
                    placeholder="Optional note (why approved/rejected)…"
                    value={note}
                    onFocus={() => (noteHadFocus.current = true)}
                    onBlur={() => {
                      noteHadFocus.current = false;
                      noteSelectionRef.current = null;
                    }}
                    onChange={(e) => {
                      // capture caret BEFORE state update
                      const start = e.target.selectionStart ?? 0;
                      const end = e.target.selectionEnd ?? start;
                      noteSelectionRef.current = { start, end };
                      setNote(e.target.value);
                    }}
                    onKeyDownCapture={(e) => e.stopPropagation()}
                  />

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => act("approve")}
                      disabled={String(selected.status || "").toLowerCase() === "queued"}
                      className="flex-1 rounded-2xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-slate-950 hover:bg-emerald-400 transition disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      Approve
                    </button>

                    <button
                      type="button"
                      onClick={() => act("reject")}
                      disabled={String(selected.status || "").toLowerCase() === "rejected"}
                      className="flex-1 rounded-2xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm font-semibold text-red-100 hover:bg-red-400/15 transition disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      Reject
                    </button>
                  </div>

                  {selected?.meta?.demo ? (
                    <div className="text-[11px] text-slate-500">Demo item — actions update locally only (no DB writes).</div>
                  ) : null}
                </div>
              )}
            </GlassCard>

            <GlassCard className="p-6">
              <div className="text-base font-semibold">Queued list</div>
              <div className="mt-2 text-sm text-slate-300 whitespace-pre-wrap">
                After approve, switch to the <b>Queued</b> tab.\n(This page auto-switches to Queued after approve.)
              </div>
            </GlassCard>
          </div>
        </div>

        <div className="text-[11px] text-slate-500">Organisation IDs remain hidden from users.</div>
      </div>
    </div>
  );
}
