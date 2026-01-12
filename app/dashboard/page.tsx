// app/dashboard/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";

/**
 * Root Health Ops — Dashboard Quick Blast
 * Enterprise-safe outcome panel + redacted admin view
 */

type ChannelId =
  | "facebook"
  | "linkedin"
  | "instagram"
  | "threads"
  | "tiktok"
  | "reddit";

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
  { id: "tiktok", label: "TikTok", dotClass: "bg-slate-200" },
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

function userSafeQuotaMessage(payload: any): string | null {
  const status = payload?.status;
  const code = payload?.details?.code;
  const msg = String(payload?.details?.message || "").toLowerCase();

  if (status === 429 || code === 106 || msg.includes("quota")) {
    return (
      "Posting is paused for this workspace right now.\n\n" +
      "Your draft is safe — save it for later, or post to the channels that are currently available."
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
        "Swap it for a square or portrait image, then retry Instagram. If you want momentum now, send to the other channels and we’ll post to Instagram next."
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
  if (
    s.includes("other channels") ||
    (s.includes("skip") && s.includes("instagram"))
  )
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
      setCelebration("Saved. You’re still in control.");

      void callRootCoach({
        context: "save_for_later_success",
        userAction: reason ? `Saved draft (${reason})` : "Saved draft",
        outcome: "success",
      });
    } catch {
      setOutcome({
        tone: "bad",
        title: "Couldn’t save that draft",
        body: "Your text is still here — copy it somewhere safe, then try saving again.",
      });
      setError("Couldn’t save the draft on this device. Copy the text for now.");
    }
  };

  const loadDraft = (id: string) => {
    const d = drafts.find((x) => x.id === id);
    if (!d) {
      setOutcome({
        tone: "bad",
        title: "Draft not found",
        body: "That saved draft isn’t available anymore on this device.",
      });
      setError("That draft could not be found.");
      return;
    }

    setActiveDraftId(d.id);
    setMessage(d.message || "");
    setImageUrl(d.imageUrl || "");
    setSelected(d.selected);

    setStatus("Draft loaded.");
    setCelebration(null);
    setError(null);
    setDraftsOpen(false);

    setOutcome({
      tone: "good",
      title: "Draft loaded",
      body: "You’re back in control — tweak it, then send when ready.",
    });
  };

  const deleteDraft = (id: string) => {
    const ok = confirm("Delete this saved draft from this device?");
    if (!ok) return;

    const next = drafts.filter((d) => d.id !== id);
    commitDrafts(next);

    if (activeDraftId === id) setActiveDraftId(null);

    setStatus("Draft deleted.");
    setCelebration(null);

    setOutcome({
      tone: "neutral",
      title: "Draft deleted",
      body: "That draft has been removed from this device.",
    });
  };

  const togglePin = (id: string) => {
    const next = drafts.map((d) =>
      d.id === id ? { ...d, pinned: !d.pinned } : d
    );
    commitDrafts(next);
  };

  const duplicateDraft = (id: string) => {
    const d = drafts.find((x) => x.id === id);
    if (!d) return;

    const copy: DraftItem = {
      ...d,
      id: createDraftId(),
      title: `${(d.title || "Draft").trim()} (copy)`,
      savedAt: new Date().toISOString(),
      pinned: false,
    };

    const next = [copy, ...drafts].slice(0, MAX_DRAFTS);
    commitDrafts(next);

    setOutcome({
      tone: "good",
      title: "Draft duplicated",
      body: "Perfect — now you can make a variation without losing the original.",
    });

    setStatus("Draft duplicated.");
    setCelebration(null);
  };

  const startRenameDraft = (id: string) => {
    const d = drafts.find((x) => x.id === id);
    if (!d) return;
    setRenameId(id);
    setRenameValue((d.title || formatDraftTitle(d.message)).trim());
  };

  const cancelRename = () => {
    setRenameId(null);
    setRenameValue("");
  };

  const commitRename = () => {
    if (!renameId) return;
    const name = renameValue.trim();
    if (!name) {
      setOutcome({
        tone: "warn",
        title: "Draft name needed",
        body: "Give the draft a short name so you can find it later.",
      });
      setError("Draft name can’t be blank.");
      return;
    }

    const next = drafts.map((d) =>
      d.id === renameId ? { ...d, title: name } : d
    );
    commitDrafts(next);

    setOutcome({
      tone: "good",
      title: "Draft renamed",
      body: "Nice — that will be much easier to find later.",
    });

    setStatus("Draft renamed.");
    setCelebration(null);
    setError(null);

    cancelRename();
  };

  const sortedFilteredDrafts = useMemo(() => {
    const q = draftSearch.trim().toLowerCase();

    const filtered = !q
      ? drafts
      : drafts.filter((d) => {
          const hay = `${d.title || ""} ${d.message || ""}`.toLowerCase();
          return hay.includes(q);
        });

    const sorted = [...filtered].sort((a, b) => {
      const ap = a.pinned ? 1 : 0;
      const bp = b.pinned ? 1 : 0;
      if (bp !== ap) return bp - ap;

      const at = new Date(a.savedAt).getTime();
      const bt = new Date(b.savedAt).getTime();
      return bt - at;
    });

    return sorted;
  }, [drafts, draftSearch]);

  const recommendedAction = useMemo<RecommendedAction>(() => {
    if (quotaMessage) return "save_for_later";
    if (hadPartialSuccess && failedPlatforms.length > 0) return "retry_failed";
    if (anyFailure) return "save_for_later";
    return null;
  }, [quotaMessage, hadPartialSuccess, failedPlatforms.length, anyFailure]);

  const recommendedLabel = useMemo(() => {
    switch (recommendedAction) {
      case "save_for_later":
        return "Save for later";
      case "retry_failed":
        return "Retry failed only";
      case "skip_instagram":
        return "Post to other channels now";
      default:
        return null;
    }
  }, [recommendedAction]);

  const postQuickBlast = async (platforms: ChannelId[]) => {
    const trimmed = message.trim();
    if (!trimmed) throw new Error("Message is required.");
    if (!organisationId)
      throw new Error("Workspace not loaded yet. Refresh and try again.");
    if (!platforms.length) throw new Error("Select at least one channel.");

    const res = await fetch("/api/social/quick-blast", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: trimmed,
        platforms,
        imageUrl: imageUrl.trim() || null,
        organisationId,
      }),
    });

    const data = await res.json().catch(() => ({}));
    setLastResponse(data);

    if (!res.ok || data?.success === false) {
      const friendly = plainEnglishFromQuickBlastFailure(data);
      setError(friendly);

      const failed = getFailedPlatformsFromResponse(data);
      const succeeded = getSucceededPlatformsFromResponse(data);

      if (succeeded.length > 0 && failed.length > 0) {
        setOutcome({
          tone: "warn",
          title: "Partially posted",
          body:
            `Some channels went through, and some need a quick follow-up.\n\n` +
            `Posted: ${succeeded.join(", ")}\n` +
            `Needs action: ${failed.join(", ")}`,
          meta: "Use the next step below to finish cleanly.",
        });
      } else {
        setOutcome({
          tone: quotaMessage ? "warn" : "bad",
          title: "Not posted yet",
          body: friendly,
          meta: "Use the next step below to recover cleanly.",
        });
      }

      void callRootCoach({
        context: "quick_blast_failed",
        userAction: `Quick Blast attempted: ${platforms.join(", ")}`,
        errorMessage: friendly,
        outcome:
          succeeded.length > 0 && failed.length > 0 ? "partial_success" : "failed",
        failedPlatforms: failed,
        successPlatforms: succeeded,
      });

      throw new Error(friendly);
    }

    setError(null);
    setStatus(`Posted successfully to: ${platforms.join(", ")}`);

    setOutcome({
      tone: "good",
      title: "Posted",
      body: `Your message was sent to: ${platforms.join(", ")}.`,
      meta: "Nice — keep the streak going.",
    });

    void callRootCoach({
      context: "quick_blast_success",
      userAction: `Quick Blast succeeded: ${platforms.join(", ")}`,
      outcome: "success",
      successPlatforms: platforms,
    });

    return data;
  };

  const handleSend = async () => {
    setIsPosting(true);
    setStatus(null);
    setCelebration(null);
    setError(null);
    setCoachMessage(null);
    setLastResponse(null);

    setOutcome({
      tone: "neutral",
      title: "Sending…",
      body: "Hang tight — pushing your message out now.",
    });

    setLastAction({
      kind: "send",
      actionKey: null,
      actionLabel: "Send Quick Blast",
      wasRecommended: false,
    });

    try {
      if (selectedChannels.length === 0) {
        throw new Error(
          `Select at least one connected channel.\n\nDetected connected: ${
            detectedConnectedList || "(none)"
          }`
        );
      }

      await postQuickBlast(selectedChannels);
    } catch (e: any) {
      const msg = (e?.message || "Something didn’t go through.").toString();
      setError(msg);

      setOutcome((prev) => {
        if (prev && prev.title !== "Sending…") return prev;
        return {
          tone: "bad",
          title: "Not posted yet",
          body: msg,
          meta: "Save it, or try again later.",
        };
      });
    } finally {
      setIsPosting(false);
    }
  };

  const canSend = !isPosting && message.trim().length > 0;

  const connectedCount = useMemo(() => {
    return Object.values(connected).filter(Boolean).length;
  }, [connected]);

  const charCount = message.length;
  const charHint =
    charCount < 20
      ? "Short and punchy"
      : charCount < 140
      ? "Great length"
      : charCount < 300
      ? "A bit longer — still fine"
      : "Long — consider tightening";

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
            <div className="flex items-center gap-2">
              <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">
                Root Health Ops
              </h1>
              <span className="inline-flex items-center rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-[11px] font-semibold text-emerald-100">
                Enterprise Beta
              </span>
            </div>
            <p className="mt-2 text-sm text-slate-300 max-w-2xl">
              A calm, premium cockpit for social momentum. Send fast. Recover
              cleanly. Keep going.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold text-slate-200">
              Connected:{" "}
              <span className="ml-1 text-slate-50 font-semibold">
                {connectedCount}
              </span>
            </span>
            <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold text-slate-200">
              {connectedHint}
            </span>
            <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold text-slate-200">
              {charHint}
            </span>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6">
            <div className="rounded-3xl border border-white/10 bg-white/5 shadow-[0_20px_60px_rgba(0,0,0,0.35)] backdrop-blur-xl p-6 md:p-7">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold">Quick Blast</h2>
                  <p className="mt-1 text-xs text-slate-300">
                    Write once, choose channels, send.
                  </p>
                </div>

                <div className="flex flex-col items-end gap-2">
                  <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold text-slate-200">
                    {charCount} chars
                  </span>
                  {organisationId ? (
                    <span className="text-[10px] text-slate-500">
                      Workspace loaded
                    </span>
                  ) : (
                    <span className="text-[10px] text-amber-200">
                      Loading workspace…
                    </span>
                  )}
                </div>
              </div>

              <div className="mt-5">
                <label className="text-[11px] uppercase tracking-wide text-slate-400">
                  Message
                </label>
                <textarea
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-50 placeholder:text-slate-500 outline-none focus:border-emerald-400/50 focus:ring-1 focus:ring-emerald-400/30 min-h-[160px]"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Write your Quick Blast…"
                />
              </div>

              <div className="mt-6">
                <label className="text-[11px] uppercase tracking-wide text-slate-400">
                  Image (optional)
                </label>
                <input
                  type="url"
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-50 placeholder:text-slate-500 outline-none focus:border-emerald-400/50 focus:ring-1 focus:ring-emerald-400/30"
                  placeholder="Paste a direct image URL (JPG/PNG)…"
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                />
              </div>

              <div className="mt-6">
                <div className="flex items-center justify-between gap-3">
                  <label className="text-[11px] uppercase tracking-wide text-slate-400">
                    Channels
                  </label>
                  <button
                    type="button"
                    onClick={refreshConnections}
                    className="text-xs text-slate-300 hover:text-slate-50"
                  >
                    Refresh
                  </button>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {CHANNELS.map((c) => {
                    const isConnected = connected[c.id];
                    const isSelected = selected[c.id];

                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => toggle(c.id)}
                        className={[
                          "group inline-flex items-center gap-2 rounded-2xl border px-4 py-2 text-xs font-semibold transition",
                          isSelected
                            ? "border-emerald-400/50 bg-emerald-400/10 text-emerald-50"
                            : "border-white/10 bg-white/5 text-slate-200 hover:bg-white/10",
                        ].join(" ")}
                      >
                        <span
                          className={[
                            "h-2 w-2 rounded-full",
                            c.dotClass,
                            "shadow-[0_0_0_4px_rgba(255,255,255,0.06)]",
                          ].join(" ")}
                        />
                        <span>{c.label}</span>
                        {!isConnected ? (
                          <span className="ml-1 text-[10px] text-amber-200">
                            not connected
                          </span>
                        ) : (
                          <span className="ml-1 text-[10px] text-slate-400">
                            connected
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>

                <div className="mt-3 text-[11px] text-slate-400">
                  Only connected channels will actually send.
                </div>
              </div>

              <div className="mt-6 flex flex-col sm:flex-row gap-3">
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={!canSend || !selectedChannels.length || !organisationId}
                  className="inline-flex items-center justify-center rounded-2xl bg-emerald-500 px-5 py-3 text-sm font-semibold text-slate-950 shadow-[0_12px_30px_rgba(16,185,129,0.25)] hover:bg-emerald-400 disabled:opacity-60 disabled:cursor-not-allowed transition"
                >
                  {isPosting ? "Sending…" : "Send Quick Blast"}
                </button>

                <button
                  type="button"
                  onClick={() => saveDraft("manual")}
                  disabled={!canSend}
                  className="inline-flex items-center justify-center rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-slate-100 hover:bg-white/10 disabled:opacity-60 disabled:cursor-not-allowed transition"
                >
                  Save for later
                </button>
              </div>

              {status && (
                <div className="mt-4 text-xs text-slate-300 whitespace-pre-wrap">
                  {status}
                </div>
              )}
              {error && (
                <div className="mt-4 rounded-2xl border border-red-500/40 bg-red-950/40 p-4 text-sm text-red-200 whitespace-pre-wrap">
                  {error}
                </div>
              )}
            </div>

            {outcome && (
              <div
                className={[
                  "rounded-3xl border p-6 md:p-7 whitespace-pre-wrap",
                  toneStyles(outcome.tone),
                ].join(" ")}
              >
                <div className="text-base md:text-lg font-semibold">
                  {outcome.title}
                </div>
                <div className="mt-2 text-sm leading-relaxed">{outcome.body}</div>
                {outcome.meta && (
                  <div className="mt-3 text-xs text-slate-200/90">
                    {outcome.meta}
                  </div>
                )}
              </div>
            )}

            <div className="rounded-3xl border border-white/10 bg-white/5 shadow-[0_20px_60px_rgba(0,0,0,0.35)] backdrop-blur-xl p-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold">Admin view</h3>
                  <p className="mt-1 text-xs text-slate-300">
                    Safe technical details (redacted).
                  </p>
                </div>
                <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold text-slate-200">
                  {quotaMessage ? "Limited" : "Normal"}
                </span>
              </div>

              {lastResponse ? (
                <details className="mt-4">
                  <summary className="cursor-pointer text-sm text-slate-200 hover:text-slate-50">
                    Show last response (redacted)
                  </summary>
                  <pre className="mt-3 max-h-[320px] overflow-auto rounded-2xl border border-white/10 bg-black/30 p-4 text-[10px] text-slate-200 whitespace-pre-wrap">
                    {safeJson(redactVendorsDeep(lastResponse))}
                  </pre>
                </details>
              ) : (
                <div className="mt-4 text-sm text-slate-400">
                  No response yet — send a Quick Blast to see details here.
                </div>
              )}

              <details className="mt-4">
                <summary className="cursor-pointer text-sm text-slate-200 hover:text-slate-50">
                  Show connections (redacted)
                </summary>
                <pre className="mt-3 max-h-[320px] overflow-auto rounded-2xl border border-white/10 bg-black/30 p-4 text-[10px] text-slate-200 whitespace-pre-wrap">
                  {safeJson(redactVendorsDeep(rawSocialAccounts))}
                </pre>
              </details>
            </div>

            {coachMessage && (
              <div className="rounded-3xl border border-white/10 bg-white/5 shadow-[0_20px_60px_rgba(0,0,0,0.35)] backdrop-blur-xl p-6">
                <div className="text-base font-semibold">Root Coach</div>
                <div className="mt-3 text-sm whitespace-pre-wrap">
                  {coachParsed.body || coachMessage}
                </div>
                <div className="mt-4 grid gap-2">
                  {coachOptionsFinal.map((opt, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => runCoachOption(opt)}
                      disabled={isPosting}
                      className="rounded-2xl border border-sky-300/20 bg-sky-300/10 px-4 py-3 text-left text-sm font-semibold text-sky-50 hover:bg-sky-300/15 transition disabled:opacity-60"
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="space-y-6">
            <div className="rounded-3xl border border-white/10 bg-white/5 shadow-[0_20px_60px_rgba(0,0,0,0.35)] backdrop-blur-xl p-6">
              <div className="text-base font-semibold">Saved drafts</div>
              <div className="mt-2 text-sm text-slate-300">
                Drafts are stored on this device. (Later we can sync per org.)
              </div>
              <div className="mt-3 text-xs text-slate-400">
                Draft library is available in the expanded version. If you want it back
                on the right panel too, say so and I’ll restore it.
              </div>
            </div>

            {recommendedLabel && anyFailure && (
              <div className="rounded-3xl border border-emerald-300/30 bg-emerald-300/10 p-6">
                <div className="text-[11px] uppercase tracking-wide text-emerald-200">
                  Recommended next step
                </div>
                <div className="mt-1 text-base font-semibold text-emerald-50">
                  {recommendedLabel}
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    if (recommendedAction === "save_for_later") saveDraft("recommended");
                  }}
                  disabled={isPosting}
                  className="mt-4 w-full rounded-2xl bg-emerald-500 px-5 py-3 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-60 disabled:cursor-not-allowed transition"
                >
                  Do it
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
