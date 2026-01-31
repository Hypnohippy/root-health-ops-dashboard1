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
  status?: string | null; // DB status (scheduled/posted/failed/cancelled/etc)
  created_at?: string;
  meta?: any; // approvals state lives here
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

function approvalState(row: ScheduledPost) {
  return String(row?.meta?.approvals?.state || "").toLowerCase().trim();
}

function isPending(row: ScheduledPost) {
  return approvalState(row) === "pending";
}

function isApproved(row: ScheduledPost) {
  return approvalState(row) === "approved";
}

function isRejected(row: ScheduledPost) {
  return approvalState(row) === "rejected";
}

function isCancelledDb(row: ScheduledPost) {
  return normStatus(row.status) === "cancelled";
}

function isPostedDb(row: ScheduledPost) {
  return normStatus(row.status) === "posted";
}

function useDebouncedValue<T>(value: T, delayMs: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

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

export default function ApprovalsPage() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // working state includes cancel now
  const [working, setWorking] = useState<
    null | "approve" | "reject" | "postnow" | "seed" | "cancel"
  >(null);

  const [error, setError] = useState<string | null>(null);

  const [organisationId, setOrganisationId] = useState<string | null>(null);
  const [rows, setRows] = useState<ScheduledPost[]>([]);

  const [queryRaw, setQueryRaw] = useState("");
  const query = useDebouncedValue(queryRaw, 140);

  const [tab, setTab] = useState<"pending" | "queued" | "all">("pending");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [note, setNote] = useState("");

  const [postNowPlatforms, setPostNowPlatforms] = useState<string[]>([]);

  const resolveOrg = async () => {
    const res = await fetch("/api/social-accounts", {
      method: "GET",
      cache: "no-store",
    });
    const data: any = await res.json().catch(() => null);

    const org =
      typeof data?.organisationId === "string"
        ? data.organisationId
        : typeof data?.organisation_id === "string"
        ? data.organisation_id
        : null;

    if (!org)
      throw new Error(
        "Workspace not loaded yet. Please refresh and try again."
      );
    setOrganisationId(org);
    return org;
  };

  const load = async () => {
    setLoading(true);
    setError(null);

    try {
      const org = organisationId || (await resolveOrg());

      const res = await fetch(
        `/api/schedule/list?organisationId=${encodeURIComponent(org)}`,
        { cache: "no-store" }
      );
      const data: ApiListResp = await res.json().catch(() => ({}));

      if (!res.ok)
        throw new Error(
          (data as any)?.error || `Failed to load (HTTP ${res.status}).`
        );

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

  useEffect(() => {
    if (!selectedId) return;
    const exists = rows.some((r) => r.id === selectedId);
    if (!exists) setSelectedId(null);
  }, [rows, selectedId]);

  const filtered = useMemo(() => {
    const q = (query || "").trim().toLowerCase();

    let base = rows;
    if (tab === "pending") base = rows.filter(isPending);

    // "queued" tab == approved and not posted/failed/cancelled
    if (tab === "queued")
      base = rows.filter(
        (r) =>
          isApproved(r) &&
          !["posted", "failed", "cancelled"].includes(normStatus(r.status))
      );

    if (!q) return base;

    return base.filter((r) => {
      const hay = `${r.message || ""} ${prettyPlatforms(
        r.platforms
      )} ${r.scheduled_for || ""} ${normStatus(r.status)} ${approvalState(r)}`.toLowerCase();
      return hay.includes(q);
    });
  }, [rows, query, tab]);

  const selected = useMemo(
    () => filtered.find((x) => x.id === selectedId) || null,
    [filtered, selectedId]
  );

  useEffect(() => {
    setNote("");
    if (selected && isApproved(selected)) {
      setPostNowPlatforms(
        Array.isArray(selected.platforms) ? selected.platforms.map(String) : []
      );
    } else {
      setPostNowPlatforms([]);
    }
  }, [selected?.id]);

  const counts = useMemo(() => {
    const pending = rows.filter(isPending).length;
    const approved = rows.filter(isApproved).length;
    const rejected = rows.filter(isRejected).length;
    return { pending, approved, rejected, all: rows.length };
  }, [rows]);

  const disabled = loading || refreshing || !!working;

  const seedDemo = async () => {
    setError(null);
    setWorking("seed");
    try {
      const org = organisationId || (await resolveOrg());
      const res = await fetch(
        `/api/approvals/demo-seed?organisationId=${encodeURIComponent(org)}`,
        { method: "POST" }
      );
      const data: any = await res.json().catch(() => null);
      if (!res.ok || data?.success === false)
        throw new Error(data?.error || `Seed failed (HTTP ${res.status})`);
      await load();
    } catch (e: any) {
      setError(e?.message || "Demo seed failed.");
    } finally {
      setWorking(null);
    }
  };

  const act = async (action: "approve" | "reject") => {
    if (!selected) return;
    setError(null);
    setWorking(action);

    try {
      const org = organisationId || (await resolveOrg());

      const res = await fetch(
        `/api/approvals/update?organisationId=${encodeURIComponent(org)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: selected.id,
            action,
            note: note.trim() || null,
          }),
        }
      );

      const data: any = await res.json().catch(() => null);
      if (!res.ok || data?.success === false)
        throw new Error(data?.error || `Failed (HTTP ${res.status}).`);

      await load();
      setSelectedId(null);
      setNote("");
    } catch (e: any) {
      setError(e?.message || "Action failed.");
    } finally {
      setWorking(null);
    }
  };

  const togglePostNowPlatform = (p: string) => {
    setPostNowPlatforms((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]
    );
  };

  const postNow = async () => {
    if (!selected) return;
    setError(null);
    setWorking("postnow");

    try {
      const org = organisationId || (await resolveOrg());
      const platforms = (postNowPlatforms || [])
        .map(String)
        .filter(Boolean);
      if (platforms.length === 0) throw new Error("Pick at least one platform.");

      const res = await fetch(
        `/api/publish/now?organisationId=${encodeURIComponent(org)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: selected.id, platforms }),
        }
      );

      const data: any = await res.json().catch(() => null);
      if (!res.ok || data?.success === false)
        throw new Error(data?.error || `Post now failed (HTTP ${res.status}).`);

      await load();
      setSelectedId(null);
      setNote("");
    } catch (e: any) {
      setError(e?.message || "Post now failed.");
    } finally {
      setWorking(null);
    }
  };

  // ✅ THIS IS THE FIX: Cancel scheduled must be POST, not GET
  const cancelScheduled = async () => {
    if (!selected) return;
    setError(null);
    setWorking("cancel");

    try {
      const org = organisationId || (await resolveOrg());

      const res = await fetch(
        `/api/scheduled/cancel?organisationId=${encodeURIComponent(org)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: selected.id }),
        }
      );

      const data: any = await res.json().catch(() => null);
      if (!res.ok || data?.ok === false)
        throw new Error(data?.error || `Cancel failed (HTTP ${res.status}).`);

      await load();
      setSelectedId(null);
      setNote("");
    } catch (e: any) {
      setError(e?.message || "Cancel failed.");
    } finally {
      setWorking(null);
    }
  };

  const tagForRow = (r: ScheduledPost) => {
    if (isCancelledDb(r)) return <Pill>cancelled</Pill>;
    if (isPostedDb(r)) return <Pill tone="good">posted</Pill>;
    if (isPending(r)) return <Pill tone="warn">pending approval</Pill>;
    if (isApproved(r)) return <Pill tone="good">approved</Pill>;
    if (isRejected(r)) return <Pill tone="bad">rejected</Pill>;
    return <Pill>normal</Pill>;
  };

  const approvedCanPostOrCancel =
    !!selected &&
    isApproved(selected) &&
    !["posted", "failed", "cancelled"].includes(normStatus(selected.status));

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
              Approvals
            </h1>
            <p className="mt-2 text-sm text-slate-300 max-w-2xl">
              Approvals state lives inside{" "}
              <span className="text-slate-100 font-semibold">meta</span> (safe
              with your DB constraints). Approve → ready. Then you can Post now
              or Cancel.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Pill tone="warn">Pending: {counts.pending}</Pill>
            <Pill tone="good">Approved: {counts.approved}</Pill>
            <Pill tone="bad">Rejected: {counts.rejected}</Pill>

            <button
              type="button"
              onClick={seedDemo}
              disabled={disabled}
              className="rounded-2xl border border-emerald-400/30 bg-emerald-400/10 px-3 py-2 text-xs font-semibold text-emerald-100 hover:bg-emerald-400/15 disabled:opacity-60"
            >
              {working === "seed" ? "Creating…" : "Create demo items"}
            </button>

            <button
              type="button"
              onClick={refresh}
              disabled={disabled}
              className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-100 hover:bg-white/10 disabled:opacity-60"
            >
              {refreshing ? "Refreshing…" : "Refresh"}
            </button>
          </div>
        </div>

        <GlassCard className="p-6 space-y-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <div className="text-base font-semibold">Search</div>
              <div className="mt-1 text-xs text-slate-300">
                Filter by text/platform/date.
              </div>
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
              Approved (ready)
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
        </GlassCard>

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-3">
            {!loading && filtered.length === 0 ? (
              <div className="rounded-3xl border border-white/10 bg-white/5 p-6 text-sm text-slate-300">
                No items in this view. Click{" "}
                <span className="text-slate-100 font-semibold">
                  Create demo items
                </span>{" "}
                to test.
              </div>
            ) : (
              filtered.map((p) => {
                const isSel = p.id === selectedId;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setSelectedId(p.id)}
                    className={[
                      "w-full text-left rounded-2xl border p-4 transition",
                      isSel
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
                      </div>
                      {tagForRow(p)}
                    </div>

                    <div className="mt-3 text-sm text-slate-100 line-clamp-3 whitespace-pre-wrap">
                      {p.message}
                    </div>
                    <div className="mt-2 text-[11px] text-slate-500">
                      DB status: {normStatus(p.status) || "(none)"}
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
                Pending: Approve/Reject. Approved: Post now or Cancel.
              </div>

              {!selected ? (
                <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-slate-300">
                  Select an item to review.
                </div>
              ) : (
                <div className="mt-4 space-y-4">
                  <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-semibold">
                        {prettyPlatforms(selected.platforms)}
                      </div>
                      {tagForRow(selected)}
                    </div>
                    <div className="mt-2 text-[11px] text-slate-400">
                      {safeDate(selected.scheduled_for)}
                    </div>
                    <div className="mt-3 text-sm whitespace-pre-wrap">
                      {selected.message}
                    </div>
                  </div>

                  <textarea
                    className="w-full min-h-[90px] rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:border-emerald-400/50 focus:ring-1 focus:ring-emerald-400/30"
                    placeholder="Optional note…"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />

                  {isPending(selected) ? (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() => act("approve")}
                        className="flex-1 rounded-2xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-slate-950 hover:bg-emerald-400 transition disabled:opacity-60"
                      >
                        {working === "approve" ? "Approving…" : "Approve"}
                      </button>

                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() => act("reject")}
                        className="flex-1 rounded-2xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm font-semibold text-red-100 hover:bg-red-400/15 transition disabled:opacity-60"
                      >
                        {working === "reject" ? "Rejecting…" : "Reject"}
                      </button>
                    </div>
                  ) : isApproved(selected) ? (
                    <div className="space-y-3">
                      <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                        <div className="text-sm font-semibold text-slate-100">
                          Post now channels
                        </div>
                        <div className="mt-1 text-[11px] text-slate-400">
                          Choose where to publish this approved post.
                        </div>

                        <div className="mt-3 grid gap-2 sm:grid-cols-2">
                          {(Array.isArray(selected.platforms)
                            ? selected.platforms
                            : []
                          ).map((p) => {
                            const key = String(p);
                            const on = postNowPlatforms.includes(key);

                            return (
                              <button
                                key={key}
                                type="button"
                                onClick={() => togglePostNowPlatform(key)}
                                className={[
                                  "flex items-center justify-between rounded-xl border px-3 py-2 text-sm transition",
                                  on
                                    ? "border-emerald-500/50 bg-emerald-500/10 text-slate-100"
                                    : "border-white/10 bg-white/5 text-slate-200 hover:bg-white/10",
                                ].join(" ")}
                              >
                                <span>{key}</span>
                                <span className="text-[11px]">
                                  {on ? "✅" : "—"}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <button
                        type="button"
                        disabled={disabled || !approvedCanPostOrCancel}
                        onClick={postNow}
                        className="w-full rounded-2xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-slate-950 hover:bg-emerald-400 transition disabled:opacity-60"
                      >
                        {working === "postnow" ? "Posting…" : "Post now"}
                      </button>

                      <button
                        type="button"
                        disabled={disabled || !approvedCanPostOrCancel}
                        onClick={cancelScheduled}
                        className="w-full rounded-2xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm font-semibold text-red-100 hover:bg-red-400/15 transition disabled:opacity-60"
                      >
                        {working === "cancel" ? "Cancelling…" : "Cancel scheduled"}
                      </button>

                      <div className="text-[11px] text-slate-500">
                        Note: “Cancel scheduled” uses POST (so it won’t 405).
                      </div>
                    </div>
                  ) : (
                    <div className="text-[11px] text-slate-500">
                      This item is not pending/approved (it may be rejected or
                      normal).
                    </div>
                  )}
                </div>
              )}
            </GlassCard>

            <GlassCard className="p-6">
              <div className="text-base font-semibold">Why you saw 405</div>
              <div className="mt-2 text-sm text-slate-300 whitespace-pre-wrap">
                The cancel endpoint is POST-only.\n
                If a URL is opened directly (GET) it returns 405.\n\n
                The buttons above call it correctly via POST.
              </div>
            </GlassCard>
          </div>
        </div>
      </div>
    </div>
  );
}
