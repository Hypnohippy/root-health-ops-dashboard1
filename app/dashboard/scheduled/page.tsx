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
  error_info?: any;
  posted_at?: string | null;
};

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

/**
 * Pull out a human-friendly error summary from our various shapes of error_info
 * (quick-blast style: { success, results: [{platform, ok, error, details}] })
 */
function summarizeErrorInfo(errorInfo: any): { title: string; lines: string[] } | null {
  if (!errorInfo) return null;

  if (typeof errorInfo === "string") {
    return { title: "Error", lines: [errorInfo] };
  }

  const results = Array.isArray(errorInfo?.results) ? errorInfo.results : null;
  if (results && results.length) {
    const lines = results.map((r: any) => {
      const platform = r?.platform ? String(r.platform) : "unknown";
      const ok = !!r?.ok;
      const err = r?.error || r?.reason || r?.message || "Unknown error";
      return `${platform}: ${ok ? "OK" : "FAILED"} — ${String(err)}`;
    });
    const title = errorInfo?.success === false ? "Dispatch failed" : "Dispatch results";
    return { title, lines };
  }

  if (errorInfo?.error) {
    const msg =
      typeof errorInfo.error === "string"
        ? errorInfo.error
        : JSON.stringify(errorInfo.error);
    return { title: "Error", lines: [msg] };
  }

  try {
    return { title: "Error details", lines: [JSON.stringify(errorInfo)] };
  } catch {
    return { title: "Error details", lines: ["(unreadable error_info)"] };
  }
}

function getSubmitter(meta: any): string | null {
  // Flexible: we’ll display whatever you stored during creation
  const m = meta || {};
  const s =
    m?.submitter ||
    m?.submitted_by ||
    m?.created_by ||
    m?.author ||
    m?.user ||
    m?.therapist ||
    m?.profile_name ||
    m?.profile?.name ||
    null;

  if (!s) return null;
  const str = String(s).trim();
  return str ? str.slice(0, 120) : null;
}

function canEditOrCancel(p: ScheduledPost) {
  // “Past” or already posted -> lock it
  if (p.posted_at) return false;

  const st = String(p.status || "").toLowerCase().trim();
  if (st === "posted" || st === "failed") return false;

  // If scheduled time is in the past, treat as locked too
  const t = new Date(p.scheduled_for).getTime();
  if (!isFinite(t)) return false;

  const now = Date.now();
  return t >= now;
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

function toDatetimeLocalValue(iso: string) {
  // Convert ISO string to "YYYY-MM-DDTHH:mm" in local time
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    const pad = (n: number) => String(n).padStart(2, "0");
    const yyyy = d.getFullYear();
    const mm = pad(d.getMonth() + 1);
    const dd = pad(d.getDate());
    const hh = pad(d.getHours());
    const mi = pad(d.getMinutes());
    return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
  } catch {
    return "";
  }
}

