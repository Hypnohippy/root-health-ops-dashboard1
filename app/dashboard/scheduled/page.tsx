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
  pageUrl?: string;
  licenseShortName?: string;
  licenseUrl?: string;
  attribution?: string;
};

type CommonsImagesApiResponse = {
  success: boolean;
  query?: string;
  images?: CommonsImage[];
  items?: Array<{ title: string; url: string; thumb?: string }>;
  error?: string;
};

function fmt(dt?: string | null) {
  if (!dt) return "—";
  const d = new Date(dt);
  if (isNaN(d.getTime())) return dt;
  return d.toLocaleString();
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

type RangeMode = "future" | "past" | "all";

const PREFILL_SCHEDULED_KEYS = ["rootops_prefill_scheduled_v1", "rh_prefill_scheduled_v1"];

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
};

type ScheduledPrefill = {
  mode?: "single" | "series";
  platform?: string;
  tone?: string;
  items?: PrefillItem[];
  note?: string;

  // ✅ Brainstorm can optionally send these:
  scheduledStartIso?: string;
  intervalMinutes?: number;
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

function clampOneLine(s: string, max = 140) {
  const t = String(s || "").replace(/\s+/g, " ").trim();
  if (!t) return "—";
  if (t.length <= max) return t;
  return t.slice(0, max).trimEnd() + "…";
}

function safeLower(s: any) {
  return String(s || "").toLowerCase().trim();
}

function isoDayKey(iso: string) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "Unknown date";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function dayLabelFromKey(key: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return key;

  const [y, m, d] = key.split("-").map((x) => Number(x));
  const dt = new Date(y, m - 1, d);
  const today = new Date();
  const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const k0 = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate()).getTime();
  const diffDays = Math.round((k0 - t0) / (24 * 60 * 60 * 1000));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  if (diffDays === -1) return "Yesterday";

  return dt.toLocaleDateString(undefined, { weekday: "long", day: "2-digit", month: "short", year: "numeric" });
}

// ✅ helper: is this a real image URL?
function isLikelyImageUrl(u: string) {
  const s = String(u || "").toLowerCase();
  if (!s.startsWith("http")) return false;
  return (
    s.includes(".jpg") ||
    s.includes(".jpeg") ||
    s.includes(".png") ||
    s.includes(".webp") ||
    s.includes(".gif")
  );
}

