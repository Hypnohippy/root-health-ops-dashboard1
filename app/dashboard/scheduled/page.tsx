"use client";

import React, { useEffect, useMemo, useState } from "react";

type ScheduledRecord = {
  id: string;
  title: string;
  body: string;
  platform: string;
  scheduled_time: string | null;
  status: string;
  executed_at: string | null;
  series_name?: string;
  episode_number?: number | null;
};

type ViewMode = "table" | "timeline";

function formatDateTime(value: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (isNaN(d.getTime())) return value;
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDateOnly(value: string | null) {
  if (!value) return "Unknown date";
  const d = new Date(value);
  if (isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
  });
}

function statusClasses(status: string) {
  const s = status.toLowerCase();
  if (s === "pending") {
    return "bg-amber-500/10 text-amber-200 border border-amber-400/40";
  }
  if (s === "posted") {
    return "bg-emerald-500/10 text-emerald-200 border border-emerald-400/40";
  }
  if (s === "failed") {
    return "bg-red-500/10 text-red-200 border border-red-400/40";
  }
  if (s === "cancelled") {
    return "bg-slate-500/10 text-slate-200 border border-slate-400/40";
  }
  return "bg-slate-500/10 text-slate-200 border border-slate-400/40";
}

export default function ScheduledPage() {
  const [records, setRecords] = useState<ScheduledRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rescheduleTime, setRescheduleTime] = useState("");
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  function resetNotices() {
    setError(null);
    setMessage(null);
  }

  async function fetchRecords() {
    resetNotices();
    setLoading(true);
    try {
      const res = await fetch("/api/schedule/list");
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to load scheduled posts");
        return;
      }
      setRecords(data.records || []);
    } catch (e: any) {
      setError(e?.message || "Error loading scheduled posts");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchRecords();
  }, []);

  const selectedRecord = records.find((r) => r.id === selectedId) || null;

  async function handleAction(
    id: string,
    action: "cancel" | "delete" | "reschedule" | "post_now"
  ) {
    resetNotices();
    const record = records.find((r) => r.id === id);
    if (!record) return;

    if (action === "reschedule") {
      if (!rescheduleDate || !rescheduleTime) {
        setError("Pick date and time before rescheduling.");
        return;
      }
    }

    setActionLoadingId(id);
    try {
      let body: any = { id, action };

      if (action === "reschedule") {
        const scheduledISO = new Date(
          `${rescheduleDate}T${rescheduleTime}:00`
        ).toISOString();
        body.scheduledTime = scheduledISO;
      }

      if (action === "post_now") {
        body.title = record.title;
        body.content = record.body;
        body.platform = record.platform;
      }

      const res = await fetch("/api/schedule/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Action failed");
        return;
      }

      setMessage(
        action === "cancel"
          ? "Post cancelled."
          : action === "delete"
          ? "Post deleted."
          : action === "reschedule"
          ? "Post rescheduled."
          : "Post sent to LinkedIn."
      );
      await fetchRecords();
    } catch (e: any) {
      setError(e?.message || "Action failed");
    } finally {
      setActionLoadingId(null);
    }
  }

  const groupedByDay = useMemo(() => {
    const groups: Record<string, ScheduledRecord[]> = {};
    for (const r of records) {
      const key = r.scheduled_time ? r.scheduled_time.slice(0, 10) : "unknown";
      if (!groups[key]) groups[key] = [];
      groups[key].push(r);
    }
    return Object.entries(groups)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([dateKey, recs]) => ({ dateKey, recs }));
  }, [records]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-50">
      <div className="mx-auto max-w-6xl px-4 py-8 space-y-6">
        {/* Header */}
        <header className="flex items-center justify-between gap-2">
          <div>
            <h1 className="text-2xl font-semibold text-slate-50">
              Scheduled Posts
            </h1>
            <p className="text-sm text-slate-300">
              See what&apos;s queued, what fired, and tweak your posting
              calendar without diving into Airtable.
            </p>
          </div>
          <button
            type="button"
            onClick={fetchRecords}
            className="rounded-full border border-white/20 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-50 hover:bg-white/10"
          >
            Refresh
          </button>
        </header>

        {(message || error) && (
          <div className="space-y-2">
            {message && (
              <div className="rounded-lg border border-emerald-400/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
                {message}
              </div>
            )}
            {error && (
              <div className="rounded-lg border border-red-400/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                {error}
              </div>
            )}
          </div>
        )}

        {/* View toggle */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex gap-2 text-xs">
            <button
              type="button"
              onClick={() => setViewMode("table")}
              className={`rounded-full px-3 py-1 border ${
                viewMode === "table"
                  ? "bg-emerald-400 text-slate-950 border-emerald-300"
                  : "bg-black/30 text-slate-100 border-white/20"
              }`}
            >
              Table view
            </button>
            <button
              type="button"
              onClick={() => setViewMode("timeline")}
              className={`rounded-full px-3 py-1 border ${
                viewMode === "timeline"
                  ? "bg-emerald-400 text-slate-950 border-emerald-300"
                  : "bg-black/30 text-slate-100 border-white/20"
              }`}
            >
              Timeline view
            </button>
          </div>
          <p className="text-[11px] text-slate-300">
            Total scheduled records: {records.length}
          </p>
        </div>

        {/* Main content */}
        {loading ? (
          <p className="text-sm text-slate-300">Loading scheduled posts…</p>
        ) : records.length === 0 ? (
          <p className="text-sm text-slate-300">
            No scheduled posts yet. Use Story Mode or Campaigns to schedule your
            first post.
          </p>
        ) : viewMode === "table" ? (
          <section className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-4 shadow-lg">
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs">
                <thead className="border-b border-white/10 text-[11px] uppercase tracking-wide text-slate-300">
                  <tr>
                    <th className="px-2 py-2 text-left">Platform</th>
                    <th className="px-2 py-2 text-left">Title</th>
                    <th className="px-2 py-2 text-left">Series</th>
                    <th className="px-2 py-2 text-left">Scheduled</th>
                    <th className="px-2 py-2 text-left">Status</th>
                    <th className="px-2 py-2 text-left">Executed</th>
                    <th className="px-2 py-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((r) => (
                    <tr
                      key={r.id}
                      className={`border-b border-white/5 ${
                        selectedId === r.id ? "bg-white/10" : "hover:bg-white/5"
                      }`}
                      onClick={() => setSelectedId(r.id)}
                    >
                      <td className="px-2 py-2 align-top">
                        <span className="rounded-full bg-black/30 px-2 py-0.5 text-[11px] uppercase tracking-wide text-slate-200 border border-white/15">
                          {r.platform}
                        </span>
                      </td>
                      <td className="px-2 py-2 align-top">
                        <div className="max-w-xs truncate text-[11px] font-medium text-slate-50">
                          {r.title || "Untitled"}
                        </div>
                      </td>
                      <td className="px-2 py-2 align-top text-[11px] text-slate-200">
                        {r.series_name
                          ? `${r.series_name}${
                              r.episode_number
                                ? ` (Episode ${r.episode_number})`
                                : ""
                            }`
                          : "—"}
                      </td>
                      <td className="px-2 py-2 align-top text-[11px] text-slate-200">
                        {formatDateTime(r.scheduled_time)}
                      </td>
                      <td className="px-2 py-2 align-top">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-[10px] ${statusClasses(
                            r.status
                          )}`}
                        >
                          {r.status}
                        </span>
                      </td>
                      <td className="px-2 py-2 align-top text-[11px] text-slate-200">
                        {formatDateTime(r.executed_at)}
                      </td>
                      <td className="px-2 py-2 align-top text-right">
                        <div className="flex flex-wrap justify-end gap-1">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedId(r.id);
                              handleAction(r.id, "post_now");
                            }}
                            disabled={
                              actionLoadingId === r.id ||
                              r.status.toLowerCase() === "posted" ||
                              r.platform !== "LinkedIn"
                            }
                            className="rounded-full border border-white/25 bg-black/30 px-2 py-0.5 text-[10px] text-slate-100 hover:bg-black/50 disabled:opacity-50"
                          >
                            {actionLoadingId === r.id
                              ? "Working…"
                              : "Post now"}
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedId(r.id);
                            }}
                            className="rounded-full border border-white/25 bg-black/30 px-2 py-0.5 text-[10px] text-slate-100 hover:bg-black/50"
                          >
                            Edit time
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleAction(r.id, "cancel");
                            }}
                            disabled={
                              actionLoadingId === r.id ||
                              r.status.toLowerCase() !== "pending"
                            }
                            className="rounded-full border border-amber-400/40 bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-100 hover:bg-amber-500/20 disabled:opacity-50"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleAction(r.id, "delete");
                            }}
                            disabled={actionLoadingId === r.id}
                            className="rounded-full border border-red-400/40 bg-red-500/10 px-2 py-0.5 text-[10px] text-red-100 hover:bg-red-500/20 disabled:opacity-50"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Reschedule panel for selected */}
            {selectedRecord && (
              <div className="mt-4 rounded-xl border border-white/15 bg-black/25 p-3 space-y-2">
                <p className="text-[11px] font-semibold text-slate-200">
                  Reschedule selected post
                </p>
                <p className="text-[11px] text-slate-300">
                  {selectedRecord.title || "Untitled"} — currently{" "}
                  {formatDateTime(selectedRecord.scheduled_time)}
                </p>
                <div className="grid gap-2 md:grid-cols-2">
                  <div className="space-y-1">
                    <label className="text-[11px] text-slate-300">
                      New date
                    </label>
                    <input
                      type="date"
                      className="w-full rounded-md border border-white/20 bg-black/30 px-2 py-1.5 text-[11px] text-slate-50"
                      value={rescheduleDate}
                      onChange={(e) => setRescheduleDate(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] text-slate-300">
                      New time
                    </label>
                    <input
                      type="time"
                      className="w-full rounded-md border border-white/20 bg-black/30 px-2 py-1.5 text-[11px] text-slate-50"
                      value={rescheduleTime}
                      onChange={(e) => setRescheduleTime(e.target.value)}
                    />
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    selectedRecord && handleAction(selectedRecord.id, "reschedule")
                  }
                  disabled={!selectedRecord || actionLoadingId === selectedRecord.id}
                  className={`mt-2 rounded-md px-3 py-1.5 text-[11px] font-medium shadow-md ${
                    actionLoadingId === selectedRecord?.id
                      ? "bg-black/30 text-slate-400 cursor-not-allowed border border-white/15"
                      : "bg-emerald-400 text-slate-950 hover:bg-emerald-300"
                  }`}
                >
                  {actionLoadingId === selectedRecord?.id
                    ? "Rescheduling..."
                    : "Reschedule"}
                </button>
              </div>
            )}
          </section>
        ) : (
          // Timeline view
          <section className="space-y-4">
            {groupedByDay.map(({ dateKey, recs }) => (
              <div
                key={dateKey}
                className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-4 shadow-lg"
              >
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-300 mb-2">
                  {formatDateOnly(recs[0]?.scheduled_time)}
                </p>
                <div className="space-y-2">
                  {recs.map((r) => (
                    <div
                      key={r.id}
                      className="flex items-start justify-between gap-3 rounded-xl border border-white/10 bg-black/25 p-3 hover:bg-black/40"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="rounded-full bg-black/30 px-2 py-0.5 text-[10px] uppercase tracking-wide text-slate-200 border border-white/15">
                            {r.platform}
                          </span>
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-[10px] ${statusClasses(
                              r.status
                            )}`}
                          >
                            {r.status}
                          </span>
                        </div>
                        <p className="text-[11px] font-semibold text-slate-50">
                          {r.title || "Untitled"}
                        </p>
                        {r.series_name && (
                          <p className="text-[11px] text-slate-300">
                            {r.series_name}
                            {r.episode_number
                              ? ` — Episode ${r.episode_number}`
                              : ""}
                          </p>
                        )}
                        <p className="text-[11px] text-slate-400">
                          {formatDateTime(r.scheduled_time)}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedId(r.id);
                            setViewMode("table");
                          }}
                          className="rounded-full border border-white/25 bg-black/30 px-2 py-0.5 text-[10px] text-slate-100 hover:bg-black/50"
                        >
                          Manage
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </section>
        )}
      </div>
    </div>
  );
}