function EditModal({
  open,
  item,
  onClose,
  onSave,
  saving,
}: {
  open: boolean;
  item: ScheduledPost | null;
  onClose: () => void;
  onSave: (payload: {
    id: string;
    message: string;
    imageUrl: string;
    platforms: string[];
    scheduledAt: string;
  }) => void;
  saving: boolean;
}) {
  const [message, setMessage] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [platforms, setPlatforms] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !item) return;
    setErr(null);
    setMessage(String(item.message || ""));
    setImageUrl(String(item.image_url || ""));
    setScheduledAt(toDatetimeLocalValue(item.scheduled_for));
    setPlatforms(Array.isArray(item.platforms) ? item.platforms.map(String) : []);
  }, [open, item?.id]);

  if (!open || !item) return null;

  const toggle = (p: string) => {
    setPlatforms((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));
  };

  const submit = () => {
    setErr(null);

    const msg = message.trim();
    if (!msg) {
      setErr("Message cannot be empty.");
      return;
    }

    const pls = (platforms || []).map(String).filter(Boolean);
    if (pls.length === 0) {
      setErr("Pick at least one platform.");
      return;
    }

    const dt = String(scheduledAt || "").trim();
    if (!dt) {
      setErr("Pick a scheduled time.");
      return;
    }

    onSave({
      id: item.id,
      message: msg,
      imageUrl: imageUrl.trim(),
      platforms: pls,
      scheduledAt: dt,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/60"
        onClick={saving ? undefined : onClose}
      />
      <div className="relative w-full max-w-2xl rounded-3xl border border-white/10 bg-slate-950 p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-lg font-semibold text-slate-50">Edit scheduled post</div>
            <div className="mt-1 text-[11px] text-slate-400">
              Changes apply immediately to this scheduled item.
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-200 hover:bg-white/10 disabled:opacity-60"
          >
            Close
          </button>
        </div>

        {err ? (
          <div className="mt-4 rounded-2xl border border-red-500/40 bg-red-950/40 p-3 text-sm text-red-200">
            {err}
          </div>
        ) : null}

        <div className="mt-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-300">Message</label>
            <textarea
              className="mt-2 w-full min-h-[120px] rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-100 outline-none focus:border-emerald-400/50 focus:ring-1 focus:ring-emerald-400/30"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Write the post…"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300">Image URL (optional)</label>
            <input
              className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-100 outline-none focus:border-emerald-400/50 focus:ring-1 focus:ring-emerald-400/30"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="https://…jpg / png"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300">Scheduled time</label>
            <input
              type="datetime-local"
              className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-100 outline-none focus:border-emerald-400/50 focus:ring-1 focus:ring-emerald-400/30"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
            />
            <div className="mt-1 text-[11px] text-slate-500">
              Local time on your device.
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300">Platforms</label>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {(Array.isArray(item.platforms) ? item.platforms : []).map((p) => {
                const key = String(p);
                const on = platforms.includes(key);

                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => toggle(key)}
                    className={[
                      "flex items-center justify-between rounded-2xl border px-4 py-3 text-sm transition",
                      on
                        ? "border-emerald-500/50 bg-emerald-500/10 text-slate-100"
                        : "border-white/10 bg-white/5 text-slate-200 hover:bg-white/10",
                    ].join(" ")}
                  >
                    <span>{key}</span>
                    <span className="text-xs">{on ? "✅" : "—"}</span>
                  </button>
                );
              })}
            </div>
            <div className="mt-1 text-[11px] text-slate-500">
              For now, you can toggle only the platforms already on this post.
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={submit}
              disabled={saving}
              className="flex-1 rounded-2xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save changes"}
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-slate-200 hover:bg-white/10 disabled:opacity-60"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function RowCard({
  p,
  onEdit,
  onCancel,
  busy,
}: {
  p: ScheduledPost;
  onEdit: (p: ScheduledPost) => void;
  onCancel: (p: ScheduledPost) => void;
  busy: boolean;
}) {
  const tone = statusTone(p.status);
  const errSummary = summarizeErrorInfo(p.error_info);
  const submitter = getSubmitter(p.meta);
  const editable = canEditOrCancel(p);

  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-[11px] text-slate-300">
          {safeDate(p.scheduled_for)} ·{" "}
          <span className="text-slate-100 font-semibold">{prettyPlatforms(p.platforms)}</span>
          {p.posted_at ? <span className="text-slate-400"> · posted {safeDate(p.posted_at)}</span> : null}
          {submitter ? <span className="text-slate-400"> · by {submitter}</span> : null}
        </div>

        <div className="flex items-center gap-2">
          <Pill tone={tone}>{p.status || "unknown"}</Pill>

          {editable ? (
            <>
              <button
                type="button"
                onClick={() => onEdit(p)}
                disabled={busy}
                className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-semibold text-slate-100 hover:bg-white/10 disabled:opacity-60"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={() => onCancel(p)}
                disabled={busy}
                className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-[11px] font-semibold text-red-100 hover:bg-red-500/15 disabled:opacity-60"
              >
                Cancel
              </button>
            </>
          ) : null}
        </div>
      </div>

      <div className="mt-3 text-sm whitespace-pre-wrap text-slate-100">
        {p.message || "(empty message)"}
      </div>

      {p.image_url ? (
        <div className="mt-3 text-[11px] text-slate-400 truncate">
          Image: <span className="text-slate-300">{p.image_url}</span>
        </div>
      ) : null}

      {errSummary ? (
        <div className="mt-3 rounded-xl border border-red-500/30 bg-red-950/30 p-3">
          <div className="text-[11px] font-semibold text-red-200">{errSummary.title}</div>
          <ul className="mt-2 space-y-1">
            {errSummary.lines.slice(0, 6).map((line, idx) => (
              <li key={idx} className="text-[11px] text-red-100 whitespace-pre-wrap">
                • {line}
              </li>
            ))}
          </ul>

          <pre className="mt-3 text-[10px] text-red-100/80 whitespace-pre-wrap bg-black/30 border border-white/10 rounded-lg p-2 overflow-x-auto">
            {JSON.stringify(p.error_info, null, 2)}
          </pre>
        </div>
      ) : null}
    </div>
  );
}

