// app/dashboard/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";

/**
 * Root Health Ops — Dashboard Quick Blast
 * Phase 3 – Quota-aware enterprise UX polish:
 * - When quota hit (429 / code 106), do NOT suggest posting to other channels
 * - Clear “Monthly quota reached” messaging
 * - Disable Send while quota is active (Save remains available)
 */

type ChannelId =
  | "facebook"
  | "linkedin"
  | "instagram"
  | "threads"
  | "tiktok"
  | "reddit";

// ✅ IMPORTANT: keep this EXACT union (includes skip_instagram)
type RecommendedAction =
  | "retry_failed"
  | "retry_instagram"
  | "skip_instagram"
  | "save_for_later"
  | null;

type DraftItem = {
  id: string;
  title?: string;
  message: string;
  imageUrl: string;
  selected: Record<ChannelId, boolean>;
  savedAt: string;
  pinned?: boolean;
};

type RecoveryMeta = {
  kind: "self_heal" | "send";
  actionKey: RecommendedAction;
  actionLabel: string;
  wasRecommended: boolean;
} | null;

type CoachOption = {
  label: string;
  action: RecommendedAction | "refresh_connections";
};

type OutcomeTone = "good" | "warn" | "bad" | "neutral";

type OutcomeCard = {
  tone: OutcomeTone;
  title: string;
  body: string;
  meta?: string;
};

const DRAFTS_KEY = "rh_ops_quick_blast_drafts_v2";
const LEGACY_DRAFT_KEY = "rh_ops_quick_blast_draft_v1";
const MAX_DRAFTS = 25;

const CHANNELS: { id: ChannelId; label: string; dotClass: string }[] = [
  { id: "facebook", label: "Facebook Page", dotClass: "bg-[#1877F2]" },
  { id: "linkedin", label: "LinkedIn", dotClass: "bg-sky-500" },
  { id: "instagram", label: "Instagram", dotClass: "bg-pink-500" },
  { id: "threads", label: "Threads", dotClass: "bg-white" },
];

const DEFAULT_SELECTED: Record<ChannelId, boolean> = {
  facebook: true,
  linkedin: false,
  instagram: false,
  threads: false,
  tiktok: false,
  reddit: false,
};

function safeJson(v: any) {
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

function redactVendorsDeep(input: any) {
  const vendorRegex = /ayrshare/gi;
  const makeRegex = /make(\.com)?/gi;
  const pricingRegex = /https?:\/\/[^\s"]*pricing[^\s"]*/gi;
  const docsRegex = /https?:\/\/[^\s"]*docs[^\s"]*/gi;

  const walk = (v: any): any => {
    if (v == null) return v;

    if (typeof v === "string") {
      return v
        .replace(vendorRegex, "Social posting service")
        .replace(makeRegex, "Social posting service")
        .replace(pricingRegex, "[link hidden]")
        .replace(docsRegex, "[link hidden]");
    }

    if (Array.isArray(v)) return v.map(walk);

    if (typeof v === "object") {
      const out: any = {};
      for (const [k, val] of Object.entries(v)) {
        const safeKey = String(k).replace(vendorRegex, "service");
        out[safeKey] = walk(val);
      }
      return out;
    }

    return v;
  };

  return walk(input);
}

function detectConnectedPlatforms(payload: any) {
  const connected: Record<ChannelId, boolean> = {
    facebook: false,
    linkedin: false,
    instagram: false,
    threads: false,
    tiktok: false,
    reddit: false,
  };

  const rows = Array.isArray(payload?.socialAccounts)
    ? payload.socialAccounts
    : Array.isArray(payload?.data)
    ? payload.data
    : Array.isArray(payload)
    ? payload
    : [];

  for (const r of rows) {
    if (!r || typeof r !== "object") continue;
    if ((r as any).is_active === false) continue;

    const p = String((r as any).platform || "").toLowerCase();
    if (p === "facebook") connected.facebook = true;
    if (p === "linkedin") connected.linkedin = true;
    if (p === "instagram") connected.instagram = true;
    if (p === "threads") connected.threads = true;
    if (p === "tiktok") connected.tiktok = true;
    if (p === "reddit") connected.reddit = true;
  }

  return connected;
}

function loadImageDimensions(
  url: string
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () =>
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error("Could not load image from that URL."));
    img.crossOrigin = "anonymous";
    img.src = url;
  });
}

