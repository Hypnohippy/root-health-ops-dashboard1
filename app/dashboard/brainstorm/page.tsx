// app/dashboard/brainstorm/page.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import ConnectedChannelsBar from "../components/ConnectedChannelsBar";

type ChannelId =
  | "linkedin"
  | "facebook"
  | "instagram"
  | "threads"
  | "reddit"
  | "tiktok";

type ChatMsg = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

type Draft = {
  title: string;
  text: string;
  cta: string;
  hashtags: string[];
  suggestedMode: "quick_blast" | "story_series";
  imageQuery: string;
};

type CommonsImage = {
  url: string;
  title: string;
  pageUrl: string;
  licenseShortName?: string;
  licenseUrl?: string;
  attribution?: string;
};

type BrainstormApiResponse = {
  success: boolean;
  assistantReply?: string;
  questions?: string[];
  angles?: string[];
  drafts?: Draft[];
  error?: string;
};

type CommonsImagesApiResponse = {
  success: boolean;
  query?: string;
  images?: CommonsImage[];
  error?: string;
};

// ✅ Write to BOTH “rootops_*” and “rh_*” to avoid future mismatches
const PREFILL_QUICKBLAST_KEYS = [
  "rootops_prefill_quickblast_v1",
  "rh_prefill_quickblast_v1",
];

const PREFILL_STORIES_KEYS = ["rootops_prefill_stories_v1", "rh_prefill_stories_v1"];

// ✅ Scheduled batch prefill
const PREFILL_SCHEDULED_KEYS = ["rootops_prefill_scheduled_v1", "rh_prefill_scheduled_v1"];

// ✅ Brainstorm “Draft Locker”
const LOCKER_KEYS = ["rootops_brainstorm_locker_v1", "rh_brainstorm_locker_v1"];

// ✅ Growth Lab → Brainstorm seed
const GROWTH_SEED_KEYS = ["rootops_growth_seed_brainstorm_v1", "rh_growth_seed_brainstorm_v1"];

type GrowthSeedPayload = {
  v: number;
  createdAt: string;
  source: "growth_lab";
  organisationId?: string | null;
  experimentId?: string | null;
  platform?: string | null;
  title?: string | null;
  hypothesis?: string | null;
  pattern_type?: string | null;
  format?: string | null;
  hook_style?: string | null;
  cta_style?: string | null;
  notes?: string | null;
  confidence?: number | null;
  brief: string;
};

function uid() {
  try {
    return crypto.randomUUID();
  } catch {
    return String(Date.now()) + "_" + Math.random().toString(16).slice(2);
  }
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

function setLocalStorageMulti(keys: string[], payload: any) {
  try {
    const raw = JSON.stringify(payload);
    for (const k of keys) {
      try {
        localStorage.setItem(k, raw);
      } catch {}
    }
  } catch {}
}

function getLocalStorageFirst(keys: string[]) {
  try {
    for (const k of keys) {
      const raw = localStorage.getItem(k);
      if (raw) return raw;
    }
  } catch {}
  return null;
}

function removeLocalStorageMulti(keys: string[]) {
  try {
    for (const k of keys) {
      try {
        localStorage.removeItem(k);
      } catch {}
    }
  } catch {}
}

type LockerPayload = {
  v: number;
  savedAt: string;

  platform: ChannelId;
  tone: string;
  wantImages: boolean;

  input: string;
  chat: ChatMsg[];

  angles: string[];
  drafts: Draft[];

  // ✅ NEW: per-draft editable final text
  draftEdits: Record<number, string>;

  draftImages: Record<number, CommonsImage | null>;
  draftImageQueryEdits: Record<number, string>;

  // ✅ Scheduled settings
  scheduledStartLocal?: string; // datetime-local string
  scheduledIntervalMinutes?: number;
};

const DEFAULT_INPUT =
  "I want to do a post on the difficulties of ADHD in working life. Can you give me some ideas?";

const DEFAULT_CHAT: ChatMsg[] = [
  {
    id: uid(),
    role: "assistant",
    content:
      "Drop your idea in plain English. I’ll riff with you first (angles + hooks), then draft posts you can push into Quick Blast or Stories.",
  },
];

function toChannelId(p?: string | null): ChannelId {
  const k = String(p || "").toLowerCase().trim();
  if (k === "facebook") return "facebook";
  if (k === "instagram") return "instagram";
  if (k === "threads") return "threads";
  if (k === "linkedin") return "linkedin";
  if (k === "tiktok") return "tiktok";
  if (k === "reddit") return "reddit";
  return "linkedin";
}

/**
 * ✅ Join the model’s structured fields.
 * NOTE: We will sanitize the result before using it.
 */
function joinDraft(d: Draft) {
  const hash = d.hashtags?.length ? `\n\n${d.hashtags.join(" ")}` : "";
  const cta = d.cta?.trim() ? `\n\n${d.cta.trim()}` : "";
  return `${(d.text || "").trim()}${cta}${hash}`.trim();
}

/**
 * ✅ Enterprise-safe “final post extractor”
 * This prevents Hook/CTA/Notes chatter from leaking into the final publish text.
 */
function extractFinalPost(raw: string) {
  let s = String(raw || "").replace(/\r\n/g, "\n").trim();
  if (!s) return "";

  // If model uses explicit labels, prefer those.
  const labelPatterns: Array<RegExp> = [
    /(^|\n)\s*(final post|final|post)\s*:\s*/i,
    /(^|\n)\s*(caption)\s*:\s*/i,
  ];

  for (const re of labelPatterns) {
    const m = re.exec(s);
    if (m) {
      const idx = (m.index || 0) + m[0].length;
      const candidate = s.slice(idx).trim();
      if (candidate) {
        s = candidate;
        break;
      }
    }
  }

  const badLine =
    /^\s*(hook|hooks|cta|ctas|notes|note|reason|why this works|image prompt|image query|hashtags?)\s*:\s*/i;

  // Remove “planning” lines (Hook:, CTA:, Notes:, etc)
  const lines = s.split("\n");
  const cleaned: string[] = [];
  for (const line of lines) {
    if (badLine.test(line)) continue;
    cleaned.push(line);
  }

  // Remove common headings blocks like "Hooks:" followed by bullets
  const joined = cleaned.join("\n").trim();

  // If they gave a “Hooks” section first, try to drop it:
  // e.g. "Hooks:\n- ...\n- ...\n\nDraft:\n..."
  const dropHooksSection = joined.replace(/^\s*hooks?\s*:\s*\n(?:\s*[-•].*\n)+\s*/i, "");

  return dropHooksSection.trim();
}

/** ✅ datetime-local helpers (same pattern as Scheduled page) */
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

function clampIntervalMinutes(n: any) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 30;
  return Math.max(1, Math.min(24 * 60, Math.round(x)));
}