export default function ScheduledPage() {
  const [orgId, setOrgId] = useState<string | null>(null);
  const [orgLoadError, setOrgLoadError] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<ScheduledPost[]>([]);

  const [query, setQuery] = useState("");
  const [showPastCount, setShowPastCount] = useState(25);

  const [editOpen, setEditOpen] = useState(false);
  const [editItem, setEditItem] = useState<ScheduledPost | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  const [busyAction, setBusyAction] = useState<null | "cancel">(null);

  // 1) Load orgId from backend
  useEffect(() => {
    (async () => {
      try {
        setOrgLoadError(null);
        const res = await fetch("/api/social-accounts", { cache: "no-store" });
        const data: any = await res.json().catch(() => null);

        const id = data?.organisationId ? String(data.organisationId) : null;

        if (!id) {
          setOrgId(null);
          setOrgLoadError("Could not determine organisationId. (No organisationId returned.)");
          return;
        }

        setOrgId(id);
      } catch (e: any) {
        setOrgId(null);
        setOrgLoadError(e?.message || "Could not determine organisationId.");
      }
    })();
  }, []);

  const load = async (organisationId: string, opts?: { silent?: boolean }) => {
    const silent = !!opts?.silent;

    if (!silent) setLoading(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/schedule/list?organisationId=${encodeURIComponent(organisationId)}`,
        { cache: "no-store" }
      );

      const data: any = await res.json().catch(() => null);

      if (!data?.ok) {
        throw new Error(
          data?.error || `Failed to load scheduled posts (HTTP ${res.status}).`
        );
      }

      setRows(Array.isArray(data?.items) ? data.items : []);
    } catch (e: any) {
      if (!silent) {
        setRows([]);
        setError(e?.message || "Could not load scheduled posts.");
      }
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const refresh = async () => {
    if (!orgId) return;
    setRefreshing(true);
    try {
      await load(orgId);
    } finally {
      setRefreshing(false);
    }
  };

  // Load scheduled posts once orgId is ready
  useEffect(() => {
    if (!orgId) return;
    void load(orgId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  // Auto-refresh every 30 seconds (single interval only)
  useEffect(() => {
    if (!orgId) return;

    const interval = window.setInterval(() => {
      void load(orgId, { silent: true });
    }, 30_000);

    return () => window.clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;

    return rows.filter((r) => {
      const hay = `${r.message || ""} ${prettyPlatforms(r.platforms)} ${r.status || ""} ${
        r.scheduled_for || ""
      } ${r.posted_at || ""} ${getSubmitter(r.meta) || ""}`.toLowerCase();
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

  const openEdit = (p: ScheduledPost) => {
    setError(null);
    setEditItem(p);
    setEditOpen(true);
  };

  const closeEdit = () => {
    setEditOpen(false);
    setEditItem(null);
  };

  const saveEdit = async (payload: {
    id: string;
    message: string;
    imageUrl: string;
    platforms: string[];
    scheduledAt: string; // "YYYY-MM-DDTHH:mm"
  }) => {
    if (!orgId) return;

    setSavingEdit(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/schedule/update?organisationId=${encodeURIComponent(orgId)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: payload.id,
            message: payload.message,
            imageUrl: payload.imageUrl || null,
            platforms: payload.platforms,
            scheduledAt: payload.scheduledAt,
          }),
        }
      );

      const data: any = await res.json().catch(() => null);

      if (!res.ok || data?.success === false) {
        throw new Error(data?.error || `Update failed (HTTP ${res.status}).`);
      }

      // Refresh from DB to stay consistent
      await load(orgId, { silent: true });

      closeEdit();
    } catch (e: any) {
      setError(e?.message || "Could not update scheduled post.");
    } finally {
      setSavingEdit(false);
    }
  };

  const cancelItem = async (p: ScheduledPost) => {
    if (!orgId) return;

    const ok = window.confirm(
      "Cancel this scheduled post?\n\nThis will remove it from the queue."
    );
    if (!ok) return;

    setBusyAction("cancel");
    setError(null);

    try {
      const res = await fetch(
        `/api/schedule/delete?organisationId=${encodeURIComponent(orgId)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: p.id }),
        }
      );

      const data: any = await res.json().catch(() => null);

      if (!res.ok || data?.success === false) {
        throw new Error(data?.error || `Cancel failed (HTTP ${res.status}).`);
      }

      // Fast local remove + silent refresh
      setRows((prev) => prev.filter((x) => x.id !== p.id));
      await load(orgId, { silent: true });
    } catch (e: any) {
      setError(e?.message || "Could not cancel scheduled post.");
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="relative mx-auto w-full max-w-6xl px-4 py-10 space-y-8">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">
              Scheduled <span className="text-xs text-slate-400">(org-aware)</span>
            </h1>
            <p className="mt-2 text-sm text-slate-300 max-w-2xl">
              Manage future posts created by other parts of the app.
              <span className="text-slate-100 font-semibold"> Upcoming items can be edited or cancelled.</span>
            </p>

            <p className="mt-1 text-[11px] text-slate-500">
              Org: {orgId ? orgId : "loading…"}
            </p>

            {orgLoadError ? (
              <div className="mt-2 text-[11px] text-red-300 whitespace-pre-wrap">
                {orgLoadError}
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Pill>Upcoming: {upcoming.length}</Pill>
            <Pill>Past: {past.length}</Pill>

            <button
              type="button"
              onClick={refresh}
              disabled={refreshing || !orgId}
              className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-100 hover:bg-white/10 disabled:opacity-60 disabled:cursor-not-allowed transition"
            >
              {refreshing ? "Refreshing…" : "Refresh"}
            </button>
          </div>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <div className="text-base font-semibold">Search the queue</div>
              <div className="mt-1 text-xs text-slate-300">
                Search by message, platforms, status, date, posted time, or submitter.
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
        </div>

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
                  <RowCard
                    key={p.id}
                    p={p}
                    onEdit={openEdit}
                    onCancel={cancelItem}
                    busy={refreshing || savingEdit || !!busyAction}
                  />
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
                  <RowCard
                    key={p.id}
                    p={p}
                    onEdit={openEdit}
                    onCancel={cancelItem}
                    busy={true} // Past items show no buttons anyway; keep safe
                  />
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
          Note: upcoming posts can be edited/cancelled. Past/posted items are locked for safety.
        </div>
      </div>

      <EditModal
        open={editOpen}
        item={editItem}
        onClose={closeEdit}
        onSave={saveEdit}
        saving={savingEdit}
      />
    </div>
  );
}