/**
 * ✅ QUOTA DETECTION (429 / code 106)
 * IMPORTANT: Quota blocks ALL posting, so do NOT suggest “try other channels”.
 */
function userSafeQuotaMessage(payload: any): string | null {
  const status = payload?.status;
  const code = payload?.details?.code;
  const msg = String(payload?.details?.message || "").toLowerCase();

  if (status === 429 || code === 106 || msg.includes("quota")) {
    return (
      "Posting is paused for this workspace right now.\n\n" +
      "It looks like you’ve hit your monthly posting quota.\n\n" +
      "Your draft is safe — save it for later, and you can send as soon as quota resets or your plan changes."
    );
  }
  return null;
}

function getFailedPlatformsFromResponse(payload: any): ChannelId[] {
  const errs = payload?.details?.errors;
  if (!Array.isArray(errs)) return [];
  const failed = new Set<ChannelId>();

  for (const e of errs) {
    const p = String(e?.platform || "").toLowerCase().trim();
    if (p === "facebook") failed.add("facebook");
    if (p === "linkedin") failed.add("linkedin");
    if (p === "instagram") failed.add("instagram");
    if (p === "threads") failed.add("threads");
    if (p === "tiktok") failed.add("tiktok");
    if (p === "reddit") failed.add("reddit");
  }

  return Array.from(failed);
}

function getSucceededPlatformsFromResponse(payload: any): ChannelId[] {
  const postIds = payload?.result?.postIds || payload?.details?.postIds;
  if (!Array.isArray(postIds)) return [];
  const ok = new Set<ChannelId>();

  for (const p of postIds) {
    const platform = String(p?.platform || "").toLowerCase().trim();
    if (platform === "facebook") ok.add("facebook");
    if (platform === "linkedin") ok.add("linkedin");
    if (platform === "instagram") ok.add("instagram");
    if (platform === "threads") ok.add("threads");
    if (platform === "tiktok") ok.add("tiktok");
    if (platform === "reddit") ok.add("reddit");
  }

  return Array.from(ok);
}

function plainEnglishFromQuickBlastFailure(payload: any): string {
  const quota = userSafeQuotaMessage(payload);
  if (quota) return quota;

  const rawBase = String(payload?.error || payload?.message || "").trim();
  const baseLower = rawBase.toLowerCase();

  const safeBase =
    !rawBase
      ? "Something didn’t go through."
      : baseLower.includes("ayrshare") || baseLower.includes("post failed")
      ? "One or more channels couldn’t be posted right now."
      : rawBase;

  const errs = payload?.details?.errors;

  if (Array.isArray(errs) && errs.length > 0) {
    const ig = errs.find(
      (e: any) => String(e?.platform || "").toLowerCase() === "instagram"
    );
    const e = ig || errs[0];

    const platform = String(e?.platform || "a channel");
    const code = e?.code;
    const msg = String(e?.message || "").trim();

    if (
      platform.toLowerCase() === "instagram" &&
      (code === 140 ||
        msg.toLowerCase().includes("aspect ratio") ||
        msg.toLowerCase().includes("image") ||
        msg.toLowerCase().includes("shape") ||
        msg.toLowerCase().includes("format"))
    ) {
      return (
        "You’re all good — nothing is broken.\n\n" +
        "This image is just outside Instagram’s preferred shape.\n\n" +
        "Swap it for a square or portrait image, then retry Instagram."
      );
    }

    if (msg.toLowerCase().includes("choose at least one platform")) {
      return (
        "No worries — this one is quick.\n\n" +
        "It looks like no channels were selected for that send.\n\n" +
        "Select one or more channels and try again."
      );
    }

    return `${safeBase}\n\n${platform} needs a small tweak: ${
      msg || "Please try again."
    }`;
  }

  return safeBase;
}

function deriveActionFromText(text: string): CoachOption["action"] {
  const s = (text || "").toLowerCase();

  if (s.includes("save")) return "save_for_later";
  if (s.includes("refresh")) return "refresh_connections";
  if (s.includes("retry") && s.includes("failed")) return "retry_failed";
  if (s.includes("retry") && s.includes("instagram")) return "retry_instagram";
  if (s.includes("other channels") || (s.includes("skip") && s.includes("instagram")))
    return "skip_instagram";

  return "save_for_later";
}