export default function BrainstormPage() {
  const [platform, setPlatform] = useState<ChannelId>("linkedin");
  const [tone, setTone] = useState<string>("Professional & confident");
  const [wantImages, setWantImages] = useState<boolean>(true);

  const [input, setInput] = useState<string>(DEFAULT_INPUT);
  const [chat, setChat] = useState<ChatMsg[]>(DEFAULT_CHAT);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [angles, setAngles] = useState<string[]>([]);
  const [drafts, setDrafts] = useState<Draft[]>([]);

  // ✅ NEW: per-draft editable final text
  const [draftEdits, setDraftEdits] = useState<Record<number, string>>({});

  // chosen image per draft
  const [draftImages, setDraftImages] = useState<Record<number, CommonsImage | null>>({});
  const [draftImageQueryEdits, setDraftImageQueryEdits] = useState<Record<number, string>>({});

  // ✅ NEW: Scheduled controls (start time + spacing)
  const [scheduledStartLocal, setScheduledStartLocal] = useState<string>(() => {
    // default: now + 10 minutes (local)
    const d = new Date(Date.now() + 10 * 60 * 1000);
    return toLocalInputValue(d.toISOString());
  });
  const [scheduledIntervalMinutes, setScheduledIntervalMinutes] = useState<number>(60);

  // modal picker
  const [pickerOpenFor, setPickerOpenFor] = useState<number | null>(null);
  const [pickerQuery, setPickerQuery] = useState<string>("");
  const [pickerLoading, setPickerLoading] = useState(false);
  const [pickerError, setPickerError] = useState<string | null>(null);
  const [pickerResults, setPickerResults] = useState<CommonsImage[]>([]);

  // UX note bar
  const [toast, setToast] = useState<string | null>(null);

  // ✅ Growth seed
  const [growthSeed, setGrowthSeed] = useState<GrowthSeedPayload | null>(null);
  const [showSeedBanner, setShowSeedBanner] = useState(false);

  const bottomRef = useRef<HTMLDivElement | null>(null);

  const canSend = useMemo(() => !!input.trim() && !loading, [input, loading]);

  const scrollToBottom = () => {
    try {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    } catch {}
  };

  function hasExistingWork(snapshot?: { chat?: ChatMsg[]; input?: string; angles?: string[]; drafts?: Draft[] }) {
    const c = snapshot?.chat ?? chat;
    const i = snapshot?.input ?? input;
    const a = snapshot?.angles ?? angles;
    const d = snapshot?.drafts ?? drafts;

    const chatHasMoreThanDefault = Array.isArray(c) && c.length > DEFAULT_CHAT.length;
    const inputChanged = String(i || "").trim() && String(i || "").trim() !== String(DEFAULT_INPUT).trim();
    const hasAngles = Array.isArray(a) && a.length > 0;
    const hasDrafts = Array.isArray(d) && d.length > 0;

    return chatHasMoreThanDefault || inputChanged || hasAngles || hasDrafts;
  }

  function applyGrowthSeed(seed: GrowthSeedPayload) {
    setPlatform(toChannelId(seed.platform));
    setTone((prev) => {
      const p = String(prev || "").trim();
      if (!p) return "Calm & supportive";
      return p;
    });

    setInput(seed.brief || "");
    setError(null);

    setToast("Loaded from Growth Lab ✅");
    setTimeout(() => setToast(null), 1800);

    removeLocalStorageMulti(GROWTH_SEED_KEYS);
    setGrowthSeed(null);
    setShowSeedBanner(false);
  }

  function clearGrowthSeed() {
    removeLocalStorageMulti(GROWTH_SEED_KEYS);
    setGrowthSeed(null);
    setShowSeedBanner(false);
    setToast("Cleared Growth Lab seed ✅");
    setTimeout(() => setToast(null), 1500);
  }

  // -------------------------
  // ✅ Draft Locker: restore
  // -------------------------
  useEffect(() => {
    let restoredSnapshot: {
      platform?: ChannelId;
      tone?: string;
      wantImages?: boolean;
      input?: string;
      chat?: ChatMsg[];
      angles?: string[];
      drafts?: Draft[];
      draftEdits?: Record<number, string>;
      draftImages?: Record<number, CommonsImage | null>;
      draftImageQueryEdits?: Record<number, string>;
      scheduledStartLocal?: string;
      scheduledIntervalMinutes?: number;
    } | null = null;

    try {
      const raw = getLocalStorageFirst(LOCKER_KEYS);
      if (!raw) {
        restoredSnapshot = null;
      } else {
        const parsed = JSON.parse(raw) as LockerPayload;
        if (parsed && typeof parsed === "object" && parsed.v === 1) {
          restoredSnapshot = parsed;

          if (parsed.platform) setPlatform(parsed.platform);
          if (typeof parsed.tone === "string") setTone(parsed.tone);
          if (typeof parsed.wantImages === "boolean") setWantImages(parsed.wantImages);

          if (typeof parsed.input === "string") setInput(parsed.input);
          if (Array.isArray(parsed.chat) && parsed.chat.length > 0) setChat(parsed.chat);

          if (Array.isArray(parsed.angles)) setAngles(parsed.angles);
          if (Array.isArray(parsed.drafts)) setDrafts(parsed.drafts);

          if (parsed.draftEdits && typeof parsed.draftEdits === "object") setDraftEdits(parsed.draftEdits);

          if (parsed.draftImages && typeof parsed.draftImages === "object") setDraftImages(parsed.draftImages);
          if (parsed.draftImageQueryEdits && typeof parsed.draftImageQueryEdits === "object")
            setDraftImageQueryEdits(parsed.draftImageQueryEdits);

          if (typeof parsed.scheduledStartLocal === "string" && parsed.scheduledStartLocal) {
            setScheduledStartLocal(parsed.scheduledStartLocal);
          }
          if (typeof parsed.scheduledIntervalMinutes === "number" && Number.isFinite(parsed.scheduledIntervalMinutes)) {
            setScheduledIntervalMinutes(clampIntervalMinutes(parsed.scheduledIntervalMinutes));
          }

          setToast("Restored your Brainstorm drafts ✅");
          setTimeout(() => setToast(null), 1800);
        }
      }
    } catch {
      restoredSnapshot = null;
    }

    // ✅ After locker restore attempt, check if a Growth seed exists
    try {
      const seedRaw = getLocalStorageFirst(GROWTH_SEED_KEYS);
      if (!seedRaw) return;

      const parsed = JSON.parse(seedRaw) as GrowthSeedPayload;
      if (!parsed || typeof parsed !== "object") return;
      if (parsed.v !== 1) return;
      if (!String(parsed.brief || "").trim()) return;

      setGrowthSeed(parsed);

      const alreadyWorking = hasExistingWork({
        chat: restoredSnapshot?.chat,
        input: restoredSnapshot?.input,
        angles: restoredSnapshot?.angles,
        drafts: restoredSnapshot?.drafts,
      });

      if (alreadyWorking) {
        setShowSeedBanner(true);
      } else {
        applyGrowthSeed(parsed);
      }
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // -------------------------
  // ✅ Draft Locker: persist
  // -------------------------
  useEffect(() => {
    try {
      const payload: LockerPayload = {
        v: 1,
        savedAt: new Date().toISOString(),
        platform,
        tone,
        wantImages,
        input,
        chat,
        angles,
        drafts,
        draftEdits,
        draftImages,
        draftImageQueryEdits,
        scheduledStartLocal,
        scheduledIntervalMinutes,
      };
      setLocalStorageMulti(LOCKER_KEYS, payload);
    } catch {}
  }, [
    platform,
    tone,
    wantImages,
    input,
    chat,
    angles,
    drafts,
    draftEdits,
    draftImages,
    draftImageQueryEdits,
    scheduledStartLocal,
    scheduledIntervalMinutes,
  ]);

  const resetBrainstorm = () => {
    removeLocalStorageMulti(LOCKER_KEYS);

    setError(null);
    setLoading(false);

    setAngles([]);
    setDrafts([]);
    setDraftEdits({});

    setDraftImages({});
    setDraftImageQueryEdits({});

    setPickerOpenFor(null);
    setPickerResults([]);
    setPickerError(null);
    setPickerLoading(false);

    setInput(DEFAULT_INPUT);
    setChat(DEFAULT_CHAT);

    // reset schedule defaults
    const d = new Date(Date.now() + 10 * 60 * 1000);
    setScheduledStartLocal(toLocalInputValue(d.toISOString()));
    setScheduledIntervalMinutes(60);

    setToast("Reset ✅");
    setTimeout(() => setToast(null), 1600);
  };

  // ✅ Delete a single draft (and keep indexes clean)
  const deleteDraftAt = (idx: number) => {
    setDrafts((prev) => prev.filter((_, i) => i !== idx));

    setDraftEdits((prev) => {
      const next: Record<number, string> = {};
      const kept = Object.keys(prev)
        .map((k) => Number(k))
        .filter((n) => Number.isFinite(n))
        .sort((a, b) => a - b)
        .filter((n) => n !== idx);

      let write = 0;
      for (const oldIdx of kept) {
        next[write] = prev[oldIdx] ?? "";
        write++;
      }
      return next;
    });

    setDraftImages((prev) => {
      const next: Record<number, CommonsImage | null> = {};
      const kept = Object.keys(prev)
        .map((k) => Number(k))
        .filter((n) => Number.isFinite(n))
        .sort((a, b) => a - b)
        .filter((n) => n !== idx);

      let write = 0;
      for (const oldIdx of kept) {
        next[write] = prev[oldIdx] ?? null;
        write++;
      }
      return next;
    });

    setDraftImageQueryEdits((prev) => {
      const next: Record<number, string> = {};
      const kept = Object.keys(prev)
        .map((k) => Number(k))
        .filter((n) => Number.isFinite(n))
        .sort((a, b) => a - b)
        .filter((n) => n !== idx);

      let write = 0;
      for (const oldIdx of kept) {
        next[write] = prev[oldIdx] ?? "";
        write++;
      }
      return next;
    });

    setToast("Draft deleted ✅");
    setTimeout(() => setToast(null), 1200);
  };

  // ✅ Clear all drafts quickly
  const clearAllDrafts = () => {
    const ok = window.confirm("Clear all drafts + angles? (Chat stays.)");
    if (!ok) return;

    setAngles([]);
    setDrafts([]);
    setDraftEdits({});
    setDraftImages({});
    setDraftImageQueryEdits({});

    setToast("Cleared drafts ✅");
    setTimeout(() => setToast(null), 1200);
  };

  const openPicker = async (idx: number) => {
    if (!wantImages) return;
    setPickerOpenFor(idx);

    const q = (draftImageQueryEdits[idx] ?? drafts[idx]?.imageQuery ?? "").trim();
    setPickerQuery(q);
    setPickerResults([]);
    setPickerError(null);

    if (q) {
      await searchPicker(q);
    }
  };

  const closePicker = () => {
    setPickerOpenFor(null);
    setPickerResults([]);
    setPickerError(null);
    setPickerLoading(false);
  };

  const searchPicker = async (q: string) => {
    const query = (q || "").trim();
    if (!query) {
      setPickerError("Type a few keywords first (e.g., 'adhd workplace desk').");
      return;
    }

    setPickerLoading(true);
    setPickerError(null);
    setPickerResults([]);

    try {
      const res = await fetch(`/api/media/commons-images?q=${encodeURIComponent(query)}&limit=6`, {
        cache: "no-store",
      });
      const data: CommonsImagesApiResponse = await res.json().catch(() => null);

      if (!res.ok || !data?.success) {
        throw new Error(data?.error || `Image search failed (${res.status})`);
      }

      const images = Array.isArray(data.images) ? data.images : [];
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
  };

  const chooseImage = (idx: number, img: CommonsImage) => {
    setDraftImages((prev) => ({ ...prev, [idx]: img }));
    closePicker();
  };

  const removeImage = (idx: number) => {
    setDraftImages((prev) => ({ ...prev, [idx]: null }));
  };

  const send = async () => {
    setError(null);
    const msg = input.trim();
    if (!msg) return;

    const historyForReq = [...chat, { id: uid(), role: "user" as const, content: msg }];

    setChat(historyForReq);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/ai/brainstorm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: msg,
          platform,
          tone,
          goal: "Brainstorm + draft posts",
          history: historyForReq.slice(-10).map((m) => ({ role: m.role, content: m.content })),
        }),
      });

      const data: BrainstormApiResponse = await res.json().catch(() => null);

      if (!res.ok || !data?.success) {
        throw new Error(data?.error || `Brainstorm failed (${res.status})`);
      }

      const assistantText = String(data.assistantReply || "").trim();
      if (assistantText) {
        setChat((prev) => [...prev, { id: uid(), role: "assistant", content: assistantText }]);
      }

      setAngles(Array.isArray(data.angles) ? data.angles : []);
      const nextDrafts = Array.isArray(data.drafts) ? data.drafts : [];
      setDrafts(nextDrafts);

      // ✅ Initialize editable final text for each draft (sanitized)
      setDraftEdits((prev) => {
        const next: Record<number, string> = {};
        for (let i = 0; i < nextDrafts.length; i++) {
          const base = extractFinalPost(joinDraft(nextDrafts[i]));
          next[i] = (prev[i] ?? base ?? "").trim();
        }
        return next;
      });

      setDraftImages((prev) => {
        const next: Record<number, CommonsImage | null> = {};
        for (let i = 0; i < nextDrafts.length; i++) next[i] = prev[i] ?? null;
        return next;
      });

      setDraftImageQueryEdits(
        nextDrafts.reduce((acc, d, i) => {
          acc[i] = (draftImageQueryEdits[i] ?? d.imageQuery ?? "").trim();
          return acc;
        }, {} as Record<number, string>)
      );

      setTimeout(scrollToBottom, 50);
    } catch (e: any) {
      setError(e?.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  const buildAttribution = (img: CommonsImage | null) =>
    img
      ? {
          title: img.title,
          pageUrl: img.pageUrl,
          licenseShortName: img.licenseShortName,
          licenseUrl: img.licenseUrl,
          attribution: img.attribution,
        }
      : null;

  const getFinalTextFor = (idx: number, d: Draft) => {
    const fromEdit = String(draftEdits[idx] ?? "").trim();
    if (fromEdit) return fromEdit;
    return extractFinalPost(joinDraft(d));
  };

  // ✅ helper: include both camel + snake keys so downstream pages/APIs can’t drop media silently
  const withImageKeys = (img: CommonsImage | null) => {
    const u = String(img?.url || "").trim();
    return {
      imageUrl: u, // camelCase
      image_url: u, // snake_case (many server inserts expect this)
    };
  };

  // ✅ helper: prepare scheduled settings
  const getScheduledSettings = () => {
    const startIso = localInputToIso(scheduledStartLocal);
    const interval = clampIntervalMinutes(scheduledIntervalMinutes);
    return { scheduledStartIso: startIso, intervalMinutes: interval };
  };

  const ensureScheduledSettingsOkOrToast = () => {
    const { scheduledStartIso } = getScheduledSettings();
    if (!scheduledStartIso) {
      setToast("Pick a valid Schedule start time first 👇");
      setTimeout(() => setToast(null), 1800);
      return false;
    }
    return true;
  };

  const bumpScheduleStart = (mins: number) => {
    const base = localInputToIso(scheduledStartLocal);
    const t0 = base ? new Date(base).getTime() : Date.now();
    const d = new Date(t0 + mins * 60 * 1000);
    setScheduledStartLocal(toLocalInputValue(d.toISOString()));
  };

  const sendToQuickBlast = (idx: number, d: Draft, img: CommonsImage | null, suggestedPlatform: ChannelId) => {
    const finalText = getFinalTextFor(idx, d);

    const payload = {
      message: finalText,

      // ✅ BOTH spellings
      ...withImageKeys(img),

      suggestedPlatforms: [suggestedPlatform],
      attribution: buildAttribution(img),

      // ✅ extra compatibility (some pages look for this)
      meta: {
        attribution: buildAttribution(img),
        ...withImageKeys(img),
        source: "brainstorm",
      },
    };

    setToast("Sending to Quick Blast…");
    setLocalStorageMulti(PREFILL_QUICKBLAST_KEYS, payload);
    window.location.href = "/dashboard";
  };

  const sendToStories = (idx: number, d: Draft, img: CommonsImage | null) => {
    const finalText = getFinalTextFor(idx, d);

    const payload = {
      mode: "single",
      platform,
      tone,
      items: [
        {
          title: d.title || "Draft",
          text: finalText,

          // ✅ BOTH spellings
          ...withImageKeys(img),

          attribution: buildAttribution(img),
          meta: {
            attribution: buildAttribution(img),
            ...withImageKeys(img),
            source: "brainstorm",
          },
        },
      ],
      note: "Single draft sent from Brainstorm",
    };

    setToast("Sending to Stories…");
    setLocalStorageMulti(PREFILL_STORIES_KEYS, payload);
    window.location.href = "/dashboard/stories/new";
  };

  const sendToScheduled = (idx: number, d: Draft, img: CommonsImage | null) => {
    if (!ensureScheduledSettingsOkOrToast()) return;

    const finalText = getFinalTextFor(idx, d);
    const { scheduledStartIso } = getScheduledSettings();

    const payload = {
      mode: "single",
      platform,
      tone,

      // ✅ NEW: tells Scheduled when to set the first item
      scheduledStartIso,

      items: [
        {
          title: d.title || "Draft",
          text: finalText,

          // ✅ BOTH spellings
          ...withImageKeys(img),

          attribution: buildAttribution(img),
          meta: {
            attribution: buildAttribution(img),
            ...withImageKeys(img),
            source: "brainstorm",
          },
        },
      ],
      note: "Single draft sent from Brainstorm",
    };

    setToast("Sending to Scheduled…");
    setLocalStorageMulti(PREFILL_SCHEDULED_KEYS, payload);
    window.location.href = "/dashboard/scheduled";
  };

  const sendAllToStories = () => {
    if (!drafts.length) return;

    const items = drafts.map((d, idx) => {
      const img = draftImages[idx] ?? null;
      const finalText = getFinalTextFor(idx, d);
      return {
        title: d.title || `Draft ${idx + 1}`,
        text: finalText,

        // ✅ BOTH spellings
        ...withImageKeys(img),

        attribution: buildAttribution(img),
        meta: {
          attribution: buildAttribution(img),
          ...withImageKeys(img),
          source: "brainstorm",
        },
      };
    });

    const payload = {
      mode: "series",
      platform,
      tone,
      items,
      note: "Series sent from Brainstorm",
    };

    setToast("Sending all to Stories…");
    setLocalStorageMulti(PREFILL_STORIES_KEYS, payload);
    window.location.href = "/dashboard/stories/new";
  };

  const sendAllToScheduled = () => {
    if (!drafts.length) return;
    if (!ensureScheduledSettingsOkOrToast()) return;

    const items = drafts.map((d, idx) => {
      const img = draftImages[idx] ?? null;
      const finalText = getFinalTextFor(idx, d);
      return {
        title: d.title || `Draft ${idx + 1}`,
        text: finalText,

        // ✅ BOTH spellings
        ...withImageKeys(img),

        attribution: buildAttribution(img),
        meta: {
          attribution: buildAttribution(img),
          ...withImageKeys(img),
          source: "brainstorm",
        },
      };
    });

    const { scheduledStartIso, intervalMinutes } = getScheduledSettings();

    const payload = {
      mode: "series",
      platform,
      tone,

      // ✅ NEW: tells Scheduled how to stagger the imports
      scheduledStartIso,
      intervalMinutes,

      items,
      note: "Series sent from Brainstorm",
    };

    setToast("Sending all to Scheduled…");
    setLocalStorageMulti(PREFILL_SCHEDULED_KEYS, payload);
    window.location.href = "/dashboard/scheduled";
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 px-4 py-8 flex justify-center">
      <div className="w-full max-w-6xl space-y-6">
        <header className="space-y-3">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
            <div>
              <h1 className="text-2xl md:text-3xl font-semibold">💬 Brainstorm</h1>
              <p className="text-sm text-slate-300 max-w-3xl">
                Talk it out like a text thread. We riff first, then draft posts you can edit and push into Quick Blast /
                Stories / Scheduled.
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {growthSeed ? (
                <button
                  type="button"
                  onClick={clearGrowthSeed}
                  className="rounded-full border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-xs font-semibold text-amber-200 hover:bg-amber-500/15 hover:text-amber-100"
                  title="Clear the Growth Lab idea waiting to be loaded"
                >
                  Clear Growth Lab seed
                </button>
              ) : null}

              <button
                type="button"
                onClick={clearAllDrafts}
                disabled={!drafts.length && !angles.length}
                className="rounded-full border border-slate-600 bg-slate-950 px-4 py-2 text-xs font-semibold text-slate-100 hover:bg-white/10 disabled:opacity-60"
              >
                Clear drafts
              </button>

              <button
                type="button"
                onClick={resetBrainstorm}
                className="rounded-full border border-slate-600 bg-slate-900 px-4 py-2 text-xs font-semibold text-slate-100 hover:bg-white/10"
              >
                Reset
              </button>
            </div>
          </div>

          <ConnectedChannelsBar title="Social connections" />

          {showSeedBanner && growthSeed ? (
            <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
              <div className="font-semibold">Growth Lab idea ready ✅</div>
              <div className="mt-1 text-[12px] text-amber-200/90">
                You already have work in Brainstorm. Want to load the Growth Lab brief into the input box (without
                wiping drafts)?
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => applyGrowthSeed(growthSeed)}
                  className="rounded-full bg-amber-400 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-amber-300"
                >
                  Load it
                </button>
                <button
                  type="button"
                  onClick={clearGrowthSeed}
                  className="rounded-full border border-amber-500/40 bg-transparent px-4 py-2 text-xs text-amber-100 hover:bg-amber-500/10"
                >
                  Ignore
                </button>
              </div>
            </div>
          ) : null}

          {toast ? (
            <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-2 text-xs text-slate-300">{toast}</div>
          ) : null}
        </header>

        <section className="rounded-3xl border border-slate-700 bg-slate-900/80 p-5 space-y-4">
          <div className="grid md:grid-cols-4 gap-3">
            <div className="space-y-1">
              <label className="text-[11px] text-slate-300">Platform</label>
              <select
                className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                value={platform}
                onChange={(e) => setPlatform(e.target.value as ChannelId)}
              >
                <option value="linkedin">LinkedIn</option>
                <option value="facebook">Facebook</option>
                <option value="instagram">Instagram</option>
                <option value="threads">Threads</option>
                <option value="reddit">Reddit</option>
                <option value="tiktok">TikTok</option>
              </select>
            </div>

            <div className="space-y-1 md:col-span-2">
              <label className="text-[11px] text-slate-300">Tone</label>
              <input
                className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                value={tone}
                onChange={(e) => setTone(e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] text-slate-300">Extras</label>
              <label className="flex items-center gap-2 text-sm rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2">
                <input type="checkbox" checked={wantImages} onChange={(e) => setWantImages(e.target.checked)} />
                Image picker
              </label>
            </div>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          {/* Chat */}
          <div className="rounded-3xl border border-slate-700 bg-slate-900/80 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Conversation</h2>
              <div className="text-[11px] text-slate-400">
                Try: “Give me 10 hooks first.” / “Push back on my angle.” / “Make it kinder + simpler.”
              </div>
            </div>

            <div className="h-[460px] overflow-y-auto rounded-2xl border border-slate-700 bg-slate-950/60 p-4 space-y-3">
              {chat.map((m) => (
                <div
                  key={m.id}
                  className={[
                    "max-w-[90%] rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap",
                    m.role === "user"
                      ? "ml-auto bg-emerald-500/20 border border-emerald-500/40 text-slate-50"
                      : "mr-auto bg-slate-900 border border-slate-700 text-slate-100",
                  ].join(" ")}
                >
                  {m.content}
                </div>
              ))}
              <div ref={bottomRef} />
            </div>

            <div className="space-y-2">
              <textarea
                className="w-full min-h-[110px] rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Type your idea…"
              />

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={send}
                  disabled={!canSend}
                  className="inline-flex items-center rounded-full bg-emerald-500 px-5 py-2 text-sm font-semibold text-slate-950 disabled:opacity-60"
                >
                  {loading ? "Thinking…" : "Send"}
                </button>

                {error ? <div className="text-sm text-red-400">{error}</div> : null}
              </div>
            </div>
          </div>

          {/* Output */}
          <div className="space-y-6">
            {/* Angles */}
            <div className="rounded-3xl border border-slate-700 bg-slate-900/80 p-5 space-y-3">
              <h2 className="font-semibold">Angles</h2>
              {angles.length === 0 ? (
                <div className="text-sm text-slate-400">No angles yet — send a message.</div>
              ) : (
                <ul className="list-disc pl-5 space-y-2 text-sm text-slate-200">
                  {angles.map((a, i) => (
                    <li key={i}>{a}</li>
                  ))}
                </ul>
              )}
            </div>

            {/* Drafts */}
            <div className="rounded-3xl border border-slate-700 bg-slate-900/80 p-5 space-y-3">
              <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                <div>
                  <h2 className="font-semibold">Draft posts</h2>
                  <div className="mt-2 rounded-2xl border border-slate-700 bg-slate-950/60 p-3">
                    <div className="text-[11px] text-slate-400 mb-2">Scheduled settings (used by “Send → Scheduled”)</div>

                    <div className="grid md:grid-cols-3 gap-3">
                      <div className="space-y-1">
                        <div className="text-[11px] text-slate-400">Schedule start</div>
                        <input
                          type="datetime-local"
                          value={scheduledStartLocal}
                          onChange={(e) => setScheduledStartLocal(e.target.value)}
                          className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none"
                        />
                      </div>

                      <div className="space-y-1">
                        <div className="text-[11px] text-slate-400">Spacing (minutes)</div>
                        <input
                          type="number"
                          min={1}
                          max={1440}
                          value={scheduledIntervalMinutes}
                          onChange={(e) => setScheduledIntervalMinutes(clampIntervalMinutes(e.target.value))}
                          className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none"
                        />
                      </div>

                      <div className="space-y-1">
                        <div className="text-[11px] text-slate-400">Quick bump</div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => bumpScheduleStart(10)}
                            className="rounded-full border border-slate-600 bg-slate-950 px-3 py-2 text-xs text-slate-100 hover:bg-white/10"
                          >
                            +10m
                          </button>
                          <button
                            type="button"
                            onClick={() => bumpScheduleStart(60)}
                            className="rounded-full border border-slate-600 bg-slate-950 px-3 py-2 text-xs text-slate-100 hover:bg-white/10"
                          >
                            +1h
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const d = new Date(Date.now() + 10 * 60 * 1000);
                              setScheduledStartLocal(toLocalInputValue(d.toISOString()));
                            }}
                            className="rounded-full border border-slate-600 bg-slate-950 px-3 py-2 text-xs text-slate-100 hover:bg-white/10"
                            title="Reset to now + 10 minutes"
                          >
                            Reset
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="mt-2 text-[11px] text-slate-500">
                      “Send all → Scheduled” will stagger posts: start time, then +spacing, +spacing, etc.
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={sendAllToStories}
                    disabled={!drafts.length}
                    className="rounded-full bg-emerald-500 px-3 py-2 text-xs font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-60"
                  >
                    Send all → Stories
                  </button>

                  <button
                    type="button"
                    onClick={sendAllToScheduled}
                    disabled={!drafts.length}
                    className="rounded-full border border-slate-600 bg-slate-900 px-3 py-2 text-xs text-slate-100 hover:bg-white/10 disabled:opacity-60"
                  >
                    Send all → Scheduled
                  </button>
                </div>
              </div>

              {drafts.length === 0 ? (
                <div className="text-sm text-slate-400">No drafts yet — send a message.</div>
              ) : (
                <div className="space-y-3">
                  {drafts.map((d, idx) => {
                    const img = draftImages[idx] ?? null;
                    const query = draftImageQueryEdits[idx] ?? d.imageQuery ?? "";

                    const previewUrl = safeUrl(img?.url);
                    const filePageUrl = safeUrl(img?.pageUrl);

                    const finalText = getFinalTextFor(idx, d);

                    return (
                      <div key={idx} className="rounded-2xl border border-slate-700 bg-slate-950/60 p-4 space-y-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-sm font-semibold">{d.title || `Draft ${idx + 1}`}</div>
                            <div className="text-[11px] text-slate-400">
                              Suggested: {d.suggestedMode === "story_series" ? "Stories" : "Quick Blast"}
                            </div>
                          </div>

                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => sendToQuickBlast(idx, d, img, platform)}
                              className="rounded-full bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-emerald-400"
                            >
                              Send to Quick Blast
                            </button>

                            <button
                              type="button"
                              onClick={() => sendToStories(idx, d, img)}
                              className="rounded-full border border-slate-600 bg-slate-900 px-3 py-1.5 text-xs text-slate-100 hover:bg-white/10"
                            >
                              Send to Stories
                            </button>

                            <button
                              type="button"
                              onClick={() => sendToScheduled(idx, d, img)}
                              className="rounded-full border border-slate-600 bg-slate-950 px-3 py-1.5 text-xs text-slate-100 hover:bg-white/10"
                              title="Uses the Schedule start time above"
                            >
                              Send to Scheduled
                            </button>

                            <button
                              type="button"
                              onClick={() => deleteDraftAt(idx)}
                              className="rounded-full border border-red-500/40 bg-red-950/20 px-3 py-1.5 text-xs text-red-200 hover:bg-red-950/35"
                              title="Remove this draft from the list"
                            >
                              Delete
                            </button>
                          </div>
                        </div>

                        {/* ✅ Editable final post */}
                        <div className="space-y-1">
                          <div className="text-[11px] text-slate-400">Edit before sending (this is what will publish)</div>
                          <textarea
                            className="w-full min-h-[160px] rounded-2xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm outline-none whitespace-pre-wrap"
                            value={String(draftEdits[idx] ?? finalText)}
                            onChange={(e) => setDraftEdits((prev) => ({ ...prev, [idx]: e.target.value }))}
                          />
                        </div>

                        {/* Image chooser */}
                        <div className="rounded-2xl border border-slate-700 bg-slate-900/60 p-3 space-y-3">
                          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
                            <div className="flex-1 space-y-1">
                              <div className="text-[11px] text-slate-400">Image keywords</div>
                              <input
                                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none"
                                value={query}
                                onChange={(e) =>
                                  setDraftImageQueryEdits((prev) => ({
                                    ...prev,
                                    [idx]: e.target.value,
                                  }))
                                }
                                placeholder="e.g. adhd workplace desk"
                              />
                            </div>

                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => openPicker(idx)}
                                disabled={!wantImages}
                                className="rounded-full bg-blue-500 px-3 py-2 text-xs font-semibold text-slate-50 hover:bg-blue-400 disabled:opacity-60"
                              >
                                Choose image
                              </button>

                              {img ? (
                                <button
                                  type="button"
                                  onClick={() => removeImage(idx)}
                                  className="rounded-full border border-slate-600 bg-slate-950 px-3 py-2 text-xs text-slate-100 hover:bg-white/10"
                                >
                                  Remove
                                </button>
                              ) : null}
                            </div>
                          </div>

                          {img ? (
                            <div className="grid md:grid-cols-[140px_1fr] gap-3 items-start">
                              <div className="rounded-2xl border border-slate-700 bg-slate-950 overflow-hidden">
                                {previewUrl ? (
                                  <a href={previewUrl} target="_blank" rel="noreferrer">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                      src={previewUrl}
                                      alt={img.title || "Commons image"}
                                      className="w-full h-[140px] object-cover"
                                    />
                                  </a>
                                ) : (
                                  <div className="h-[140px] flex items-center justify-center text-xs text-slate-400">
                                    No preview
                                  </div>
                                )}
                              </div>

                              <div className="text-[12px] text-slate-200 space-y-1">
                                <div className="break-all">
                                  <span className="text-slate-400">Image URL:</span> {previewUrl}
                                </div>
                                <div className="break-all">
                                  <span className="text-slate-400">Commons page:</span>{" "}
                                  {filePageUrl ? (
                                    <a
                                      className="text-emerald-300 hover:text-emerald-200"
                                      href={filePageUrl}
                                      target="_blank"
                                      rel="noreferrer"
                                    >
                                      {filePageUrl}
                                    </a>
                                  ) : (
                                    "(missing)"
                                  )}
                                </div>
                                <div>
                                  <span className="text-slate-400">License:</span> {img.licenseShortName || "Unknown"}
                                  {img.licenseUrl ? (
                                    <>
                                      {" "}
                                      <a
                                        className="text-emerald-300 hover:text-emerald-200"
                                        href={img.licenseUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                      >
                                        (view)
                                      </a>
                                    </>
                                  ) : null}
                                </div>
                                {img.attribution ? (
                                  <div>
                                    <span className="text-slate-400">Attribution:</span> {stripHtml(img.attribution)}
                                  </div>
                                ) : null}
                              </div>
                            </div>
                          ) : (
                            <div className="text-sm text-slate-400">No image selected (optional).</div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </section>

        <footer className="text-xs text-slate-500">
          Drafts are now editable before send. We also strip “Hook/CTA/Notes” labels so the publish text stays clean.
          Scheduled now supports: start time + spacing.
        </footer>

        {/* Modal */}
        {pickerOpenFor !== null ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
            <div className="absolute inset-0 bg-black/70" onClick={closePicker} aria-hidden="true" />
            <div className="relative w-full max-w-4xl rounded-3xl border border-slate-700 bg-slate-950 text-slate-100 shadow-2xl">
              <div className="p-5 border-b border-slate-700 flex items-start justify-between gap-3">
                <div>
                  <div className="text-lg font-semibold">Pick an image</div>
                  <div className="text-[12px] text-slate-400">
                    Choose one → it will attach to this draft and travel into Quick Blast / Stories / Scheduled.
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
                      placeholder="e.g. adhd workplace focus desk"
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
                          onClick={() => chooseImage(pickerOpenFor, img)}
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
                            <div className="text-[11px] text-slate-400">{img.licenseShortName || "License unknown"}</div>
                            <div className="text-[11px] text-emerald-300 line-clamp-1">Select this</div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}

                <div className="text-[11px] text-slate-500">
                  Licensing varies. We include the Commons file page + license link (when available) for reviewer clarity.
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
