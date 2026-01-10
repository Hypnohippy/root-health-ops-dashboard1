// app/dashboard/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";

/**
 * Root Health Ops — Dashboard Quick Blast
 * Phase 1: ✅ complete
 * Phase 2 Step 1: Premium UI + clarity (glass cards, improved layout)
 *
 * IMPORTANT:
 * - No engine changes
 * - No API changes
 * - No re-architecture
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
  message: string;
  imageUrl: string;
  selected: Record<ChannelId, boolean>;
  savedAt: string; // ISO
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

const DRAFTS_KEY = "rh_ops_quick_blast_drafts_v2";
const LEGACY_DRAFT_KEY = "rh_ops_quick_blast_draft_v1";
const MAX_DRAFTS = 25;

const CHANNELS: { id: ChannelId; label: string; dotClass: string }[] = [
  { id: "facebook", label: "Facebook Page", dotClass: "bg-[#1877F2]" },
  { id: "linkedin", label: "LinkedIn", dotClass: "bg-sky-500" },
  { id: "instagram", label: "Instagram", dotClass: "bg-pink-500" },
  { id: "threads", label: "Threads", dotClass: "bg-white" },
];

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

/* ----------------------------- */
/* Component */
/* ----------------------------- */

export default function DashboardHomePage() {
  // Composer
  const [message, setMessage] = useState(
    "Quick check-in from Root Health Ops Dashboard ✅"
  );
  const [imageUrl, setImageUrl] = useState("");

  // State
  const [isPosting, setIsPosting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [celebration, setCelebration] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Connections
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

  // Channel selection
  const [selected, setSelected] = useState<Record<ChannelId, boolean>>({
    facebook: true,
    linkedin: false,
    instagram: false,
    threads: false,
    tiktok: false,
    reddit: false,
  });

  // Last API response
  const [lastResponse, setLastResponse] = useState<any>(null);

  // Root Coach
  const [coachMessage, setCoachMessage] = useState<string | null>(null);

  // Drafts library (local device)
  const [drafts, setDrafts] = useState<DraftItem[]>([]);
  const [draftsOpen, setDraftsOpen] = useState(false);

  // Last action
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
      setConnectedHint(
        res.ok ? "Loaded from connections" : `HTTP ${res.status}`
      );
      setOrganisationId(
        typeof data?.organisationId === "string" ? data.organisationId : null
      );
      setConnected(detectConnectedPlatforms(data));
    } catch (e: any) {
      setConnectedHint(e?.message || "Failed to load connections");
    }
  };

  const loadDraftsFromStorage = () => {
    try {
      const raw = localStorage.getItem(DRAFTS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setDrafts(parsed);
          return;
        }
      }
      setDrafts([]);
    } catch {
      setDrafts([]);
    }
  };

  const saveDraftsToStorage = (next: DraftItem[]) => {
    try {
      localStorage.setItem(DRAFTS_KEY, JSON.stringify(next));
    } catch {}
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

      const migrated: DraftItem = {
        id: createDraftId(),
        message: String(d.message || ""),
        imageUrl: String(d.imageUrl || ""),
        selected: (d.selected ||
          ({
            facebook: true,
            linkedin: false,
            instagram: false,
            threads: false,
            tiktok: false,
            reddit: false,
          } as any)) as Record<ChannelId, boolean>,
        savedAt: String(d.savedAt || new Date().toISOString()),
      };

      localStorage.setItem(DRAFTS_KEY, JSON.stringify([migrated]));
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

  /* ----------------------------- */
  /* Drafts */
  /* ----------------------------- */

  const saveDraft = (reason?: string) => {
    try {
      const item: DraftItem = {
        id: createDraftId(),
        message,
        imageUrl,
        selected,
        savedAt: new Date().toISOString(),
      };

      const next = [item, ...drafts].slice(0, MAX_DRAFTS);
      setDrafts(next);
      saveDraftsToStorage(next);

      setDraftsOpen(true);
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
      setError("Couldn’t save the draft on this device. Copy the text for now.");
    }
  };

  const loadDraft = (id: string) => {
    const d = drafts.find((x) => x.id === id);
    if (!d) {
      setError("That draft could not be found.");
      return;
    }

    setMessage(d.message || "");
    setImageUrl(d.imageUrl || "");
    setSelected(d.selected);

    setStatus("Draft loaded.");
    setCelebration(null);
    setError(null);
    setDraftsOpen(false);
  };

  const deleteDraft = (id: string) => {
    const ok = confirm("Delete this saved draft from this device?");
    if (!ok) return;

    const next = drafts.filter((d) => d.id !== id);
    setDrafts(next);
    saveDraftsToStorage(next);
    setStatus("Draft deleted.");
    setCelebration(null);
  };

  const clearAllDrafts = () => {
    const ok = confirm("Clear ALL saved drafts on this device?");
    if (!ok) return;

    setDrafts([]);
    saveDraftsToStorage([]);
    setStatus("All drafts cleared.");
    setCelebration(null);
  };

  const loadMostRecentDraft = () => {
    if (!drafts.length) {
      setError("No saved drafts yet.");
      return;
    }
    loadDraft(drafts[0].id);
  };

  /* ----------------------------- */
  /* Recommended action */
  /* ----------------------------- */

  const isInstagramImageProblem = useMemo(() => {
    const s = String(error || "").toLowerCase();
    return (
      s.includes("instagram") &&
      (s.includes("image") ||
        s.includes("shape") ||
        s.includes("format") ||
        s.includes("preferred") ||
        s.includes("aspect ratio"))
    );
  }, [error]);

  const recommendedAction: RecommendedAction = useMemo(() => {
    if (quotaMessage) return "save_for_later";
    if (isInstagramImageProblem) return "retry_instagram";
    if (hadPartialSuccess && failedPlatforms.length > 0) return "retry_failed";
    if (anyFailure) return "save_for_later";
    return null;
  }, [
    quotaMessage,
    isInstagramImageProblem,
    hadPartialSuccess,
    failedPlatforms.length,
    anyFailure,
  ]);

  const recommendedLabel = useMemo(() => {
    switch (recommendedAction as any) {
      case "save_for_later":
        return "Save for later";
      case "retry_instagram":
        return "Retry Instagram after swapping the image";
      case "retry_failed":
        return "Retry failed only";
      case "skip_instagram":
        return "Post to other channels now";
      default:
        return null;
    }
  }, [recommendedAction]);

  /* ----------------------------- */
  /* Posting logic */
  /* ----------------------------- */

  const instagramImageGuard = async (platforms: ChannelId[]) => {
    if (!platforms.includes("instagram")) return;

    const url = imageUrl.trim();
    if (!url) {
      throw new Error(
        "Instagram needs an image.\n\nAdd an image URL, or deselect Instagram and send to the other channels."
      );
    }

    try {
      const { width, height } = await loadImageDimensions(url);
      const ratio = width / height;
      if (ratio < 0.5 || ratio > 1.91) {
        throw new Error(
          "This image is just outside Instagram’s preferred shape.\n\n" +
            "Swap it for a square or portrait image, then retry Instagram. If you want momentum now, send to the other channels and we’ll post to Instagram next."
        );
      }
    } catch (e: any) {
      console.warn("[QuickBlast] image check skipped:", e?.message);
    }
  };

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

      void callRootCoach({
        context: "quick_blast_failed",
        userAction: `Quick Blast failed for: ${platforms.join(", ")}`,
        errorMessage: friendly,
        outcome:
          succeeded.length > 0 && failed.length > 0
            ? "partial_success"
            : "failed",
        failedPlatforms: failed,
        successPlatforms: succeeded,
      });

      throw new Error(friendly);
    }

    setError(null);
    setStatus(`Posted successfully to: ${platforms.join(", ")}`);

    if (lastAction?.kind === "self_heal") {
      const msg = lastAction.wasRecommended
        ? "Momentum restored — great call. Keep going."
        : "Nice — you’re back on track.";
      setCelebration(msg);

      void callRootCoach({
        context: "recovery_success",
        userAction: `Recovered successfully: ${lastAction.actionLabel}`,
        outcome: "success",
        successPlatforms: platforms,
      });
    } else {
      setCelebration(null);
      void callRootCoach({
        context: "quick_blast_success",
        userAction: `Quick Blast succeeded for: ${platforms.join(", ")}`,
        outcome: "success",
        successPlatforms: platforms,
      });
    }

    return data;
  };

  const handleSend = async () => {
    setIsPosting(true);
    setStatus(null);
    setCelebration(null);
    setError(null);
    setCoachMessage(null);
    setLastResponse(null);

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

      await instagramImageGuard(selectedChannels);
      await postQuickBlast(selectedChannels);
    } catch (e: any) {
      setError((e?.message || "Something didn’t go through.").toString());
    } finally {
      setIsPosting(false);
    }
  };

  /* ----------------------------- */
  /* Self-heal actions */
  /* ----------------------------- */

  const retryFailedOnly = async () => {
    if (!failedPlatforms.length) return;

    setIsPosting(true);
    setStatus(null);
    setCelebration(null);
    setError(null);
    setCoachMessage(null);

    const label = "Retry failed only";
    setLastAction({
      kind: "self_heal",
      actionKey: "retry_failed",
      actionLabel: label,
      wasRecommended: (recommendedAction as any) === "retry_failed",
    });

    try {
      await instagramImageGuard(failedPlatforms);
      await postQuickBlast(failedPlatforms);
    } catch (e: any) {
      setError((e?.message || "Retry failed.").toString());
    } finally {
      setIsPosting(false);
    }
  };

  const postOtherChannelsNow = async () => {
    setIsPosting(true);
    setStatus(null);
    setCelebration(null);
    setError(null);
    setCoachMessage(null);

    const label = "Post to other channels now";
    setLastAction({
      kind: "self_heal",
      actionKey: "skip_instagram",
      actionLabel: label,
      wasRecommended: (recommendedAction as any) === "skip_instagram",
    });

    try {
      const platforms = selectedChannels.filter((p) => p !== "instagram");
      if (!platforms.length) {
        throw new Error(
          "If we skip Instagram, there are no other connected channels selected."
        );
      }
      await postQuickBlast(platforms);
    } catch (e: any) {
      setError((e?.message || "Retry failed.").toString());
    } finally {
      setIsPosting(false);
    }
  };

  const retryInstagramOnly = async () => {
    setIsPosting(true);
    setStatus(null);
    setCelebration(null);
    setError(null);
    setCoachMessage(null);

    const label = "Retry Instagram";
    setLastAction({
      kind: "self_heal",
      actionKey: "retry_instagram",
      actionLabel: label,
      wasRecommended: (recommendedAction as any) === "retry_instagram",
    });

    try {
      await instagramImageGuard(["instagram"]);
      await postQuickBlast(["instagram"]);
    } catch (e: any) {
      setError((e?.message || "Retry failed.").toString());
    } finally {
      setIsPosting(false);
    }
  };

  const runRecommendedAction = async () => {
    const a = recommendedAction as any;

    if (a === "save_for_later") {
      saveDraft("recommended action");
      return;
    }
    if (a === "retry_failed") {
      await retryFailedOnly();
      return;
    }
    if (a === "retry_instagram") {
      await retryInstagramOnly();
      return;
    }
    if (a === "skip_instagram") {
      await postOtherChannelsNow();
      return;
    }
  };

  const runCoachOption = async (opt: CoachOption) => {
    if (opt.action === "refresh_connections") {
      await refreshConnections();
      return;
    }
    if (opt.action === "save_for_later") {
      saveDraft("coach option");
      return;
    }
    if (opt.action === "retry_failed") {
      await retryFailedOnly();
      return;
    }
    if (opt.action === "retry_instagram") {
      await retryInstagramOnly();
      return;
    }
    if (opt.action === "skip_instagram") {
      await postOtherChannelsNow();
      return;
    }
  };

  /* ----------------------------- */
  /* Coach parsing + fallback (enterprise-safe polish) */
  /* ----------------------------- */

  const coachParsed = useMemo(
    () => parseCoachMessage(coachMessage),
    [coachMessage]
  );

  const coachOptionsFinal: CoachOption[] = useMemo(() => {
    if (coachParsed.options.length === 2) return coachParsed.options;

    const optionA: CoachOption = {
      label: recommendedLabel ? recommendedLabel : "Save for later",
      action: (recommendedAction as any) || "save_for_later",
    };

    const optionB: CoachOption = {
      label: "Refresh connections",
      action: "refresh_connections",
    };

    return [optionA, optionB];
  }, [coachParsed.options, recommendedLabel, recommendedAction]);

  /* ----------------------------- */
  /* Premium UI helpers */
  /* ----------------------------- */

  const GlassCard = ({
    children,
    className = "",
  }: {
    children: React.ReactNode;
    className?: string;
  }) => (
    <div
      className={[
        "rounded-3xl border border-white/10 bg-white/5 shadow-[0_20px_60px_rgba(0,0,0,0.35)] backdrop-blur-xl",
        className,
      ].join(" ")}
    >
      {children}
    </div>
  );

  const Pill = ({
    children,
    tone = "neutral",
  }: {
    children: React.ReactNode;
    tone?: "neutral" | "good" | "warn";
  }) => {
    const cls =
      tone === "good"
        ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-100"
        : tone === "warn"
        ? "border-amber-400/30 bg-amber-400/10 text-amber-100"
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
  };

  const PrimaryBtn = ({
    children,
    onClick,
    disabled,
  }: {
    children: React.ReactNode;
    onClick: () => void;
    disabled?: boolean;
  }) => (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center justify-center rounded-2xl bg-emerald-500 px-5 py-3 text-sm font-semibold text-slate-950 shadow-[0_12px_30px_rgba(16,185,129,0.25)] hover:bg-emerald-400 disabled:opacity-60 disabled:cursor-not-allowed transition"
    >
      {children}
    </button>
  );

  const SoftBtn = ({
    children,
    onClick,
    disabled,
  }: {
    children: React.ReactNode;
    onClick: () => void;
    disabled?: boolean;
  }) => (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center justify-center rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-slate-100 hover:bg-white/10 disabled:opacity-60 disabled:cursor-not-allowed transition"
    >
      {children}
    </button>
  );

  const RecommendedBadge = () => (
    <span className="ml-2 inline-flex items-center rounded-full border border-emerald-300/40 bg-emerald-300/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-100">
      Recommended
    </span>
  );

  const canSend = !isPosting && message.trim().length > 0;

  const connectedCount = useMemo(() => {
    return Object.values(connected).filter(Boolean).length;
  }, [connected]);

  const selectedConnectedCount = selectedChannels.length;

  const charCount = message.length;
  const charHint =
    charCount < 20
      ? "Short and punchy"
      : charCount < 140
      ? "Great length"
      : charCount < 300
      ? "A bit longer — still fine"
      : "Long — consider tightening";

  /* ----------------------------- */
  /* Render */
  /* ----------------------------- */

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Premium backdrop */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/2 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-emerald-500/10 blur-3xl" />
        <div className="absolute top-40 -left-40 h-[420px] w-[420px] rounded-full bg-sky-500/10 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-[520px] w-[520px] rounded-full bg-pink-500/10 blur-3xl" />
      </div>

      <div className="relative mx-auto w-full max-w-6xl px-4 py-10 space-y-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">
                Root Health Ops
              </h1>
              <Pill tone="good">Enterprise Beta</Pill>
            </div>
            <p className="mt-2 text-sm text-slate-300 max-w-2xl">
              A calm, premium cockpit for social momentum. Send fast. Recover
              cleanly. Keep going.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Pill>
              Connected:{" "}
              <span className="ml-1 text-slate-50 font-semibold">
                {connectedCount}
              </span>
            </Pill>
            <Pill>
              Selected:{" "}
              <span className="ml-1 text-slate-50 font-semibold">
                {selectedConnectedCount}
              </span>
            </Pill>
            <Pill tone="neutral">{connectedHint}</Pill>
          </div>
        </div>

        {/* Main grid */}
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Left: Composer */}
          <div className="lg:col-span-2 space-y-6">
            <GlassCard className="p-6 md:p-7">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold">Quick Blast</h2>
                  <p className="mt-1 text-xs text-slate-300">
                    Write once, choose channels, send. If anything fails, the
                    next step is highlighted.
                  </p>
                </div>

                <div className="flex flex-col items-end gap-2">
                  <Pill tone="neutral">
                    {charCount} chars · {charHint}
                  </Pill>
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

              {/* Message */}
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
                <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400">
                  <span>Keep it simple. One clear idea.</span>
                  <span>{charCount}</span>
                </div>
              </div>

              {/* Media */}
              <div className="mt-6">
                <label className="text-[11px] uppercase tracking-wide text-slate-400">
                  Image (optional, recommended for Instagram)
                </label>
                <input
                  type="url"
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-50 placeholder:text-slate-500 outline-none focus:border-emerald-400/50 focus:ring-1 focus:ring-emerald-400/30"
                  placeholder="Paste a direct image URL (JPG/PNG)…"
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                />
                <div className="mt-2 text-[11px] text-slate-400">
                  Tip: square or portrait images work best.
                </div>
              </div>

              {/* Channels */}
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

              {/* Actions */}
              <div className="mt-6 flex flex-col sm:flex-row gap-3">
                <PrimaryBtn
                  onClick={handleSend}
                  disabled={!canSend || !selectedChannels.length || !organisationId}
                >
                  {isPosting ? "Sending…" : "Send Quick Blast"}
                </PrimaryBtn>

                <SoftBtn onClick={() => saveDraft("manual")} disabled={!canSend}>
                  Save for later
                </SoftBtn>

                <SoftBtn onClick={loadMostRecentDraft} disabled={!drafts.length}>
                  Load last draft
                </SoftBtn>
              </div>

              {!selectedChannels.length && (
                <div className="mt-3 text-[11px] text-amber-200">
                  Select at least one connected channel to enable sending.
                </div>
              )}

              {/* Feedback */}
              {status && (
                <div className="mt-4 rounded-2xl border border-emerald-300/20 bg-emerald-300/10 p-4 text-sm text-emerald-50">
                  {status}
                </div>
              )}

              {celebration && (
                <div className="mt-4 rounded-2xl border border-emerald-300/20 bg-emerald-300/10 p-4 text-sm text-emerald-50">
                  <span className="font-semibold">✓</span> {celebration}
                </div>
              )}

              {error && (
                <div className="mt-4 rounded-2xl border border-red-300/20 bg-red-300/10 p-4 text-sm text-red-100 whitespace-pre-wrap">
                  {error}
                </div>
              )}
            </GlassCard>

            {/* Self-heal panel */}
            {anyFailure && (
              <GlassCard className="p-6 md:p-7">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-base font-semibold">Recovery</h3>
                    <p className="mt-1 text-xs text-slate-300">
                      One-click next step, plus alternatives if you want control.
                    </p>
                  </div>

                  {recommendedLabel && (
                    <div className="text-right">
                      <div className="text-[11px] text-slate-400">
                        Recommended
                      </div>
                      <div className="text-sm font-semibold text-slate-50">
                        {recommendedLabel}
                      </div>
                    </div>
                  )}
                </div>

                {recommendedAction && recommendedLabel && (
                  <button
                    type="button"
                    onClick={runRecommendedAction}
                    disabled={isPosting}
                    className="mt-5 w-full rounded-3xl border border-emerald-300/30 bg-emerald-300/10 p-5 text-left hover:bg-emerald-300/15 transition disabled:opacity-60"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-[11px] uppercase tracking-wide text-emerald-200">
                          Recommended next step
                        </div>
                        <div className="mt-1 text-base font-semibold text-emerald-50">
                          {recommendedLabel}
                          <RecommendedBadge />
                        </div>
                        <div className="mt-2 text-[11px] text-slate-200/90">
                          Fastest way back to momentum.
                        </div>
                      </div>

                      <div className="rounded-2xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 shadow-[0_10px_25px_rgba(16,185,129,0.25)]">
                        Do it
                      </div>
                    </div>
                  </button>
                )}

                <div className="mt-5 flex flex-wrap gap-2">
                  {failedPlatforms.length > 0 && (
                    <button
                      type="button"
                      onClick={retryFailedOnly}
                      disabled={isPosting}
                      className={[
                        "rounded-2xl border px-4 py-3 text-xs font-semibold transition disabled:opacity-60",
                        (recommendedAction as any) === "retry_failed"
                          ? "border-emerald-300/30 bg-emerald-300/10 text-emerald-50"
                          : "border-white/10 bg-white/5 text-slate-200 hover:bg-white/10",
                      ].join(" ")}
                    >
                      Retry failed only ({failedPlatforms.join(", ")})
                      {(recommendedAction as any) === "retry_failed" && (
                        <RecommendedBadge />
                      )}
                    </button>
                  )}

                  {selectedChannels.includes("instagram") && (
                    <button
                      type="button"
                      onClick={retryInstagramOnly}
                      disabled={isPosting}
                      className={[
                        "rounded-2xl border px-4 py-3 text-xs font-semibold transition disabled:opacity-60",
                        (recommendedAction as any) === "retry_instagram"
                          ? "border-emerald-300/30 bg-emerald-300/10 text-emerald-50"
                          : "border-white/10 bg-white/5 text-slate-200 hover:bg-white/10",
                      ].join(" ")}
                    >
                      Retry Instagram only
                      {(recommendedAction as any) === "retry_instagram" && (
                        <RecommendedBadge />
                      )}
                    </button>
                  )}

                  {selectedChannels.includes("instagram") && (
                    <button
                      type="button"
                      onClick={postOtherChannelsNow}
                      disabled={isPosting}
                      className={[
                        "rounded-2xl border px-4 py-3 text-xs font-semibold transition disabled:opacity-60",
                        (recommendedAction as any) === "skip_instagram"
                          ? "border-emerald-300/30 bg-emerald-300/10 text-emerald-50"
                          : "border-white/10 bg-white/5 text-slate-200 hover:bg-white/10",
                      ].join(" ")}
                    >
                      Post to other channels now (skip Instagram)
                      {(recommendedAction as any) === "skip_instagram" && (
                        <RecommendedBadge />
                      )}
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => saveDraft("from recovery")}
                    disabled={isPosting}
                    className={[
                      "rounded-2xl border px-4 py-3 text-xs font-semibold transition disabled:opacity-60",
                      (recommendedAction as any) === "save_for_later"
                        ? "border-emerald-300/30 bg-emerald-300/10 text-emerald-50"
                        : "border-white/10 bg-white/5 text-slate-200 hover:bg-white/10",
                    ].join(" ")}
                  >
                    Save for later
                    {(recommendedAction as any) === "save_for_later" && (
                      <RecommendedBadge />
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={refreshConnections}
                    disabled={isPosting}
                    className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-xs font-semibold text-slate-200 hover:bg-white/10 transition disabled:opacity-60"
                  >
                    Refresh connections
                  </button>
                </div>
              </GlassCard>
            )}
          </div>

          {/* Right: Drafts + Coach + Admin */}
          <div className="space-y-6">
            {/* Drafts */}
            <GlassCard className="p-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold">Saved drafts</h3>
                  <p className="mt-1 text-xs text-slate-300">
                    Stored on this device for now.
                  </p>
                </div>
                <Pill>{drafts.length} saved</Pill>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <SoftBtn onClick={() => saveDraft("drafts card")} disabled={!message.trim()}>
                  Save current
                </SoftBtn>
                <SoftBtn onClick={loadMostRecentDraft} disabled={!drafts.length}>
                  Load most recent
                </SoftBtn>
                <SoftBtn onClick={() => setDraftsOpen((v) => !v)} disabled={!drafts.length}>
                  {draftsOpen ? "Hide list" : "Show list"}
                </SoftBtn>
                <SoftBtn onClick={clearAllDrafts} disabled={!drafts.length}>
                  Clear all
                </SoftBtn>
              </div>

              {draftsOpen && (
                <div className="mt-4 space-y-2">
                  {drafts.length === 0 ? (
                    <div className="text-xs text-slate-400">
                      No drafts yet.
                    </div>
                  ) : (
                    drafts.map((d) => (
                      <div
                        key={d.id}
                        className="rounded-2xl border border-white/10 bg-white/5 p-4"
                      >
                        <div className="text-sm font-semibold text-slate-50">
                          {formatDraftTitle(d.message)}
                        </div>
                        <div className="mt-1 text-[11px] text-slate-400">
                          Saved: {niceDate(d.savedAt)}
                        </div>

                        <div className="mt-3 flex gap-2">
                          <button
                            type="button"
                            onClick={() => loadDraft(d.id)}
                            className="flex-1 rounded-2xl bg-slate-100 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-white transition"
                          >
                            Load
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteDraft(d.id)}
                            className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-slate-200 hover:bg-white/10 transition"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </GlassCard>

            {/* Coach */}
            {coachMessage && (
              <GlassCard className="p-6">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-base font-semibold">Root Coach</h3>
                    <p className="mt-1 text-xs text-slate-300">
                      Calm, plain-English guidance with two actions.
                    </p>
                  </div>
                  <Pill tone="good">Guided</Pill>
                </div>

                {coachParsed.body && (
                  <div className="mt-4 text-sm text-slate-100 whitespace-pre-wrap">
                    {coachParsed.body}
                  </div>
                )}

                {coachOptionsFinal.length === 2 && (
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
                )}
              </GlassCard>
            )}

            {/* Admin / Technical */}
            <GlassCard className="p-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold">Admin view</h3>
                  <p className="mt-1 text-xs text-slate-300">
                    Safe technical details (redacted).
                  </p>
                </div>
                <Pill tone={quotaMessage ? "warn" : "neutral"}>
                  {quotaMessage ? "Limited" : "Normal"}
                </Pill>
              </div>

              {quotaMessage && (
                <div className="mt-4 rounded-2xl border border-amber-300/20 bg-amber-300/10 p-4 text-sm text-amber-50 whitespace-pre-wrap">
                  {quotaMessage}
                </div>
              )}

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
            </GlassCard>
          </div>
        </div>
      </div>
    </div>
  );
}