function parseCoachMessage(input: string | null): {
  body: string;
  options: CoachOption[];
} {
  const raw = (input || "").trim();
  if (!raw) return { body: "", options: [] };

  const lines = raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const options: CoachOption[] = [];
  const bodyLines: string[] = [];

  for (const line of lines) {
    const lower = line.toLowerCase();

    if (lower.startsWith("option a:")) {
      const label = line.slice("Option A:".length).trim() || "Do this";
      options.push({ label, action: deriveActionFromText(label) });
      continue;
    }

    if (lower.startsWith("option b:")) {
      const label = line.slice("Option B:".length).trim() || "Or this";
      options.push({ label, action: deriveActionFromText(label) });
      continue;
    }

    bodyLines.push(line);
  }

  return { body: bodyLines.join("\n"), options: options.slice(0, 2) };
}

function createDraftId() {
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function formatDraftTitle(msg: string) {
  const t = (msg || "").trim().replace(/\s+/g, " ");
  if (!t) return "Untitled draft";
  return t.length > 56 ? t.slice(0, 56) + "…" : t;
}

function niceDate(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function normalizeDraft(d: any): DraftItem | null {
  try {
    if (!d || typeof d !== "object") return null;

    const id = String(d.id || "").trim();
    if (!id) return null;

    const savedAt = String(d.savedAt || new Date().toISOString());
    const message = String(d.message || "");
    const imageUrl = String(d.imageUrl || "");

    const selected: Record<ChannelId, boolean> = {
      ...DEFAULT_SELECTED,
      ...(typeof d.selected === "object" && d.selected ? d.selected : {}),
    };

    const title =
      typeof d.title === "string" && d.title.trim()
        ? d.title.trim()
        : formatDraftTitle(message);

    const pinned = Boolean(d.pinned);

    return { id, title, message, imageUrl, selected, savedAt, pinned };
  } catch {
    return null;
  }
}

function toneStyles(tone: OutcomeTone) {
  switch (tone) {
    case "good":
      return "border-emerald-300/20 bg-emerald-300/10 text-emerald-50";
    case "warn":
      return "border-amber-300/20 bg-amber-300/10 text-amber-50";
    case "bad":
      return "border-red-300/20 bg-red-300/10 text-red-100";
    default:
      return "border-white/10 bg-white/5 text-slate-100";
  }
}

export default function DashboardHomePage() {
  const [message, setMessage] = useState(
    "Quick check-in from Root Health Ops Dashboard ✅"
  );
  const [imageUrl, setImageUrl] = useState("");

  const [isPosting, setIsPosting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [celebration, setCelebration] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [outcome, setOutcome] = useState<OutcomeCard | null>(null);

  const [rawSocialAccounts, setRawSocialAccounts] = useState<any>(null);
  const [connectedHint, setConnectedHint] = useState<string>("Loading…");
  const [organisationId, setOrganisationId] = useState<string | null>(null);

  const [connected, setConnected] = useState<Record<ChannelId, boolean>>({
    facebook: false,
    linkedin: false,
    instagram: false,
    threads: false,
    tiktok: false,
    reddit: false,
  });

  const [selected, setSelected] = useState<Record<ChannelId, boolean>>({
    ...DEFAULT_SELECTED,
  });

  const [lastResponse, setLastResponse] = useState<any>(null);

  const [coachMessage, setCoachMessage] = useState<string | null>(null);

  const [drafts, setDrafts] = useState<DraftItem[]>([]);
  const [draftsOpen, setDraftsOpen] = useState(false);

  const [draftSearch, setDraftSearch] = useState("");
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null);

  const [lastAction, setLastAction] = useState<RecoveryMeta>(null);

  const detectedConnectedList = useMemo(() => {
    return Object.entries(connected)
      .filter(([, v]) => v)
      .map(([k]) => k)
      .join(", ");
  }, [connected]);

  const selectedChannels = useMemo(() => {
    return (Object.keys(selected) as ChannelId[]).filter(
      (c) => selected[c] && connected[c]
    );
  }, [selected, connected]);

  const failedPlatforms = useMemo(
    () => getFailedPlatformsFromResponse(lastResponse),
    [lastResponse]
  );
  const succeededPlatforms = useMemo(
    () => getSucceededPlatformsFromResponse(lastResponse),
    [lastResponse]
  );

  const anyFailure = Boolean(lastResponse && lastResponse?.success === false);
  const hadPartialSuccess =
    succeededPlatforms.length > 0 && failedPlatforms.length > 0;

  const quotaMessage = useMemo(
    () => userSafeQuotaMessage(lastResponse),
    [lastResponse]
  );

  const quotaLocked = Boolean(quotaMessage);

  useEffect(() => {
    if (!celebration) return;
    const t = setTimeout(() => setCelebration(null), 6500);
    return () => clearTimeout(t);
  }, [celebration]);

  const refreshConnections = async () => {
    try {
      const res = await fetch("/api/social-accounts", { method: "GET" });
      const data = await res.json().catch(() => null);

      setRawSocialAccounts(data);
      setConnectedHint(res.ok ? "Loaded from connections" : `HTTP ${res.status}`);

      setOrganisationId(
        typeof data?.organisationId === "string" ? data.organisationId : null
      );

      setConnected(detectConnectedPlatforms(data));
    } catch (e: any) {
      setConnectedHint(e?.message || "Failed to load connections");
    }
  };

  const saveDraftsToStorage = (next: DraftItem[]) => {
    try {
      localStorage.setItem(DRAFTS_KEY, JSON.stringify(next));
    } catch {}
  };

  const commitDrafts = (next: DraftItem[]) => {
    setDrafts(next);
    saveDraftsToStorage(next);
  };

  const loadDraftsFromStorage = () => {
    try {
      const raw = localStorage.getItem(DRAFTS_KEY);
      if (!raw) {
        setDrafts([]);
        return;
      }
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        setDrafts([]);
        return;
      }
      const normalized = parsed
        .map(normalizeDraft)
        .filter(Boolean) as DraftItem[];

      setDrafts(normalized);
      saveDraftsToStorage(normalized);
    } catch {
      setDrafts([]);
    }
  };

  const migrateLegacyDraftIfNeeded = () => {
    try {
      const legacy = localStorage.getItem(LEGACY_DRAFT_KEY);
      if (!legacy) return;

      const existing = localStorage.getItem(DRAFTS_KEY);
      if (existing) {
        localStorage.removeItem(LEGACY_DRAFT_KEY);
        return;
      }

      const d = JSON.parse(legacy);
      if (!d?.message) {
        localStorage.removeItem(LEGACY_DRAFT_KEY);
        return;
      }

      const migrated = normalizeDraft({
        id: createDraftId(),
        title: formatDraftTitle(String(d.message || "")),
        message: String(d.message || ""),
        imageUrl: String(d.imageUrl || ""),
        selected: d.selected || { ...DEFAULT_SELECTED },
        savedAt: String(d.savedAt || new Date().toISOString()),
        pinned: false,
      });

      const next = migrated ? [migrated] : [];
      localStorage.setItem(DRAFTS_KEY, JSON.stringify(next));
      localStorage.removeItem(LEGACY_DRAFT_KEY);
    } catch {}
  };

  useEffect(() => {
    void refreshConnections();
    migrateLegacyDraftIfNeeded();
    loadDraftsFromStorage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = (c: ChannelId) => {
    setSelected((s) => ({ ...s, [c]: !s[c] }));
  };

  const callRootCoach = async (payload: {
    context: string;
    userAction: string;
    errorMessage?: string;
    outcome?: "success" | "failed" | "partial_success";
    failedPlatforms?: ChannelId[];
    successPlatforms?: ChannelId[];
  }) => {
    try {
      const res = await fetch("/api/ai/root-coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => null);
      if (data?.coachMessage) setCoachMessage(String(data.coachMessage));
    } catch {}
  };

  const saveDraft = (reason?: string) => {
    try {
      const item: DraftItem = {
        id: createDraftId(),
        title: formatDraftTitle(message),
        message,
        imageUrl,
        selected,
        savedAt: new Date().toISOString(),
        pinned: false,
      };

      const next = [item, ...drafts].slice(0, MAX_DRAFTS);
      commitDrafts(next);

      setDraftsOpen(true);

      setOutcome({
        tone: "good",
        title: "Saved for later",
        body:
          "Your draft is safely stored on this device. You can load it anytime and send when you’re ready.",
        meta: "Tip: pin your best templates to keep them at the top.",
      });

      setLastResponse(null);
      setError(null);
      setStatus("Saved for later — your draft is safe.");
      setCelebration("S