export default function ScheduledPage() {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<ScheduledRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [includeQuickBlast, setIncludeQuickBlast] = useState(false);
  const [range, setRange] = useState<RangeMode>("future");

  // ✅ filters + view controls
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [platformFilter, setPlatformFilter] = useState<string>("all");
  const [groupByDay, setGroupByDay] = useState(true);

  // ✅ selection + bulk delete
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  // ✅ expand/collapse
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const [editOpen, setEditOpen] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const [editing, setEditing] = useState<ScheduledRow | null>(null);
  const [editMessage, setEditMessage] = useState("");
  const [editScheduledFor, setEditScheduledFor] = useState("");
  const [editImageUrl, setEditImageUrl] = useState("");
  const [editPlatforms, setEditPlatforms] = useState<string[]>([]);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQuery, setPickerQuery] = useState("");
  const [pickerLoading, setPickerLoading] = useState(false);
  const [pickerError, setPickerError] = useState<string | null>(null);
  const [pickerResults, setPickerResults] = useState<CommonsImage[]>([]);

  const [orgId, setOrgId] = useState<string | null>(null);
  const [orgError, setOrgError] = useState<string | null>(null);

  const [toast, setToast] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importNote, setImportNote] = useState<string | null>(null);

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
        `/api/social/scheduled?range=${encodeURIComponent(range)}&includeQuickBlast=${
          includeQuickBlast ? "1" : "0"
        }&organisationId=${encodeURIComponent(useOrg)}`,
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

      setSelectedIds(new Set());
      setExpandedIds(new Set());
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
  }, [orgId, includeQuickBlast, range]);

  const emptyState = !loading && !error && items.length === 0;

  const title = useMemo(() => {
    if (range === "all")
      return includeQuickBlast ? "All scheduled history (inc. Quick Blast)" : "All scheduled history";
    if (range === "past") return includeQuickBlast ? "Past (inc. Quick Blast)" : "Past";
    return includeQuickBlast ? "Scheduled Pipeline (including Quick Blast history)" : "Scheduled Pipeline";
  }, [includeQuickBlast, range]);

  // ✅ Import from Brainstorm (and stagger schedule times)
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

      const failures: string[] = [];
      let okCount = 0;
      let failCount = 0;

      try {
        const startIso = prefill?.scheduledStartIso ? String(prefill.scheduledStartIso) : "";
        const intervalMinRaw = (prefill as any)?.intervalMinutes;

        const startMs = (() => {
          const d = new Date(startIso);
          if (startIso && !isNaN(d.getTime())) return d.getTime();
          return Date.now() + 60 * 1000; // default 1 minute from now
        })();

        const intervalMinutes = Number.isFinite(Number(intervalMinRaw)) ? Math.max(1, Number(intervalMinRaw)) : 10;
        const intervalMs = intervalMinutes * 60 * 1000;

        // platform default: prefill.platform OR all platforms
        const platformFromPrefill = String(prefill.platform || "").toLowerCase().trim();
        const defaultPlatforms =
          platformFromPrefill && ALL_PLATFORMS.includes(platformFromPrefill) ? [platformFromPrefill] : ["facebook"];

        for (let i = 0; i < prefillItems.length; i++) {
          const it = prefillItems[i] || {};
          const message = String(it?.text || "").trim();
          const imageUrl = getPrefillImageUrl(it);
          const whenIso = new Date(startMs + i * intervalMs).toISOString();
          const platforms = defaultPlatforms;

          if (!message) {
            failCount++;
            failures.push(`Item ${i + 1}: empty text`);
            continue;
          }

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
              createdBy: { user_id: "owner", name: "Clinic Owner", email: "owner@clinic.local" },
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
          setToast(`Imported ${okCount}/${prefillItems.length} ✅ (every ${intervalMinutes} min)`);
        } else if (okCount > 0) {
          setToast(`Imported ${okCount}/${prefillItems.length} (some failed)`);
          if (failures.length) {
            setError(`Some imports failed:\n${failures.slice(0, 6).join("\n")}`);
          }
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

  function openEdit(it: ScheduledRow) {
    setEditing(it);
    setEditMessage(String(it.message || ""));
    setEditImageUrl(String(it.image_url || ""));
    setEditPlatforms(Array.isArray(it.platforms) ? it.platforms : []);
    setEditScheduledFor(toLocalInputValue(it.scheduled_for));
    setEditError(null);

    setPickerQuery("wellbeing mental health");
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
      setPickerError("Type a few keywords first (e.g., 'workplace wellbeing desk').");
      return;
    }

    setPickerLoading(true);
    setPickerError(null);
    setPickerResults([]);

    try {
      const res = await fetch(`/api/media/commons-images?q=${encodeURIComponent(query)}&limit=18`, {
        cache: "no-store",
      });
      const data: CommonsImagesApiResponse = await res.json().catch(() => null as any);

      if (!res.ok || !data?.success) {
        throw new Error(data?.error || `Image search failed (${res.status})`);
      }

      // Support either {images: []} or {items: []}
      const raw = (Array.isArray(data.images) ? data.images : Array.isArray(data.items) ? data.items : []) as any[];

      // ✅ FILTER OUT PDFs / non-image results:
      const cleaned: CommonsImage[] = raw
        .map((x) => ({
          title: String(x?.title || ""),
          url: String(x?.url || ""),
          thumb: x?.thumb ? String(x.thumb) : undefined,
          pageUrl: x?.pageUrl ? String(x.pageUrl) : undefined,
          licenseShortName: x?.licenseShortName ? String(x.licenseShortName) : undefined,
          licenseUrl: x?.licenseUrl ? String(x.licenseUrl) : undefined,
          attribution: x?.attribution ? String(x.attribution) : undefined,
        }))
        .filter((img) => {
          const u = safeUrl(img.url);
          const t = safeUrl(img.thumb || "");
          // keep if the main url is an image OR we at least have a thumb image
          return (u && isLikelyImageUrl(u)) || (t && isLikelyImageUrl(t));
        });

      if (cleaned.length === 0) {
        setPickerError("No image results (lots of PDFs came back). Try more concrete keywords like 'smiling person outdoors' or 'calm nature'.");
        setPickerResults([]);
      } else {
        setPickerResults(cleaned.slice(0, 18));
      }
    } catch (e: any) {
      setPickerError(e?.message || "Image search failed.");
      setPickerResults([]);
    } finally {
      setPickerLoading(false);
    }
  }

  function chooseImage(img: CommonsImage) {
    // ✅ Prefer real image url; if it’s not an image (eg PDF), use thumb instead
    const u = safeUrl(img?.url || "");
    const t = safeUrl(img?.thumb || "");
    const chosen = isLikelyImageUrl(u) ? u : isLikelyImageUrl(t) ? t : "";
    setEditImageUrl(chosen);
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

  const filtered = useMemo(() => {
    const query = safeLower(q);
    const sFilter = safeLower(statusFilter);
    const pFilter = safeLower(platformFilter);

    const arr = [...(items || [])];

    arr.sort((a, b) => {
      const aT =
        new Date(a.scheduled_for || a.created_at || 0).getTime() ||
        new Date(a.created_at || 0).getTime() ||
        0;
      const bT =
        new Date(b.scheduled_for || b.created_at || 0).getTime() ||
        new Date(b.created_at || 0).getTime() ||
        0;
      if (range === "future") return aT - bT;
      return bT - aT;
    });

    return arr.filter((it) => {
      const status = safeLower(it.status || "");
      const platforms = Array.isArray(it.platforms) ? it.platforms.map((x) => safeLower(x)) : [];
      const msg = safeLower(it.message || "");
      const source = safeLower(it?.meta?.source || "");

      const hay = `${msg} ${status} ${platforms.join(" ")} ${source}`;

      if (query && !hay.includes(query)) return false;
      if (sFilter !== "all" && status !== sFilter) return false;
      if (pFilter !== "all" && !platforms.includes(pFilter)) return false;

      return true;
    });
  }, [items, q, statusFilter, platformFilter, range]);

  const statusOptions = useMemo(() => {
    const set = new Set<string>();
    for (const it of items) {
      const s = safeLower(it.status || "");
      if (s) set.add(s);
    }
    const list = Array.from(set).sort();
    return ["all", ...list];
  }, [items]);

  const emptyFiltered = !loading && !error && filtered.length === 0;

  function toggleExpanded(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function isSelected(id: string) {
    return selectedIds.has(id);
  }

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  function selectAllVisible() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const it of filtered) next.add(it.id);
      return next;
    });
  }

  async function deleteSelected() {
    if (!orgId) {
      alert("Organisation not loaded yet. Refresh the page.");
      return;
    }

    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;

    const deletable = filtered.filter((it) => selectedIds.has(it.id)).filter((it) => safeLower(it.status) !== "posted");
    const blocked = ids.length - deletable.length;

    const msg =
      blocked > 0
        ? `Delete ${deletable.length} scheduled item(s)? (${blocked} posted item(s) will be kept)`
        : `Delete ${deletable.length} scheduled item(s)? This cannot be undone.`;

    const ok = confirm(msg);
    if (!ok) return;

    setBulkBusy(true);
    setToast(`Deleting ${deletable.length}…`);

    let okCount = 0;
    let failCount = 0;

    for (const it of deletable) {
      try {
        const res = await fetch("/api/social/scheduled/delete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          body: JSON.stringify({ id: it.id, organisationId: orgId }),
        });

        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.success) {
          failCount++;
        } else {
          okCount++;
        }
      } catch {
        failCount++;
      }
    }

    setToast(failCount === 0 ? `Deleted ${okCount} ✅` : `Deleted ${okCount}, failed ${failCount}`);
    setTimeout(() => setToast(null), 1800);

    clearSelection();
    setBulkBusy(false);
    await load(orgId);
  }

  const grouped = useMemo(() => {
    if (!groupByDay) return null;

    const map = new Map<string, ScheduledRow[]>();

    for (const it of filtered) {
      const when = it.scheduled_for || it.created_at || "";
      const key = when ? isoDayKey(when) : "Unknown date";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(it);
    }

    const keys = Array.from(map.keys()).sort((a, b) => {
      if (a === "Unknown date") return 1;
      if (b === "Unknown date") return -1;
      if (range === "future") return a.localeCompare(b);
      return b.localeCompare(a);
    });

    return keys.map((k) => ({ key: k, label: dayLabelFromKey(k), items: map.get(k)! }));
  }, [filtered, groupByDay, range]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 px-4 py-10">
      <div className="mx-auto w-full max-w-6xl">
        <div className="rounded-3xl border border-slate-700 bg-slate-900/70 p-6 md:p-10 shadow-xl backdrop-blur">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <div className="text-xs text-slate-400">Root Health Ops</div>
              <h1 className="mt-1 text-2xl md:text-3xl font-semibold">{title}</h1>
              <p className="mt-2 text-sm text-slate-300 max-w-3xl">
                Filter + select + delete without drowning in a wall of posts.
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
                  <option value="future">Future (pipeline)</option>
                  <option value="past">Past</option>
                  <option value="all">All</option>
                </select>
              </label>

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

          {/* Filters bar */}
          <div className="mt-6 grid gap-3 md:grid-cols-4">
            <div className="md:col-span-2">
              <div className="text-[11px] text-slate-400 mb-1">Search</div>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                placeholder='Search message, status, platform, source… (e.g. "tiktok", "failed", "brainstorm")'
              />
            </div>

            <div>
              <div className="text-[11px] text-slate-400 mb-1">Status</div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none hover:border-slate-600"
              >
                {statusOptions.map((s) => (
                  <option key={s} value={s}>
                    {s === "all" ? "All" : s}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div className="text-[11px] text-slate-400 mb-1">Platform</div>
              <select
                value={platformFilter}
                onChange={(e) => setPlatformFilter(e.target.value)}
                className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none hover:border-slate-600"
              >
                <option value="all">All</option>
                {ALL_PLATFORMS.map((p) => (
                  <option key={p} value={p}>
                    {platformLabel(p)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Bulk actions bar */}
          <div className="mt-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div className="text-xs text-slate-400">
              Showing <span className="text-slate-200 font-semibold">{filtered.length}</span> of{" "}
              <span className="text-slate-200 font-semibold">{items.length}</span>
              {selectedIds.size > 0 ? (
                <>
                  {" "}
                  · Selected <span className="text-emerald-200 font-semibold">{selectedIds.size}</span>
                </>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setGroupByDay((v) => !v)}
                className="rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-200 hover:border-slate-600"
                title="Group posts by day"
              >
                {groupByDay ? "Grouped by day" : "Flat list"}
              </button>

              {selectedIds.size > 0 ? (
                <>
                  <button
                    type="button"
                    onClick={selectAllVisible}
                    className="rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-200 hover:border-slate-600"
                    disabled={bulkBusy}
                  >
                    Select all (visible)
                  </button>

                  <button
                    type="button"
                    onClick={clearSelection}
                    className="rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-200 hover:border-slate-600"
                    disabled={bulkBusy}
                  >
                    Clear
                  </button>

                  <button
                    type="button"
                    onClick={deleteSelected}
                    className="rounded-2xl border border-red-500/40 bg-red-950/30 px-3 py-2 text-xs text-red-100 hover:border-red-500 disabled:opacity-60"
                    disabled={bulkBusy}
                  >
                    {bulkBusy ? "Deleting…" : "Delete selected"}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={selectAllVisible}
                  className="rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-200 hover:border-slate-600"
                  disabled={filtered.length === 0}
                >
                  Select all (visible)
                </button>
              )}
            </div>
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

          {loading && (
            <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-950/60 p-4 text-slate-300">
              Loading…
            </div>
          )}

          {error && (
            <div className="mt-6 whitespace-pre-wrap rounded-2xl border border-red-500/40 bg-red-950/30 p-4 text-red-100">
              {error}
            </div>
          )}

          {emptyState && (
            <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-950/60 p-5 text-slate-300">
              Nothing to show in this view ✅
              <div className="mt-2 text-xs text-slate-500">
                Tip: switch View to <b>Past</b> or <b>All</b> to see items that have already posted.
              </div>
            </div>
          )}

          {emptyFiltered && !emptyState && (
            <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-950/60 p-5 text-slate-300">
              No results match your filters.
              <div className="mt-2 text-xs text-slate-500">Try clearing Search / Status / Platform.</div>
            </div>
          )}

          {/* List */}
          {!loading && !error && filtered.length > 0 && (
            <div className="mt-6 space-y-4">
              {(grouped ? grouped : [{ key: "all", label: "Results", items: filtered }]).map((grp) => (
                <div key={grp.key} className="space-y-3">
                  {groupByDay ? (
                    <div className="sticky top-2 z-10">
                      <div className="inline-flex items-center gap-2 rounded-2xl border border-slate-700 bg-slate-950/85 px-3 py-2 text-xs text-slate-200 backdrop-blur">
                        <span className="font-semibold">{grp.label}</span>
                        <span className="text-slate-400">({grp.items.length})</span>
                      </div>
                    </div>
                  ) : null}

                  {grp.items.map((it) => {
                    const platforms = Array.isArray(it.platforms) ? it.platforms : [];
                    const results = it?.error_info?.results;
                    const hasResults = Array.isArray(results) && results.length > 0;

                    const source = String(it?.meta?.source || "").trim();
                    const sourceBadge = source === "quick_blast" ? "Quick Blast" : source ? source : "Scheduled";

                    const media = normaliseMediaUrl(it.image_url) || null;

                    const expanded = expandedIds.has(it.id);
                    const status = safeLower(it.status || "");
                    const statusChip =
                      status === "posted"
                        ? "border-emerald-500/60 text-emerald-200 bg-emerald-500/10"
                        : status.includes("fail")
                        ? "border-red-500/50 text-red-200 bg-red-500/10"
                        : status.includes("pending") || status.includes("queue")
                        ? "border-amber-500/40 text-amber-200 bg-amber-500/10"
                        : "border-slate-700 text-slate-200 bg-slate-900/40";

                    const canDelete = status !== "posted";

                    return (
                      <div key={it.id} className="rounded-3xl border border-slate-700 bg-slate-950 p-4 md:p-5">
                        <div className="flex flex-col gap-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-start gap-3">
                              <input
                                type="checkbox"
                                checked={isSelected(it.id)}
                                onChange={() => toggleSelected(it.id)}
                                className="mt-1 h-4 w-4"
                                aria-label="Select"
                              />

                              <div>
                                <div className="text-xs text-slate-400">
                                  {fmtShort(it.scheduled_for)} · {platforms.map(platformLabel).join(", ") || "—"}
                                </div>

                                <div className="mt-2 flex flex-wrap items-center gap-2">
                                  <span className={["text-xs rounded-full border px-2 py-0.5", statusChip].join(" ")}>
                                    {it.status || "—"}
                                  </span>

                                  <span className="text-xs rounded-full border border-slate-700 bg-slate-900 px-2 py-0.5 text-slate-200">
                                    {sourceBadge}
                                  </span>

                                  {it.posted_at ? (
                                    <span className="text-xs text-slate-400">posted {fmtShort(it.posted_at)}</span>
                                  ) : null}

                                  {media ? (
                                    <span className="text-xs text-slate-400">media ✅</span>
                                  ) : (
                                    <span className="text-xs text-slate-500">media —</span>
                                  )}
                                </div>

                                <div className="mt-3 text-sm text-slate-200">
                                  {expanded ? String(it.message || "").trim() || "—" : clampOneLine(String(it.message || ""), 160)}
                                </div>

                                {expanded ? (
                                  <>
                                    {media ? (
                                      <div className="mt-2 text-xs text-slate-400 break-all">
                                        Media:{" "}
                                        <a
                                          className="text-emerald-300 hover:text-emerald-200"
                                          href={media}
                                          target="_blank"
                                          rel="noreferrer"
                                        >
                                          {media}
                                        </a>
                                      </div>
                                    ) : (
                                      <div className="mt-2 text-xs text-slate-500">Media: —</div>
                                    )}
                                  </>
                                ) : null}
                              </div>
                            </div>

                            <div className="flex flex-wrap gap-2 justify-end">
                              <button
                                className="rounded-2xl border border-slate-700 bg-slate-900/70 px-3 py-2 text-xs text-slate-200 hover:border-slate-600"
                                onClick={() => toggleExpanded(it.id)}
                              >
                                {expanded ? "Hide" : "View"}
                              </button>

                              <button
                                className="rounded-2xl border border-slate-700 bg-slate-900/70 px-3 py-2 text-xs text-slate-200 hover:border-slate-600"
                                onClick={() => openEdit(it)}
                              >
                                Edit
                              </button>

                              <button
                                className={[
                                  "rounded-2xl border px-3 py-2 text-xs",
                                  canDelete
                                    ? "border-red-500/40 bg-red-950/30 text-red-100 hover:border-red-500"
                                    : "border-slate-800 bg-slate-950/40 text-slate-600 cursor-not-allowed",
                                ].join(" ")}
                                onClick={() => (canDelete ? deletePost(it) : null)}
                                title={canDelete ? "Delete scheduled post" : "Posted items are protected"}
                              >
                                Delete
                              </button>

                              <button
                                className="rounded-2xl border border-slate-700 bg-slate-900/70 px-3 py-2 text-xs text-slate-200 hover:border-slate-600"
                                onClick={() => navigator.clipboard.writeText(it.id)}
                              >
                                Copy ID
                              </button>
                            </div>
                          </div>

                          {expanded ? (
                            <div className="mt-2 rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
                              <div className="flex items-center justify-between gap-3">
                                <div className="text-sm font-semibold text-slate-100">Dispatch results</div>
                                <div className="text-[11px] text-slate-400">Created: {fmt(it.created_at)}</div>
                              </div>

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
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}

          <div className="mt-8 text-xs text-slate-500">
            Tip: Use Search + Status + Platform. Tick a batch → Delete selected.
          </div>
        </div>
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

            {/* Picker */}
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
                          placeholder="e.g. workplace wellbeing desk"
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
                          // ✅ Use thumb for preview (always an image)
                          const preview = safeUrl(img.thumb || "") || (isLikelyImageUrl(img.url) ? safeUrl(img.url) : "");
                          return (
                            <button
                              key={`${i}-${img.title}`}
                              type="button"
                              onClick={() => chooseImage(img)}
                              className="text-left rounded-2xl border border-slate-700 bg-slate-900 hover:bg-slate-800 transition overflow-hidden"
                            >
                              <div className="h-[150px] bg-slate-950">
                                {preview ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img src={preview} alt={img.title} className="w-full h-full object-cover" />
                                ) : (
                                  <div className="h-full flex items-center justify-center text-xs text-slate-400">
                                    No preview
                                  </div>
                                )}
                              </div>
                              <div className="p-3 space-y-1">
                                <div className="text-xs font-semibold line-clamp-2">{img.title.replace(/^File:/, "")}</div>
                                <div className="text-[11px] text-slate-400">{img.licenseShortName || "Wikimedia Commons"}</div>
                                {img.attribution ? (
                                  <div className="text-[11px] text-slate-300 line-clamp-2">{stripHtml(img.attribution)}</div>
                                ) : null}
                                <div className="text-[11px] text-emerald-300 line-clamp-1">Select this</div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
