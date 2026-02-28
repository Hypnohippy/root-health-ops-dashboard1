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
  thumb?: string;
  pageUrl: string;
  licenseShortName?: string;
  licenseUrl?: string;
  attribution?: string;
};

type CommonsImagesApiResponse = {
  success: boolean;
  query?: string;
  // your API sometimes returns items, sometimes images (we handle both)
  items?: any[];
  images?: any[];
  error?: string;
};

type RangeMode = "future" | "past" | "all";

const ALL_PLATFORMS = ["facebook", "instagram", "threads", "linkedin", "tiktok"];

const PREFILL_SCHEDULED_KEYS = ["rootops_prefill_scheduled_v1", "rh_prefill_scheduled_v1"];

function safeLower(s: any) {
  return String(s || "").toLowerCase().trim();
}

function safeUrl(u?: string | null) {
  const s = String(u || "").trim();
  if (!s) return "";
  if (!/^https?:\/\//i.test(s)) return "";
  return s;
}

function fmtShort(dt?: string | null) {
  if (!dt) return "—";
  const d = new Date(dt);
  if (isNaN(d.getTime())) return dt;
  return d.toLocaleString(undefined, {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
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

function stripHtml(s: string) {
  return String(s || "")
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function getLocalStorageFirst(keys: string[]) {
  try {
    for (const k of keys) {
      const raw = window.localStorage.getItem(k);
      if (raw) return raw;
    }
  } catch {}
  return null;
}

function removeLocalStorageMulti(keys: string[]) {
  try {
    for (const k of keys) {
      try {
        window.localStorage.removeItem(k);
      } catch {}
    }
  } catch {}
}

type PrefillItem = {
  title?: string;
  text?: string;
  imageUrl?: string;
  image_url?: string;
  attribution?: any;
  meta?: any;
};

type ScheduledPrefill = {
  mode?: "single" | "series";
  platform?: string;
  tone?: string;
  items?: PrefillItem[];
  note?: string;

  // optional future compatibility (if we ever send it)
  scheduledStartIso?: string;
};

function safeParsePrefill(raw: string | null): ScheduledPrefill | null {
  try {
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (!p || typeof p !== "object") return null;
    return p as ScheduledPrefill;
  } catch {
    return null;
  }
}

function normaliseMediaUrl(raw: any): string | null {
  const s = String(raw || "").trim();
  if (!s) return null;
  if (s === "PASTE_THE_IMAGE_URL_HERE") return null;
  if (s.toLowerCase().includes("paste_the_image_url_here")) return null;
  if (!/^https?:\/\//i.test(s)) return null;
  return s;
}

function getPrefillImageUrl(it: PrefillItem): string | null {
  const a = normaliseMediaUrl((it as any)?.imageUrl);
  if (a) return a;
  const b = normaliseMediaUrl((it as any)?.image_url);
  if (b) return b;
  return null;
}

function commonsFilePageUrl(title: string) {
  // title usually looks like "File:Something.jpg"
  const t = String(title || "").trim();
  if (!t) return "";
  const encoded = encodeURIComponent(t.replace(/ /g, "_"));
  return `https://commons.wikimedia.org/wiki/${encoded}`;
}

function normaliseCommonsResponse(data: CommonsImagesApiResponse): CommonsImage[] {
  const rawArr = Array.isArray(data?.images) ? data.images : Array.isArray(data?.items) ? data.items : [];
  const out: CommonsImage[] = [];

  for (const r of rawArr) {
    const title = String(r?.title || r?.name || "").trim();
    const url = String(r?.url || "").trim();
    const thumb = String(r?.thumb || r?.thumbnail || "").trim() || undefined;

    if (!title || !url) continue;

    out.push({
      title,
      url,
      thumb,
      pageUrl: String(r?.pageUrl || r?.page_url || "").trim() || commonsFilePageUrl(title),
      licenseShortName: r?.licenseShortName || r?.license_short_name || undefined,
      licenseUrl: r?.licenseUrl || r?.license_url || undefined,
      attribution: r?.attribution || undefined,
    });
  }

  return out;
}

function defaultTomorrowAt(hour = 9, minute = 0) {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute, 0, 0);
  // tomorrow
  d.setDate(d.getDate() + 1);
  return d;
}

export default function ScheduledPage() {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<ScheduledRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [range, setRange] = useState<RangeMode>("future");

  // simple search (optional)
  const [q, setQ] = useState("");

  const [orgId, setOrgId] = useState<string | null>(null);
  const [orgError, setOrgError] = useState<string | null>(null);

  const [toast, setToast] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importNote, setImportNote] = useState<string | null>(null);

  // Edit modal
  const [editOpen, setEditOpen] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const [editing, setEditing] = useState<ScheduledRow | null>(null);
  const [editMessage, setEditMessage] = useState("");
  const [editScheduledFor, setEditScheduledFor] = useState("");
  const [editImageUrl, setEditImageUrl] = useState("");
  const [editPlatforms, setEditPlatforms] = useState<string[]>([]);

  // image picker
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQuery, setPickerQuery] = useState("");
  const [pickerLoading, setPickerLoading] = useState(false);
  const [pickerError, setPickerError] = useState<string | null>(null);
  const [pickerResults, setPickerResults] = useState<CommonsImage[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/org/current", { cache: "no-store" });
        const data: any = await res.json().catch(() => null);

        const id = data?.organisationId ? String(data.organisationId) : null;
        if (!id) {
          setOrgId(null);
          setOrgError(data?.error || "Organisation not found.");
          return;
        }

        setOrgId(id);
        setOrgError(null);
      } catch (e: any) {
        setOrgId(null);
        setOrgError(e?.message || "Failed to load organisation. Refresh the page.");
      }
    })();
  }, []);

  async function load(forceOrgId?: string | null) {
    const useOrg = String(forceOrgId ?? orgId ?? "").trim();

    if (!useOrg) {
      setLoading(false);
      setItems([]);
      setError(orgError || "Organisation not loaded yet.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/social/scheduled?range=${encodeURIComponent(range)}&includeQuickBlast=0&organisationId=${encodeURIComponent(useOrg)}`,
        { cache: "no-store" }
      );
      const json = await res.json().catch(() => null);

      if (!res.ok || !json?.success) {
        setItems([]);
        setError(json?.error || `Failed to load (${res.status})`);
        setLoading(false);
        return;
      }

      const next = Array.isArray(json.items) ? json.items : [];
      setItems(next);
    } catch (e: any) {
      setItems([]);
      setError(e?.message || "Failed to load scheduled posts.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!orgId) return;
    load(orgId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, range]);

  // ✅ Import from Brainstorm (series = 1 post per day)
  useEffect(() => {
    if (!orgId) return;
    if (importing) return;

    const raw = getLocalStorageFirst(PREFILL_SCHEDULED_KEYS);
    const prefill = safeParsePrefill(raw);
    if (!prefill) return;

    const prefillItems = Array.isArray(prefill.items) ? prefill.items : [];
    if (!prefillItems.length) {
      removeLocalStorageMulti(PREFILL_SCHEDULED_KEYS);
      return;
    }

    setImportNote(prefill.note ? String(prefill.note) : null);

    (async () => {
      setImporting(true);
      setToast(`Importing ${prefillItems.length} item(s) into Scheduled…`);

      let okCount = 0;
      let failCount = 0;
      const failures: string[] = [];

      try {
        // Start time:
        // - If Brainstorm ever sends scheduledStartIso, use it.
        // - Else default: tomorrow at 09:00 local time.
        const startIso = String((prefill as any)?.scheduledStartIso || "").trim();
        const startMs = (() => {
          const d = new Date(startIso);
          if (startIso && !isNaN(d.getTime())) return d.getTime();
          return defaultTomorrowAt(9, 0).getTime();
        })();

        // ✅ 1 post per day
        const oneDayMs = 24 * 60 * 60 * 1000;

        for (let i = 0; i < prefillItems.length; i++) {
          const it = prefillItems[i];

          const message = String(it?.text || "").trim();
          if (!message) {
            failCount++;
            failures.push(`Item ${i + 1}: empty text`);
            continue;
          }

          const whenIso = new Date(startMs + i * oneDayMs).toISOString();
          const imageUrl = getPrefillImageUrl(it);

          // If prefill included a platform, use it; else keep it simple: Facebook
          const p = String(prefill.platform || "facebook").toLowerCase().trim();
          const platforms = [p || "facebook"];

          const res = await fetch("/api/social/schedule", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            cache: "no-store",
            body: JSON.stringify({
              organisationId: orgId,
              message,
              platforms,
              scheduledAt: whenIso,
              imageUrl,
              image_url: imageUrl,
              meta: {
                source: "brainstorm",
                title: String(it?.title || `Draft ${i + 1}`),
                attribution: it?.attribution || null,
              },
            }),
          });

          const json: any = await res.json().catch(() => null);

          if (!res.ok || !json?.success) {
            failCount++;
            failures.push(`Item ${i + 1}: ${json?.error || json?.message || `Failed (${res.status})`}`);
          } else {
            okCount++;
          }
        }

        removeLocalStorageMulti(PREFILL_SCHEDULED_KEYS);

        if (okCount > 0 && failCount === 0) {
          setToast(`Imported ${okCount}/${prefillItems.length} ✅ (1 per day)`);
        } else if (okCount > 0) {
          setToast(`Imported ${okCount}/${prefillItems.length} (some failed)`);
          if (failures.length) setError(`Some imports failed:\n${failures.slice(0, 6).join("\n")}`);
        } else {
          setToast("Import failed.");
          setError(`Import failed:\n${failures.slice(0, 6).join("\n")}`);
        }

        setRange("future");
        await load(orgId);
      } catch (e: any) {
        removeLocalStorageMulti(PREFILL_SCHEDULED_KEYS);
        setError(e?.message || "Import failed.");
        setToast("Import failed.");
      } finally {
        setImporting(false);
        setTimeout(() => setToast(null), 2200);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  const filtered = useMemo(() => {
    const query = safeLower(q);
    const arr = [...(items || [])];

    // sort: future => soonest first, past/all => newest first
    arr.sort((a, b) => {
      const aT = new Date(a.scheduled_for || a.created_at || 0).getTime() || 0;
      const bT = new Date(b.scheduled_for || b.created_at || 0).getTime() || 0;
      if (range === "future") return aT - bT;
      return bT - aT;
    });

    if (!query) return arr;

    return arr.filter((it) => {
      const platforms = Array.isArray(it.platforms) ? it.platforms.map((x) => safeLower(x)) : [];
      const msg = safeLower(it.message || "");
      const source = safeLower(it?.meta?.source || "");
      const hay = `${msg} ${platforms.join(" ")} ${source} ${safeLower(it.status || "")}`;
      return hay.includes(query);
    });
  }, [items, q, range]);

  function openEdit(it: ScheduledRow) {
    setEditing(it);
    setEditMessage(String(it.message || ""));
    setEditImageUrl(String(it.image_url || ""));
    setEditPlatforms(Array.isArray(it.platforms) ? it.platforms : []);
    setEditScheduledFor(toLocalInputValue(it.scheduled_for));
    setEditError(null);

    // default query for media
    setPickerQuery("workplace wellbeing");
    setPickerResults([]);
    setPickerError(null);
    setPickerLoading(false);
    setPickerOpen(false);

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
  }

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
      setPickerError("Type a few keywords first (e.g., 'adhd desk focus').");
      return;
    }

    setPickerLoading(true);
    setPickerError(null);
    setPickerResults([]);

    try {
      const res = await fetch(`/api/media/commons-images?q=${encodeURIComponent(query)}&limit=12`, {
        cache: "no-store",
      });
      const data: CommonsImagesApiResponse = await res.json().catch(() => null as any);

      if (!res.ok || !data?.success) {
        throw new Error(data?.error || `Image search failed (${res.status})`);
      }

      const images = normaliseCommonsResponse(data);

      if (images.length === 0) {
        setPickerError("No results. Try different words (more concrete nouns).");
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
    closePicker();
  }

  function isPastIso(iso: string) {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return false;
    return d.getTime() < Date.now();
  }

  async function saveEdit() {
    if (!editing) return;
    if (!orgId) {
      setEditError("Organisation not loaded yet. Refresh the page.");
      return;
    }

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
      setEditError("That time is in the past. Choose a future time.");
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
      const cleaned = normaliseMediaUrl(editImageUrl) || null;

      const res = await fetch("/api/social/scheduled/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          id: editing.id,
          organisationId: orgId,
          message: editMessage,
          scheduled_for: iso,
          platforms: editPlatforms,
          image_url: cleaned,
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
      load(orgId);
    } catch (e: any) {
      setEditSaving(false);
      setEditError(e?.message || "Update failed.");
    }
  }

  async function deletePost(it: ScheduledRow) {
    if (!orgId) {
      alert("Organisation not loaded yet. Refresh the page.");
      return;
    }

    const status = safeLower(it.status);
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
        body: JSON.stringify({ id: it.id, organisationId: orgId }),
      });

      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        alert(json?.error || "Delete failed.");
        return;
      }

      load(orgId);
    } catch (e: any) {
      alert(e?.message || "Delete failed.");
    }
  }

  const emptyState = !loading && !error && filtered.length === 0;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 px-4 py-10">
      <div className="mx-auto w-full max-w-5xl space-y-6">
        <div className="rounded-3xl border border-slate-700 bg-slate-900/70 p-6 md:p-8 shadow-xl backdrop-blur">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
            <div>
              <div className="text-xs text-slate-400">Root Health Ops</div>
              <h1 className="mt-1 text-2xl md:text-3xl font-semibold">Scheduled</h1>
              <p className="mt-2 text-sm text-slate-300">
                Simple scheduling: edit a post → pick the exact date + time you want.
              </p>
              <div className="mt-2 text-xs text-slate-500 break-all">Org: {orgId || "—"}</div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={() => load(orgId)}
                className="rounded-2xl border border-slate-600 bg-slate-950 px-4 py-2 text-sm text-slate-200 hover:border-slate-500"
              >
                Refresh
              </button>

              <label className="flex items-center gap-2 text-sm text-slate-300">
                <span className="text-xs text-slate-400">View</span>
                <select
                  value={range}
                  onChange={(e) => setRange(e.target.value as RangeMode)}
                  className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 outline-none hover:border-slate-600"
                >
                  <option value="future">Future</option>
                  <option value="past">Past</option>
                  <option value="all">All</option>
                </select>
              </label>
            </div>
          </div>

          <div className="mt-5">
            <div className="text-[11px] text-slate-400 mb-1">Search</div>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
              placeholder='Search… (e.g. "tiktok", "brainstorm", "failed")'
            />
          </div>

          {orgError ? (
            <div className="mt-6 rounded-2xl border border-red-500/40 bg-red-950/30 p-4 text-red-100">
              {orgError}
            </div>
          ) : null}

          {toast ? (
            <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-slate-200">
              {toast}
              {importNote ? <div className="mt-1 text-[12px] text-slate-400">{importNote}</div> : null}
            </div>
          ) : null}

          {loading ? (
            <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-950/60 p-4 text-slate-300">
              Loading…
            </div>
          ) : error ? (
            <div className="mt-6 whitespace-pre-wrap rounded-2xl border border-red-500/40 bg-red-950/30 p-4 text-red-100">
              {error}
            </div>
          ) : emptyState ? (
            <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-950/60 p-5 text-slate-300">
              Nothing to show ✅
            </div>
          ) : (
            <div className="mt-6 space-y-3">
              {filtered.map((it) => {
                const platforms = Array.isArray(it.platforms) ? it.platforms : [];
                const media = safeUrl(it.image_url);

                const status = safeLower(it.status || "");
                const statusChip =
                  status === "posted"
                    ? "border-emerald-500/60 text-emerald-200 bg-emerald-500/10"
                    : status.includes("fail")
                    ? "border-red-500/50 text-red-200 bg-red-500/10"
                    : status.includes("pending") || status.includes("queue")
                    ? "border-amber-500/40 text-amber-200 bg-amber-500/10"
                    : "border-slate-700 text-slate-200 bg-slate-900/40";

                return (
                  <div key={it.id} className="rounded-3xl border border-slate-700 bg-slate-950 p-4 md:p-5">
                    <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-xs text-slate-400">
                          {fmtShort(it.scheduled_for)} · {platforms.map(platformLabel).join(", ") || "—"}
                        </div>

                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <span className={["text-xs rounded-full border px-2 py-0.5", statusChip].join(" ")}>
                            {it.status || "—"}
                          </span>

                          {media ? (
                            <span className="text-xs text-slate-400">media ✅</span>
                          ) : (
                            <span className="text-xs text-slate-500">media —</span>
                          )}
                        </div>

                        <div className="mt-3 text-sm text-slate-200 whitespace-pre-wrap break-words">
                          {String(it.message || "").trim() || "—"}
                        </div>

                        {media ? (
                          <div className="mt-2 text-xs text-slate-400 break-all">
                            Media:{" "}
                            <a className="text-emerald-300 hover:text-emerald-200" href={media} target="_blank" rel="noreferrer">
                              {media}
                            </a>
                          </div>
                        ) : null}
                      </div>

                      <div className="flex flex-wrap gap-2 justify-end">
                        <button
                          className="rounded-2xl border border-slate-700 bg-slate-900/70 px-3 py-2 text-xs text-slate-200 hover:border-slate-600"
                          onClick={() => openEdit(it)}
                        >
                          Edit
                        </button>

                        <button
                          className={[
                            "rounded-2xl border px-3 py-2 text-xs",
                            safeLower(it.status) === "posted"
                              ? "border-slate-800 bg-slate-950/40 text-slate-600 cursor-not-allowed"
                              : "border-red-500/40 bg-red-950/30 text-red-100 hover:border-red-500",
                          ].join(" ")}
                          onClick={() => (safeLower(it.status) === "posted" ? null : deletePost(it))}
                          title={safeLower(it.status) === "posted" ? "Posted items are protected" : "Delete scheduled post"}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Edit modal */}
        {editOpen && editing ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
            <div className="absolute inset-0 bg-black/70" onClick={closeEdit} />

            <div className="relative w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-3xl border border-slate-700 bg-slate-950 p-6 shadow-2xl">
              <div className="sticky top-0 z-10 bg-slate-950 pb-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-xs text-slate-400">Edit scheduled post</div>
                    <div className="mt-1 text-sm font-semibold text-slate-100 break-all">{editing.id}</div>
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
                  <label className="block text-xs font-medium text-slate-300">Message</label>
                  <textarea
                    value={editMessage}
                    onChange={(e) => setEditMessage(e.target.value)}
                    rows={7}
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
                  </div>

                  <div>
                    <div className="flex items-center justify-between">
                      <label className="block text-xs font-medium text-slate-300">Media URL (optional)</label>
                      <button
                        type="button"
                        onClick={() => openPicker()}
                        className="rounded-xl bg-blue-500 px-3 py-2 text-[11px] font-semibold text-slate-50 hover:bg-blue-400"
                      >
                        Search media
                      </button>
                    </div>

                    <input
                      value={editImageUrl}
                      onChange={(e) => setEditImageUrl(e.target.value)}
                      className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                      placeholder="https://..."
                    />
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
                            setEditPlatforms((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]))
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
                              selected ? "border-emerald-500/60 text-emerald-200" : "border-slate-600 text-slate-300",
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
              </div>

              {/* Picker modal */}
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
                            placeholder="e.g. adhd workplace desk"
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
                            const u = safeUrl(img.thumb || img.url);
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
                                  <div className="text-xs font-semibold line-clamp-2">{img.title.replace(/^File:/, "")}</div>
                                  {img.attribution ? (
                                    <div className="text-[11px] text-slate-300 line-clamp-2">{stripHtml(img.attribution)}</div>
                                  ) : (
                                    <div className="text-[11px] text-slate-400">Commons</div>
                                  )}
                                  <div className="text-[11px] text-emerald-300 line-clamp-1">Select this</div>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      )}

                      <div className="text-[11px] text-slate-500">
                        Tip: Try concrete nouns: “office desk”, “brain”, “routine”, “sleep”, “stress”, “walking”, “calendar”.
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
