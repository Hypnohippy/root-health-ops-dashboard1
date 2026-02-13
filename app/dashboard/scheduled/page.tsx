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

type CommonsImage = {
  url: string;
  title: string;
  pageUrl: string;
  licenseShortName?: string;
  licenseUrl?: string;
  attribution?: string;
};

type CommonsImagesApiResponse = {
  success: boolean;
  query?: string;
  images?: CommonsImage[];
  error?: string;
  debug?: any;
};

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

function safeUrl(u?: string | null) {
  const s = String(u || "").trim();
  if (!s) return "";
  if (!/^https?:\/\//i.test(s)) return "";
  return s;
}

function stripHtml(s: string) {
  return String(s || "")
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Fixes:
 * - "Unknown error" showing for OK results
 * - "[object Object]" showing for failures
 */
function describeResult(r: any) {
  const ok = !!r?.ok;

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

  return "FAILED — Unknown error";
}

// LinkedIn share text is fussy. We’ll enforce a safe limit in UI.
// If you find LinkedIn still rejects, we can lower this (e.g. 2500).
const LINKEDIN_TEXT_LIMIT = 3000;

const ALL_PLATFORMS = ["facebook", "instagram", "threads", "linkedin", "tiktok"];

function applyUkSpellings(input: string) {
  const pairs: Array<[RegExp, string]> = [
    [/\borganization\b/gi, "organisation"],
    [/\borganizations\b/gi, "organisations"],
    [/\borganize\b/gi, "organise"],
    [/\borganized\b/gi, "organised"],
    [/\borganizing\b/gi, "organising"],
    [/\bcolor\b/gi, "colour"],
    [/\bcolors\b/gi, "colours"],
    [/\bbehavior\b/gi, "behaviour"],
    [/\bfavorite\b/gi, "favourite"],
    [/\bcenter\b/gi, "centre"],
    [/\btraveling\b/gi, "travelling"],
    [/\btraveled\b/gi, "travelled"],
  ];
  let out = input || "";
  for (const [re, rep] of pairs) out = out.replace(re, rep);
  return out;
}

function isHttps(url: string) {
  return /^https:\/\/.+/i.test((url || "").trim());
}
function isLikelyImageUrl(url: string) {
  const u = (url || "").trim();
  if (!u) return false;
  if (!isHttps(u)) return false;
  return /\.(jpg|jpeg|png|webp|gif)(\?.*)?$/i.test(u);
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

  // Media picker inside modal
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQuery, setPickerQuery] = useState("");
  const [pickerLoading, setPickerLoading] = useState(false);
  const [pickerError, setPickerError] = useState<string | null>(null);
  const [pickerResults, setPickerResults] = useState<CommonsImage[]>([]);

  // Media tester state
  const [mediaTestLoading, setMediaTestLoading] = useState(false);
  const [mediaTestResult, setMediaTestResult] = useState<string | null>(null);

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

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [includeQuickBlast]);

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

    setPickerQuery("office productivity workplace");
    setPickerResults([]);
    setPickerError(null);
    setPickerLoading(false);
    setPickerOpen(false);

    setMediaTestLoading(false);
    setMediaTestResult(null);

    setEditOpen(true);
  }

  function closeEdit() {
    setEditOpen(false);
    setEditSaving(false);
    setEditError(null);
    setEditing(null);

    setPickerOpen(false);
    setPickerResults([]);
    setPickerError(null);
    setPickerLoading(false);

    setMediaTestLoading(false);
    setMediaTestResult(null);
  }

  // ✅ ESC closes modal (and picker if open)
  useEffect(() => {
    if (!editOpen) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (pickerOpen) {
          closePicker();
          return;
        }
        closeEdit();
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editOpen, pickerOpen]);

  function openPicker() {
    setPickerOpen(true);
    setPickerResults([]);
    setPickerError(null);
  }

  function closePicker() {
    setPickerOpen(false);
    setPickerResults([]);
    setPickerError(null);
    setPickerLoading(false);
  }

  async function searchPicker(q: string) {
    const query = (q || "").trim();
    if (!query) {
      setPickerError("Type a few keywords first (e.g., 'office desk teamwork').");
      return;
    }

    setPickerLoading(true);
    setPickerError(null);
    setPickerResults([]);

    try {
      const res = await fetch(
        `/api/media/commons-images?q=${encodeURIComponent(query)}&limit=9`,
        { cache: "no-store" }
      );
      const data: CommonsImagesApiResponse = await res.json().catch(() => null);

      if (!res.ok || !data?.success) {
        throw new Error(data?.error || `Image search failed (${res.status})`);
      }

      const images = Array.isArray(data.images) ? data.images : [];
      if (images.length === 0) {
        setPickerError("No results. Try simpler words like 'office' or 'factory'.");
        setPickerResults([]);
      } else {
        setPickerResults(images);
      }
    } catch (e: any) {
      setPickerError(e?.message || "Image search failed.");
      setPickerResults([]);
    } finally {
      setPickerLoading(false);
    }
  }

  function chooseImage(img: CommonsImage) {
    setEditImageUrl(img?.url || "");
    setMediaTestResult(null);
    closePicker();
  }

  function isPastIso(iso: string) {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return false;
    return d.getTime() < Date.now();
  }

  function requeuePlusOneMinute() {
    const d = new Date(Date.now() + 60 * 1000);
    const pad = (n: number) => String(n).padStart(2, "0");
    const yyyy = d.getFullYear();
    const mm = pad(d.getMonth() + 1);
    const dd = pad(d.getDate());
    const hh = pad(d.getHours());
    const mi = pad(d.getMinutes());
    setEditScheduledFor(`${yyyy}-${mm}-${dd}T${hh}:${mi}`);
  }

  function getLinkedInCountText(msg: string) {
    const s = String(msg || "");
    return `${s.length}/${LINKEDIN_TEXT_LIMIT}`;
  }

  function violatesLinkedInLimit(msg: string, platforms: string[]) {
    const hasLi = platforms.some((p) => String(p).toLowerCase() === "linkedin");
    if (!hasLi) return false;
    return String(msg || "").length > LINKEDIN_TEXT_LIMIT;
  }

  async function testMediaUrl() {
    setMediaTestLoading(true);
    setMediaTestResult(null);

    const url = String(editImageUrl || "").trim();

    try {
      if (!url) {
        setMediaTestResult("No media URL set. (Text-only post)");
        setMediaTestLoading(false);
        return;
      }

      if (!isHttps(url)) {
        setMediaTestResult("This needs to be a HTTPS link.");
        setMediaTestLoading(false);
        return;
      }

      if (!isLikelyImageUrl(url)) {
        setMediaTestResult("This doesn’t look like a direct image file (needs .jpg/.png/.webp/.gif).");
        setMediaTestLoading(false);
        return;
      }

      // Lightweight fetch check (server might still be stricter, but this catches dead links)
      const res = await fetch(url, { method: "HEAD", cache: "no-store" }).catch(() => null as any);
      if (!res) {
        setMediaTestResult("We couldn’t reach that URL from the browser. Try a different one.");
        setMediaTestLoading(false);
        return;
      }

      if (!res.ok) {
        setMediaTestResult(`That link is not reachable (HTTP ${res.status}). Try a different image.`);
        setMediaTestLoading(false);
        return;
      }

      const ct = String(res.headers?.get?.("content-type") || "").toLowerCase();
      if (ct && !ct.includes("image")) {
        setMediaTestResult(`That link doesn’t return an image (content-type: ${ct || "unknown"}).`);
        setMediaTestLoading(false);
        return;
      }

      setMediaTestResult("✅ Media looks usable.");
    } catch (e: any) {
      setMediaTestResult(e?.message || "Media check failed.");
    } finally {
      setMediaTestLoading(false);
    }
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

    if (isPastIso(iso)) {
      setEditSaving(false);
      setEditError(
        "That time is in the past. Scheduled posts won’t fire retroactively. Choose a future time, or click “Re-queue +1 min”."
      );
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

    if (violatesLinkedInLimit(editMessage, editPlatforms)) {
      setEditSaving(false);
      setEditError(
        `LinkedIn post is too long (${getLinkedInCountText(editMessage)}). Shorten it or remove LinkedIn from platforms.`
      );
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
          force_requeue: true,
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

  // ✅ Save → Publish → Refresh (this fixes your “posted without media” issue)
  async function publishNow() {
    if (!editing) return;

    setEditSaving(true);
    setEditError(null);

    const iso = localInputToIso(editScheduledFor);
    if (!iso) {
      setEditSaving(false);
      setEditError("Please choose a valid date/time.");
      return;
    }

    if (isPastIso(iso)) {
      setEditSaving(false);
      setEditError("That time is in the past. Choose a future time, or click “Re-queue +1 min”.");
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

    if (violatesLinkedInLimit(editMessage, editPlatforms)) {
      setEditSaving(false);
      setEditError(`LinkedIn post is too long (${getLinkedInCountText(editMessage)}).`);
      return;
    }

    try {
      // 1) save WITHOUT forcing queued (we are publishing now)
      const saveRes = await fetch("/api/social/scheduled/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          id: editing.id,
          message: editMessage,
          scheduled_for: iso,
          platforms: editPlatforms,
          image_url: editImageUrl.trim() || null,
          force_requeue: false,
        }),
      });

      const saveJson = await saveRes.json().catch(() => null);
      if (!saveRes.ok || !saveJson?.success) {
        setEditSaving(false);
        setEditError(saveJson?.error || "Save failed — couldn’t publish.");
        return;
      }

      // 2) publish now
      const pubRes = await fetch(
        `/api/publish/now?organisationId=${encodeURIComponent(editing.organisation_id)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          body: JSON.stringify({
            id: editing.id,
            platforms: editPlatforms,
          }),
        }
      );

      const pubJson = await pubRes.json().catch(() => null);

      setEditSaving(false);

      // Close and refresh so Dispatch results updates in UI
      closeEdit();
      load();

      // If server returned a friendly message, show it.
      const maybeUserMessage =
        pubJson?.userMessage ||
        pubJson?.error ||
        (Array.isArray(pubJson?.results)
          ? pubJson.results.find((r: any) => !r.ok && r.platform === "linkedin")?.error
          : null);

      if (maybeUserMessage) {
        // Keep it short and non-techy
        alert(String(maybeUserMessage));
      }
    } catch (e: any) {
      setEditSaving(false);
      setEditError(e?.message || "Publish now failed.");
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
                Tip: Use Stories / Queue flows to build a future pipeline.
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

      {/* Edit modal */}
      {editOpen && editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/70" onClick={closeEdit} />

          <div className="relative w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-3xl border border-slate-700 bg-slate-950 p-6 shadow-2xl">
            <div className="sticky top-0 z-10 bg-slate-950 pb-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-xs text-slate-400">Edit scheduled post</div>
                  <div className="mt-1 text-lg font-semibold text-slate-100 break-all">{editing.id}</div>
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
            </div>

            <div className="grid gap-4">
              <div>
                <div className="flex items-end justify-between gap-3">
                  <label className="block text-xs font-medium text-slate-300">Message</label>

                  <div className="flex items-center gap-2">
                    {editPlatforms.includes("linkedin") ? (
                      <span
                        className={[
                          "text-[11px] rounded-full border px-2 py-1",
                          String(editMessage || "").length > LINKEDIN_TEXT_LIMIT
                            ? "border-red-500/50 text-red-200 bg-red-500/10"
                            : "border-slate-700 text-slate-300 bg-slate-900/40",
                        ].join(" ")}
                      >
                        LinkedIn {getLinkedInCountText(editMessage)}
                      </span>
                    ) : null}

                    <button
                      type="button"
                      onClick={() => setEditMessage((m) => applyUkSpellings(m))}
                      className="rounded-xl border border-slate-700 bg-slate-900/70 px-3 py-2 text-[11px] text-slate-200 hover:border-slate-600"
                      title="Quick UK spelling tweaks (safe replacements)"
                    >
                      UK spellings
                    </button>
                  </div>
                </div>

                <textarea
                  value={editMessage}
                  onChange={(e) => {
                    const next = e.target.value;
                    if (editPlatforms.includes("linkedin") && next.length > LINKEDIN_TEXT_LIMIT) {
                      setEditMessage(next.slice(0, LINKEDIN_TEXT_LIMIT));
                      return;
                    }
                    setEditMessage(next);
                  }}
                  rows={7}
                  className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                />
                {editPlatforms.includes("linkedin") ? (
                  <div className="mt-1 text-[11px] text-slate-500">
                    LinkedIn is strict. We enforce a safe limit in the editor to reduce “too long” failures.
                  </div>
                ) : null}
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-medium text-slate-300">Scheduled for</label>
                    <button
                      type="button"
                      onClick={requeuePlusOneMinute}
                      className="rounded-xl border border-slate-700 bg-slate-900/70 px-3 py-2 text-[11px] text-slate-200 hover:border-slate-600"
                      title="If a post is stuck in the past, re-queue it safely"
                    >
                      Re-queue +1 min
                    </button>
                  </div>

                  <input
                    type="datetime-local"
                    value={editScheduledFor}
                    onChange={(e) => setEditScheduledFor(e.target.value)}
                    className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                  />
                  <div className="mt-1 text-[11px] text-slate-500">Saved as UTC in the database.</div>
                </div>

                <div>
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-medium text-slate-300">Media URL (optional)</label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={testMediaUrl}
                        disabled={mediaTestLoading}
                        className="rounded-xl border border-slate-700 bg-slate-900/70 px-3 py-2 text-[11px] text-slate-200 hover:border-slate-600 disabled:opacity-60"
                        title="Checks if the link is reachable and looks like a direct image file"
                      >
                        {mediaTestLoading ? "Testing…" : "Test media"}
                      </button>
                      <button
                        type="button"
                        onClick={() => openPicker()}
                        className="rounded-xl bg-blue-500 px-3 py-2 text-[11px] font-semibold text-slate-50 hover:bg-blue-400"
                      >
                        Search media
                      </button>
                    </div>
                  </div>

                  <input
                    value={editImageUrl}
                    onChange={(e) => {
                      setEditImageUrl(e.target.value);
                      setMediaTestResult(null);
                    }}
                    className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                    placeholder="https://.../image.jpg"
                  />

                  {mediaTestResult ? (
                    <div className="mt-2 text-[11px] text-slate-300">
                      {mediaTestResult}
                      {!isLikelyImageUrl(editImageUrl) ? (
                        <div className="mt-1 text-slate-500">
                          Tip: LinkedIn needs a real image file link ending in <b>.jpg</b> or <b>.png</b> etc — not a webpage.
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <div className="mt-2 text-[11px] text-slate-500">
                      Tip: Use a direct image file URL (https + ends with .jpg/.png/.webp/.gif). If unsure, use Search media.
                      <br />
                      Copyright note: always check the source licence before using any image commercially.
                    </div>
                  )}
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
                  onClick={publishNow}
                  disabled={editSaving}
                  className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 px-5 py-2 text-sm font-semibold text-emerald-200 hover:bg-emerald-500/15 disabled:opacity-60"
                  title="This will save your changes first, then publish immediately, then refresh Dispatch results."
                >
                  {editSaving ? "Publishing…" : "Save + Publish now"}
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
                Tip: Click outside the modal or press <b>Esc</b> to close.
              </div>
            </div>

            {/* Media picker modal */}
            {pickerOpen ? (
              <div className="fixed inset-0 z-[60] flex items-center justify-center px-4">
                <div className="absolute inset-0 bg-black/70" onClick={closePicker} aria-hidden="true" />
                <div className="relative w-full max-w-4xl max-h-[85vh] overflow-y-auto rounded-3xl border border-slate-700 bg-slate-950 text-slate-100 shadow-2xl">
                  <div className="p-5 border-b border-slate-700 flex items-start justify-between gap-3 sticky top-0 bg-slate-950 z-10">
                    <div>
                      <div className="text-lg font-semibold">Pick an image</div>
                      <div className="text-[12px] text-slate-400">
                        Uses Wikimedia Commons. Select one → it fills the Media URL.
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={closePicker}
                      className="rounded-full border border-slate-600 bg-slate-900 px-3 py-1.5 text-xs hover:bg-white/10"
                    >
                      Close
                    </button>
                  </div>

                  <div className="p-5 space-y-4">
                    <div className="flex flex-col md:flex-row gap-3 md:items-end">
                      <div className="flex-1">
                        <div className="text-[11px] text-slate-400 mb-1">Search keywords</div>
                        <input
                          value={pickerQuery}
                          onChange={(e) => setPickerQuery(e.target.value)}
                          className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none"
                          placeholder="e.g. office desk teamwork"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => searchPicker(pickerQuery)}
                        disabled={pickerLoading}
                        className="rounded-2xl bg-blue-500 px-4 py-2 text-sm font-semibold text-slate-50 hover:bg-blue-400 disabled:opacity-60"
                      >
                        {pickerLoading ? "Searching…" : "Search"}
                      </button>
                    </div>

                    {pickerError ? (
                      <div className="rounded-2xl border border-red-500/40 bg-red-950/30 px-4 py-3 text-sm text-red-100">
                        {pickerError}
                      </div>
                    ) : null}

                    {pickerLoading ? (
                      <div className="text-sm text-slate-300">Loading results…</div>
                    ) : pickerResults.length === 0 ? (
                      <div className="text-sm text-slate-400">No results yet — hit Search.</div>
                    ) : (
                      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {pickerResults.map((img, i) => {
                          const u = safeUrl(img.url);
                          return (
                            <button
                              key={`${i}-${img.title}`}
                              type="button"
                              onClick={() => chooseImage(img)}
                              className="text-left rounded-2xl border border-slate-700 bg-slate-900 hover:bg-slate-800 transition overflow-hidden"
                            >
                              <div className="h-[150px] bg-slate-950">
                                {u ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img src={u} alt={img.title} className="w-full h-full object-cover" />
                                ) : (
                                  <div className="h-full flex items-center justify-center text-xs text-slate-400">
                                    No preview
                                  </div>
                                )}
                              </div>
                              <div className="p-3 space-y-1">
                                <div className="text-xs font-semibold line-clamp-2">
                                  {img.title.replace(/^File:/, "")}
                                </div>
                                <div className="text-[11px] text-slate-400">
                                  {img.licenseShortName || "Licence unknown"}
                                </div>
                                {img.attribution ? (
                                  <div className="text-[11px] text-slate-300 line-clamp-2">
                                    {stripHtml(img.attribution)}
                                  </div>
                                ) : null}
                                <div className="text-[11px] text-emerald-300 line-clamp-1">Select this</div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}

                    <div className="text-[11px] text-slate-500">
                      Copyright note: Wikimedia items have licences — always check the file page before using commercially.
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
