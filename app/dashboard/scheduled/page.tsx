// app/dashboard/scheduled/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";

type ScheduledRow = {
  id: string;
  organisation_id: string;
  message: string | null;
  platforms: string[] | null;
  image_url: string | null;
  scheduled_for: string | null;
  posted_at: string | null;
  status: string | null;
  meta: any;
  error_info: any;
  created_at: string | null;
  updated_at: string | null;
};

type ImportItem = {
  title?: string;
  text: string;
  imageUrl?: string;
  attribution?: any;
};

type ImportPayload = {
  mode?: "single" | "series";
  platform?: string;
  tone?: string;
  items: ImportItem[];
  note?: string;
};

const PREFILL_SCHEDULED_KEYS = [
  "rootops_prefill_scheduled_v1",
  "rh_prefill_scheduled_v1",
];

function fmt(dt?: string | null) {
  if (!dt) return "—";
  const d = new Date(dt);
  if (isNaN(d.getTime())) return dt;
  return d.toLocaleString();
}

function toLocalInputValue(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const mi = pad(d.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}

function localInputToIso(v: string) {
  if (!v) return "";
  const d = new Date(v);
  if (isNaN(d.getTime())) return "";
  return d.toISOString();
}

function platformLabel(p: string) {
  const k = String(p || "").toLowerCase();
  if (k === "facebook") return "Facebook";
  if (k === "instagram") return "Instagram";
  if (k === "threads") return "Threads";
  if (k === "linkedin") return "LinkedIn";
  if (k === "tiktok") return "TikTok";
  return p;
}

/**
 * Fixes:
 * - "Unknown error" showing for OK results
 * - "[object Object]" showing for failures
 */
function describeResult(r: any) {
  const ok = !!r?.ok;
  const platform = String(r?.platform || "").toLowerCase();

  if (ok) {
    const postedId = r?.postedId || r?.details?.postedId || null;
    return postedId ? `OK — ${postedId}` : "OK";
  }

  if (r?.skipped) {
    const reason = String(r?.reason || "Skipped");
    return `SKIPPED — ${reason}`;
  }

  const msg =
    r?.error?.message ||
    r?.error?.error_user_msg ||
    r?.error?.error_user_title ||
    r?.error ||
    r?.details?.error?.message ||
    r?.details?.error?.error_user_msg ||
    r?.details?.error?.error_user_title ||
    r?.details?.message ||
    r?.message ||
    null;

  if (msg && typeof msg === "object") {
    try {
      return `FAILED — ${JSON.stringify(msg)}`;
    } catch {
      return "FAILED — Unknown error";
    }
  }

  const text = String(msg || "").trim();
  if (text) return `FAILED — ${text}`;

  return platform ? "FAILED — Unknown error" : "FAILED";
}

const ALL_PLATFORMS = ["facebook", "instagram", "threads", "linkedin", "tiktok"];

// ----- localStorage helpers -----
function readImportPayload(): ImportPayload | null {
  try {
    for (const k of PREFILL_SCHEDULED_KEYS) {
      const raw = localStorage.getItem(k);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") continue;
      if (!Array.isArray(parsed.items)) continue;
      return parsed as ImportPayload;
    }
  } catch {}
  return null;
}

function clearImportPayload() {
  try {
    for (const k of PREFILL_SCHEDULED_KEYS) {
      try {
        localStorage.removeItem(k);
      } catch {}
    }
  } catch {}
}

function safeText(s: any) {
  return String(s || "").trim();
}

function safeUrl(s: any) {
  const t = String(s || "").trim();
  if (!t) return "";
  if (!/^https?:\/\//i.test(t)) return "";
  return t;
}

export default function ScheduledPage() {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<ScheduledRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [includeQuickBlast, setIncludeQuickBlast] = useState(false);

  // Edit modal state
  const [editOpen, setEditOpen] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const [editing, setEditing] = useState<ScheduledRow | null>(null);
  const [editMessage, setEditMessage] = useState("");
  const [editScheduledFor, setEditScheduledFor] = useState("");
  const [editImageUrl, setEditImageUrl] = useState("");
  const [editPlatforms, setEditPlatforms] = useState<string[]>([]);

  // ✅ Import-from-Brainstorm state
  const [importPayload, setImportPayload] = useState<ImportPayload | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importErr, setImportErr] = useState<string | null>(null);

  const [importStart, setImportStart] = useState<string>("");
  const [importIntervalMin, setImportIntervalMin] = useState<number>(60);
  const [importPlatforms, setImportPlatforms] = useState<string[]>(["linkedin"]);
  const [importSource, setImportSource] = useState<string>("brainstorm_series");

  async function load() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/social/scheduled?range=future&includeQuickBlast=${includeQuickBlast ? "1" : "0"}`,
        { cache: "no-store" }
      );
      const json = await res.json().catch(() => null);

      if (!res.ok || !json?.success) {
        setItems([]);
        setError(json?.error || `Failed to load (${res.status})`);
        setLoading(false);
        return;
      }

      setItems(Array.isArray(json.items) ? json.items : []);
    } catch (e: any) {
      setItems([]);
      setError(e?.message || "Failed to load scheduled posts.");
    } finally {
      setLoading(false);
    }
  }

  // Load scheduled list
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [includeQuickBlast]);

  // ✅ Detect import payload on page load
  useEffect(() => {
    try {
      const p = readImportPayload();
      if (!p) return;

      setImportPayload(p);

      // defaults:
      const nowPlus10 = new Date(Date.now() + 10 * 60 * 1000);
      setImportStart(toLocalInputValue(nowPlus10.toISOString()));

      const suggested = String(p.platform || "").toLowerCase().trim();
      setImportPlatforms(
        suggested && ALL_PLATFORMS.includes(suggested) ? [suggested] : ["linkedin"]
      );

      setImportOpen(true);
    } catch {
      // ignore
    }
  }, []);

  const emptyState = !loading && !error && items.length === 0;

  const title = useMemo(() => {
    return includeQuickBlast
      ? "Scheduled Pipeline (including Quick Blast history)"
      : "Scheduled Pipeline";
  }, [includeQuickBlast]);

  function openEdit(it: ScheduledRow) {
    setEditing(it);
    setEditMessage(String(it.message || ""));
    setEditImageUrl(String(it.image_url || ""));
    setEditPlatforms(Array.isArray(it.platforms) ? it.platforms : []);
    setEditScheduledFor(toLocalInputValue(it.scheduled_for));
    setEditError(null);
    setEditOpen(true);
  }

  function closeEdit() {
    setEditOpen(false);
    setEditSaving(false);
    setEditError(null);
    setEditing(null);
  }

  async function saveEdit() {
    if (!editing) return;
    setEditSaving(true);
    setEditError(null);

    const iso = localInputToIso(editScheduledFor);
    if (!iso) {
      setEditSaving(false);
      setEditError("Please choose a valid date/time.");
      return;
    }

    if (!editMessage.trim()) {
      setEditSaving(false);
      setEditError("Message can’t be empty.");
      return;
    }

    if (!editPlatforms || editPlatforms.length === 0) {
      setEditSaving(false);
      setEditError("Pick at least one platform.");
      return;
    }

    try {
      const res = await fetch("/api/social/scheduled/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          id: editing.id,
          message: editMessage,
          scheduled_for: iso,
          platforms: editPlatforms,
          image_url: editImageUrl.trim() || null,
        }),
      });

      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        setEditSaving(false);
        setEditError(json?.error || "Update failed.");
        return;
      }

      closeEdit();
      load();
    } catch (e: any) {
      setEditSaving(false);
      setEditError(e?.message || "Update failed.");
    }
  }

  async function deletePost(it: ScheduledRow) {
    const status = String(it.status || "").toLowerCase();
    if (status === "posted") {
      alert("This post is already posted. Deleting is blocked to avoid accidental data loss.");
      return;
    }

    const ok = confirm("Delete this scheduled post? This cannot be undone.");
    if (!ok) return;

    try {
      const res = await fetch("/api/social/scheduled/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ id: it.id }),
      });

      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        alert(json?.error || "Delete failed.");
        return;
      }

      load();
    } catch (e: any) {
      alert(e?.message || "Delete failed.");
    }
  }

  // ✅ Import actions
  function closeImport() {
    setImportOpen(false);
    setImportErr(null);
  }

  function discardImport() {
    clearImportPayload();
    setImportPayload(null);
    setImportOpen(false);
    setImportErr(null);
  }

  async function runImport() {
    if (!importPayload) return;

    setImporting(true);
    setImportErr(null);

    try {
      const startIso = localInputToIso(importStart);
      if (!startIso) {
        setImporting(false);
        setImportErr("Pick a valid start date/time.");
        return;
      }

      if (!importPlatforms.length) {
        setImporting(false);
        setImportErr("Pick at least one platform.");
        return;
      }

      const cleanedItems = (importPayload.items || [])
        .map((x) => ({
          title: safeText((x as any)?.title),
          text: safeText((x as any)?.text),
          imageUrl: safeUrl((x as any)?.imageUrl),
          attribution: (x as any)?.attribution ?? null,
        }))
        .filter((x) => !!x.text);

      if (!cleanedItems.length) {
        setImporting(false);
        setImportErr("Nothing to import (no text found).");
        return;
      }

      const res = await fetch("/api/social/scheduled/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          startAt: startIso,
          intervalMinutes: importIntervalMin,
          platforms: importPlatforms,
          items: cleanedItems,
          meta: {
            source: importSource,
            from: "brainstorm",
            note: importPayload.note || null,
            platformHint: importPayload.platform || null,
            tone: importPayload.tone || null,
          },
        }),
      });

      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        setImporting(false);
        setImportErr(json?.error || `Import failed (HTTP ${res.status}).`);
        return;
      }

      // clear payload + reload list
      clearImportPayload();
      setImportPayload(null);
      setImportOpen(false);

      await load();
    } catch (e: any) {
      setImportErr(e?.message || "Import failed.");
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 px-4 py-10">
      <div className="mx-auto w-full max-w-6xl">
        <div className="rounded-3xl border border-slate-700 bg-slate-900/70 p-6 md:p-10 shadow-xl backdrop-blur">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <div className="text-xs text-slate-400">Root Health Ops</div>
              <h1 className="mt-1 text-2xl md:text-3xl font-semibold">{title}</h1>
              <p className="mt-2 text-sm text-slate-300 max-w-3xl">
                This is your forward-looking pipeline (future posts). Quick Blast is “send now”, so it’s hidden by default.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={load}
                className="rounded-2xl border border-slate-600 bg-slate-950 px-4 py-2 text-sm text-slate-200 hover:border-slate-500"
              >
                Refresh
              </button>

              <label className="flex items-center gap-2 text-sm text-slate-300">
                <input
                  type="checkbox"
                  checked={includeQuickBlast}
                  onChange={(e) => setIncludeQuickBlast(e.target.checked)}
                  className="h-4 w-4"
                />
                Include Quick Blast history
              </label>
            </div>
          </div>

          {/* ✅ Import banner */}
          {importPayload && (
            <div className="mt-6 rounded-3xl border border-emerald-500/30 bg-emerald-500/10 p-5">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-emerald-100">
                    Import {importPayload.items?.length || 0} draft(s) from Brainstorm
                  </div>
                  <div className="mt-1 text-xs text-emerald-200/80">
                    You can schedule them in a series (e.g. every 60 mins).
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setImportOpen(true)}
                    className="rounded-2xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400"
                  >
                    Open import
                  </button>

                  <button
                    onClick={discardImport}
                    className="rounded-2xl border border-emerald-300/30 bg-emerald-300/10 px-4 py-2 text-sm text-emerald-100 hover:bg-emerald-300/15"
                  >
                    Discard
                  </button>
                </div>
              </div>
            </div>
          )}

          {loading && (
            <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-950/60 p-4 text-slate-300">
              Loading…
            </div>
          )}

          {error && (
            <div className="mt-6 rounded-2xl border border-red-500/40 bg-red-950/30 p-4 text-red-100">
              {error}
            </div>
          )}

          {emptyState && (
            <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-950/60 p-5 text-slate-300">
              No future scheduled posts right now ✅
              <div className="mt-2 text-xs text-slate-500">
                Tip: Use Stories / Brainstorm to build a future pipeline.
              </div>
            </div>
          )}

          {!loading && !error && items.length > 0 && (
            <div className="mt-6 space-y-4">
              {items.map((it) => {
                const platforms = Array.isArray(it.platforms) ? it.platforms : [];
                const results = it?.error_info?.results;
                const hasResults = Array.isArray(results) && results.length > 0;

                const source = String(it?.meta?.source || "").trim();
                const sourceBadge = source === "quick_blast" ? "Quick Blast" : source ? source : "Scheduled";

                return (
                  <div key={it.id} className="rounded-3xl border border-slate-700 bg-slate-950 p-5">
                    <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                      <div>
                        <div className="text-xs text-slate-400">
                          {fmt(it.scheduled_for)} · {platforms.map(platformLabel).join(", ") || "—"}
                        </div>

                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold text-slate-100">{it.status || "—"}</span>

                          <span className="text-xs rounded-full border border-slate-700 bg-slate-900 px-2 py-0.5 text-slate-200">
                            {sourceBadge}
                          </span>

                          {it.posted_at ? (
                            <span className="text-xs text-slate-400">posted {fmt(it.posted_at)}</span>
                          ) : null}
                        </div>

                        <div className="mt-3 whitespace-pre-wrap text-sm text-slate-200">
                          {String(it.message || "").trim() || "—"}
                        </div>

                        {it.image_url ? (
                          <div className="mt-2 text-xs text-slate-400 break-all">Media: {it.image_url}</div>
                        ) : null}
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <button
                          className="rounded-2xl border border-slate-700 bg-slate-900/70 px-4 py-2 text-sm text-slate-200 hover:border-slate-600"
                          onClick={() => openEdit(it)}
                        >
                          Edit
                        </button>

                        <button
                          className="rounded-2xl border border-red-500/40 bg-red-950/30 px-4 py-2 text-sm text-red-100 hover:border-red-500"
                          onClick={() => deletePost(it)}
                        >
                          Delete
                        </button>

                        <button
                          className="rounded-2xl border border-slate-700 bg-slate-900/70 px-4 py-2 text-sm text-slate-200 hover:border-slate-600"
                          onClick={() => navigator.clipboard.writeText(it.id)}
                        >
                          Copy ID
                        </button>
                      </div>
                    </div>

                    <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
                      <div className="text-sm font-semibold text-slate-100">Dispatch results</div>

                      {!hasResults ? (
                        <div className="mt-2 text-sm text-slate-400">No dispatch results stored yet.</div>
                      ) : (
                        <div className="mt-3 space-y-2">
                          {results.map((r: any, idx: number) => {
                            const platform = String(r?.platform || "—");
                            const ok = !!r?.ok;
                            const skipped = !!r?.skipped;

                            const badge = ok ? "✅ OK" : skipped ? "⚠️ Skipped" : "❌ Failed";

                            return (
                              <div
                                key={`${platform}-${idx}`}
                                className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2"
                              >
                                <div className="text-sm text-slate-200">
                                  <span className="font-semibold">{platformLabel(platform)}:</span>{" "}
                                  {describeResult(r)}
                                </div>

                                <div
                                  className={[
                                    "text-xs rounded-full border px-2 py-0.5",
                                    ok
                                      ? "border-emerald-500/60 text-emerald-200 bg-emerald-500/10"
                                      : skipped
                                      ? "border-slate-600 text-slate-300 bg-slate-900/40"
                                      : "border-red-500/50 text-red-200 bg-red-500/10",
                                  ].join(" ")}
                                >
                                  {badge}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="mt-8 text-xs text-slate-500">
            Tip: Quick Blast writes rows for audit + reliability, but Scheduled Pipeline should stay focused on future posts.
          </div>
        </div>
      </div>

      {/* ✅ Import modal */}
      {importOpen && importPayload && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/70" onClick={closeImport} />
          <div className="relative w-full max-w-3xl rounded-3xl border border-slate-700 bg-slate-950 p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xs text-slate-400">Import from Brainstorm</div>
                <div className="mt-1 text-lg font-semibold text-slate-100">
                  {importPayload.items?.length || 0} draft(s)
                </div>
                <div className="mt-1 text-xs text-slate-400">
                  We’ll schedule them in order, starting at your chosen time.
                </div>
              </div>

              <button
                className="rounded-2xl border border-slate-700 bg-slate-900/70 px-3 py-2 text-sm text-slate-200 hover:border-slate-600"
                onClick={closeImport}
                disabled={importing}
              >
                Close
              </button>
            </div>

            {importErr && (
              <div className="mt-4 rounded-2xl border border-red-500/40 bg-red-950/30 p-3 text-sm text-red-100">
                {importErr}
              </div>
            )}

            <div className="mt-5 grid gap-4">
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-slate-300">Start date/time</label>
                  <input
                    type="datetime-local"
                    value={importStart}
                    onChange={(e) => setImportStart(e.target.value)}
                    className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                  />
                  <div className="mt-1 text-[11px] text-slate-500">
                    Saved as UTC in the database.
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300">Interval (minutes)</label>
                  <input
                    type="number"
                    min={1}
                    max={1440}
                    value={importIntervalMin}
                    onChange={(e) => setImportIntervalMin(Number(e.target.value || 60))}
                    className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                  />
                  <div className="mt-1 text-[11px] text-slate-500">
                    Example: 60 = one per hour.
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300">Platforms</label>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {ALL_PLATFORMS.map((p) => {
                    const selected = importPlatforms.includes(p);
                    return (
                      <button
                        key={p}
                        type="button"
                        onClick={() =>
                          setImportPlatforms((prev) =>
                            prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]
                          )
                        }
                        className={[
                          "flex items-center justify-between rounded-2xl border px-3 py-3 text-left text-sm transition",
                          selected
                            ? "border-emerald-500/60 bg-emerald-500/10 text-slate-100"
                            : "border-slate-700 bg-slate-950 text-slate-200 hover:border-slate-600",
                        ].join(" ")}
                      >
                        <div className="font-medium">{platformLabel(p)}</div>
                        <div
                          className={[
                            "text-[11px] px-2 py-1 rounded-full border",
                            selected
                              ? "border-emerald-500/60 text-emerald-200"
                              : "border-slate-600 text-slate-300",
                          ].join(" ")}
                        >
                          {selected ? "Selected" : "Select"}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300">Source tag (meta.source)</label>
                <input
                  value={importSource}
                  onChange={(e) => setImportSource(e.target.value)}
                  className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                  placeholder="brainstorm_series"
                />
                <div className="mt-1 text-[11px] text-slate-500">
                  Helps you filter later (and keeps Quick Blast separate).
                </div>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
                <div className="text-sm font-semibold text-slate-100">Preview</div>
                <div className="mt-2 space-y-2 max-h-[260px] overflow-auto pr-1">
                  {(importPayload.items || []).map((x, i) => (
                    <div key={i} className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                      <div className="text-xs text-slate-400">
                        {i + 1}. {safeText((x as any)?.title) || "Draft"}
                      </div>
                      <div className="mt-2 text-sm text-slate-200 whitespace-pre-wrap">
                        {safeText((x as any)?.text).slice(0, 220)}
                        {safeText((x as any)?.text).length > 220 ? "…" : ""}
                      </div>
                      {safeUrl((x as any)?.imageUrl) ? (
                        <div className="mt-2 text-xs text-slate-400 break-all">
                          Media: {safeUrl((x as any)?.imageUrl)}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap gap-3 pt-2">
                <button
                  type="button"
                  onClick={runImport}
                  disabled={importing}
                  className="rounded-2xl bg-emerald-500 px-5 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-60"
                >
                  {importing ? "Importing…" : "Import now"}
                </button>

                <button
                  type="button"
                  onClick={discardImport}
                  disabled={importing}
                  className="rounded-2xl border border-red-500/40 bg-red-950/30 px-5 py-2 text-sm text-red-100 hover:border-red-500 disabled:opacity-60"
                >
                  Discard
                </button>

                <button
                  type="button"
                  onClick={closeImport}
                  disabled={importing}
                  className="rounded-2xl border border-slate-600 bg-slate-950 px-5 py-2 text-sm text-slate-200 hover:border-slate-500 disabled:opacity-60"
                >
                  Cancel
                </button>
              </div>

              <div className="text-[11px] text-slate-500">
                This only schedules posts in your database. Posting still happens via your existing dispatcher.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit modal */}
      {editOpen && editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/70" onClick={closeEdit} />
          <div className="relative w-full max-w-2xl rounded-3xl border border-slate-700 bg-slate-950 p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xs text-slate-400">Edit scheduled post</div>
                <div className="mt-1 text-lg font-semibold text-slate-100">{editing.id}</div>
              </div>
              <button
                className="rounded-2xl border border-slate-700 bg-slate-900/70 px-3 py-2 text-sm text-slate-200 hover:border-slate-600"
                onClick={closeEdit}
              >
                Close
              </button>
            </div>

            {editError && (
              <div className="mt-4 rounded-2xl border border-red-500/40 bg-red-950/30 p-3 text-sm text-red-100">
                {editError}
              </div>
            )}

            <div className="mt-5 grid gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-300">Message</label>
                <textarea
                  value={editMessage}
                  onChange={(e) => setEditMessage(e.target.value)}
                  rows={5}
                  className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-slate-300">Scheduled for</label>
                  <input
                    type="datetime-local"
                    value={editScheduledFor}
                    onChange={(e) => setEditScheduledFor(e.target.value)}
                    className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                  />
                  <div className="mt-1 text-[11px] text-slate-500">
                    Saved as UTC in the database.
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300">Media URL (optional)</label>
                  <input
                    value={editImageUrl}
                    onChange={(e) => setEditImageUrl(e.target.value)}
                    className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                    placeholder="https://..."
                  />
                  <div className="mt-1 text-[11px] text-slate-500">
                    Image URL for image posts. Video URLs are handled by your uploader + publish route.
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300">Platforms</label>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {ALL_PLATFORMS.map((p) => {
                    const selected = editPlatforms.includes(p);
                    return (
                      <button
                        key={p}
                        type="button"
                        onClick={() =>
                          setEditPlatforms((prev) =>
                            prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]
                          )
                        }
                        className={[
                          "flex items-center justify-between rounded-2xl border px-3 py-3 text-left text-sm transition",
                          selected
                            ? "border-emerald-500/60 bg-emerald-500/10 text-slate-100"
                            : "border-slate-700 bg-slate-950 text-slate-200 hover:border-slate-600",
                        ].join(" ")}
                      >
                        <div className="font-medium">{platformLabel(p)}</div>
                        <div
                          className={[
                            "text-[11px] px-2 py-1 rounded-full border",
                            selected
                              ? "border-emerald-500/60 text-emerald-200"
                              : "border-slate-600 text-slate-300",
                          ].join(" ")}
                        >
                          {selected ? "Selected" : "Select"}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex flex-wrap gap-3 pt-2">
                <button
                  type="button"
                  onClick={saveEdit}
                  disabled={editSaving}
                  className="rounded-2xl bg-emerald-500 px-5 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-60"
                >
                  {editSaving ? "Saving…" : "Save changes"}
                </button>

                <button
                  type="button"
                  onClick={closeEdit}
                  disabled={editSaving}
                  className="rounded-2xl border border-slate-600 bg-slate-950 px-5 py-2 text-sm text-slate-200 hover:border-slate-500 disabled:opacity-60"
                >
                  Cancel
                </button>
              </div>

              <div className="text-[11px] text-slate-500">
                Note: If a post is already posted, we block deletion in the UI to avoid accidental loss.
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
