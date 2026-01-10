// app/dashboard/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";

/**
 * Root Health Ops — Dashboard Quick Blast
 * - Full UI (connections panel, channel pills, self-heal panel, coach, technical details)
 * - Phase 1 Step 1: Save for later (real action, treated as success)
 * - Enterprise-safe: redact vendor names & links in admin/technical views
 */

/* ----------------------------- */
/* Types */
/* ----------------------------- */

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

type DraftPayload = {
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

/* ----------------------------- */
/* Constants */
/* ----------------------------- */

const DRAFT_KEY = "rh_ops_quick_blast_draft_v1";

const CHANNELS: { id: ChannelId; label: string; dotClass: string }[] = [
  { id: "facebook", label: "Facebook Page", dotClass: "bg-[#1877F2]" },
  { id: "linkedin", label: "LinkedIn", dotClass: "bg-sky-500" },
  { id: "instagram", label: "Instagram", dotClass: "bg-pink-500" },
  { id: "threads", label: "Threads", dotClass: "bg-white" },
];

/* ----------------------------- */
/* Helpers */
/* ----------------------------- */

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
    if (r.is_active === false) continue;

    const p = String(r.platform || "").toLowerCase();
    if (p === "facebook") connected.facebook = true;
    if (p === "linkedin") connected.linkedin = true;
    if (p === "instagram") connected.instagram = true;
    if (p === "threads") connected.threads = true;
    if (p === "tiktok") connected.tiktok = true;
    if (p === "reddit") connected.reddit = true;
  }

  return connected;
}

function loadImageDimensions(url: string): Promise<{ width: number; height: number }> {
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

    // Instagram image shape / aspect ratio
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

  // Draft
  const [lastDraftSavedAt, setLastDraftSavedAt] = useState<string | null>(null);

  // Last action (for celebration tone)
  const [lastAction, setLastAction] = useState<RecoveryMeta>(null);

  const detectedConnectedList = useMemo(() => {
    return Object.entries(connected)
      .filter(([, v]) => v)
      .map(([k]) => k)
      .join(", ");
  }, [connected]);

  const selectedChannels = useMemo(() => {
    // Only send to channels selected + connected
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
        res.ok ? "Loaded from /api/social-accounts" : `HTTP ${res.status}`
      );
      setOrganisationId(typeof data?.organisationId === "string" ? data.organisationId : null);
      setConnected(detectConnectedPlatforms(data));
    } catch (e: any) {
      setConnectedHint(e?.message || "Failed to load /api/social-accounts");
    }
  };

  useEffect(() => {
    void refreshConnections();

    // Load saved draft timestamp (if present)
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const d = JSON.parse(raw) as DraftPayload;
        if (d?.savedAt) setLastDraftSavedAt(d.savedAt);
      }
    } catch {
      // ignore
    }
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
    } catch {
      // ignore
    }
  };

  /* ----------------------------- */
  /* Phase 1 Step 1: Save for later */
  /* ----------------------------- */
  const saveDraft = (reason?: string) => {
    try {
      const payload: DraftPayload = {
        message,
        imageUrl,
        selected,
        savedAt: new Date().toISOString(),
      };
      localStorage.setItem(DRAFT_KEY, JSON.stringify(payload));
      setLastDraftSavedAt(payload.savedAt);

      // Treat as success (calm reset)
      setLastResponse(null);
      setError(null);
      setStatus("Saved for later — your draft is safe and ready when you are.");
      setCelebration("Nice — progress saved. You’re still in control.");

      void callRootCoach({
        context: "save_for_later_success",
        userAction: reason ? `Saved draft (${reason})` : "Saved draft",
        outcome: "success",
      });
    } catch {
      setError(
        "Couldn’t save the draft on this device. Please copy the text for now."
      );
    }
  };

  const loadDraft = () => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) {
        setError("No saved draft found yet.");
        return;
      }
      const d = JSON.parse(raw) as DraftPayload;
      if (!d?.message) {
        setError("Saved draft looks incomplete.");
        return;
      }
      setMessage(d.message);
      setImageUrl(d.imageUrl || "");
      if (d.selected) setSelected(d.selected);
      setLastDraftSavedAt(d.savedAt || null);
      setStatus("Draft loaded.");
      setCelebration(null);
      setError(null);
    } catch {
      setError("Couldn’t load the saved draft.");
    }
  };

  const clearDraft = () => {
    const ok = confirm("Clear the saved draft on this device?");
    if (!ok) return;
    try {
      localStorage.removeItem(DRAFT_KEY);
      setLastDraftSavedAt(null);
      setStatus("Saved draft cleared.");
      setCelebration(null);
      setError(null);
    } catch {
      setError("Couldn’t clear the saved draft.");
    }
  };

  /* ----------------------------- */
  /* Recommended action logic */
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
  }, [quotaMessage, isInstagramImageProblem, hadPartialSuccess, failedPlatforms.length, anyFailure]);

  const recommendedLabel = useMemo(() => {
    switch (recommendedAction) {
      case "save_for_later":
        return "Save for later";
      case "retry_instagram":
        return "Retry Instagram after swapping image";
      case "retry_failed":
        return "Retry failed only";
      case "skip_instagram":
        return "Post to other channels now";
      default:
        return null;
    }
  }, [recommendedAction]);

  const buttonClass = (isRecommended: boolean, tone: "primary" | "secondary") =>
    [
      "relative rounded-full px-4 py-2 text-xs font-semibold transition disabled:opacity-60 disabled:cursor-not-allowed",
      isRecommended
        ? "border border-emerald-400/70 bg-emerald-400/15 text-emerald-50 shadow-[0_0_0_1px_rgba(52,211,153,0.25)]"
        : tone === "primary"
        ? "bg-amber-400 text-slate-950"
        : "border border-slate-600 bg-slate-900/80 text-slate-200 hover:border-slate-500",
    ].join(" ");

  const RecommendedPill = () => (
    <span className="ml-2 inline-flex items-center rounded-full border border-emerald-400/60 bg-emerald-400/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-100">
      Recommended
    </span>
  );

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

    // Best-effort local check to reduce user frustration
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
      // If the browser can’t load the image (CORS), we don’t block posting;
      // The backend will still validate.
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
          succeeded.length > 0 && failed.length > 0 ? "partial_success" : "failed",
        failedPlatforms: failed,
        successPlatforms: succeeded,
      });

      throw new Error(friendly);
    }

    // Success
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
      // keep lastResponse if present
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
      wasRecommended: recommendedAction === "retry_failed",
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
      wasRecommended: recommendedAction === "skip_instagram",
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
      wasRecommended: recommendedAction === "retry_instagram",
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

  /* ----------------------------- */
  /* Self-heal buttons (recommended first) */
  /* ----------------------------- */

  const selfHealButtons = useMemo(() => {
    const items: {
      key: Exclude<RecommendedAction, null> | "refresh";
      show: boolean;
      label: string;
      onClick: () => void;
      tone: "primary" | "secondary";
      recommended: boolean;
    }[] = [];

    const showRetryFailed = failedPlatforms.length > 0;
    const igSelectedAndConnected = selectedChannels.includes("instagram");
    const canSkipIg = selectedChannels.includes("instagram");

    if (showRetryFailed) {
      items.push({
        key: "retry_failed",
        show: true,
        label: `Retry failed only (${failedPlatforms.join(", ")})`,
        onClick: retryFailedOnly,
        tone: "primary",
        recommended: recommendedAction === "retry_failed",
      });
    }

    if (igSelectedAndConnected) {
      items.push({
        key: "retry_instagram",
        show: true,
        label: "Retry Instagram only",
        onClick: retryInstagramOnly,
        tone: "secondary",
        recommended: recommendedAction === "retry_instagram",
      });
    }

    if (canSkipIg) {
      items.push({
        key: "skip_instagram",
        show: true,
        label: "Post to other channels now (skip Instagram)",
        onClick: postOtherChannelsNow,
        tone: "secondary",
        recommended: recommendedAction === "skip_instagram",
      });
    }

    // ✅ Phase 1 Step 1: Save for later always available on failure
    items.push({
      key: "save_for_later",
      show: true,
      label: "Save for later",
      onClick: () => saveDraft("from self-heal panel"),
      tone: "secondary",
      recommended: recommendedAction === "save_for_later",
    });

    items.push({
      key: "refresh",
      show: true,
      label: "Refresh connections",
      onClick: refreshConnections,
      tone: "secondary",
      recommended: false,
    });

    items.sort((a, b) => Number(b.recommended) - Number(a.recommended));
    return items;
  }, [failedPlatforms, selectedChannels, recommendedAction]);

  /* ----------------------------- */
  /* Render */
  /* ----------------------------- */

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6">
      <h1 className="text-2xl font-semibold mb-4">Root Health Ops Dashboard</h1>

      {/* Connections / admin panel */}
      <div className="max-w-3xl mb-4 rounded-2xl border border-slate-700 bg-slate-900/70 p-4">
        <div className="text-[11px] uppercase tracking-wide text-slate-400">
          Connected platforms
        </div>
        <div className="text-xs text-slate-300 mt-1">{connectedHint}</div>

        <div className="text-xs text-slate-200 mt-2">
          Detected connected:{" "}
          <span className="text-slate-50 font-medium">
            {detectedConnectedList || "(none detected)"}
          </span>
        </div>

        <div className="text-xs text-slate-200 mt-2">
          Workspace ID:{" "}
          <span className="text-slate-50 font-medium">
            {organisationId || "(loading…)"}
          </span>
        </div>

        <div className="mt-3 flex gap-2 flex-wrap items-center">
          <button
            type="button"
            onClick={refreshConnections}
            className="rounded-full border border-slate-600 bg-slate-900/80 px-3 py-1.5 text-xs text-slate-200 hover:border-slate-500"
          >
            Refresh connections
          </button>

          <button
            type="button"
            onClick={loadDraft}
            className="rounded-full border border-slate-600 bg-slate-900/80 px-3 py-1.5 text-xs text-slate-200 hover:border-slate-500"
          >
            Load saved draft
          </button>

          <button
            type="button"
            onClick={() => saveDraft("manual save")}
            className="rounded-full border border-emerald-500/60 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-100 hover:bg-emerald-500/20"
          >
            Save draft
          </button>

          <button
            type="button"
            onClick={clearDraft}
            className="rounded-full border border-slate-700 bg-slate-950/40 px-3 py-1.5 text-xs text-slate-300 hover:border-slate-500"
          >
            Clear draft
          </button>

          {lastDraftSavedAt && (
            <span className="text-[11px] text-slate-400 ml-1">
              Draft saved: {new Date(lastDraftSavedAt).toLocaleString()}
            </span>
          )}

          <details className="ml-auto">
            <summary className="text-xs text-slate-500 cursor-pointer">
              Show raw connections (admin)
            </summary>
            <pre className="mt-2 text-[10px] whitespace-pre-wrap bg-black/40 border border-slate-800 rounded-xl p-2 max-h-[260px] overflow-auto text-slate-300">
              {safeJson(redactVendorsDeep(rawSocialAccounts))}
            </pre>
          </details>
        </div>
      </div>

      {/* Composer */}
      <div className="max-w-3xl space-y-4">
        <textarea
          className="w-full rounded-xl bg-slate-900 border border-slate-700 p-3 min-h-[140px]"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Write your Quick Blast message…"
        />

        <input
          type="url"
          placeholder="Image URL (required for Instagram)"
          className="w-full rounded-xl bg-slate-900 border border-slate-700 p-2"
          value={imageUrl}
          onChange={(e) => setImageUrl(e.target.value)}
        />

        {/* Channels */}
        <div className="space-y-2">
          <div className="text-sm font-medium text-slate-200">Channels</div>

          <div className="flex flex-wrap gap-2">
            {CHANNELS.map((c) => {
              const isConnected = connected[c.id];
              const isSelected = selected[c.id];

              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => toggle(c.id)}
                  className={[
                    "px-3 py-1.5 rounded-full border text-xs flex items-center gap-1 transition",
                    isSelected
                      ? "border-emerald-500 bg-emerald-500/10 text-emerald-100"
                      : "border-slate-600 bg-slate-900 text-slate-300 hover:border-slate-500",
                  ].join(" ")}
                >
                  <span
                    className={["h-2 w-2 rounded-full", c.dotClass].join(" ")}
                  />
                  {c.label}
                  {!isConnected && (
                    <span className="ml-1 text-[10px] text-amber-300">
                      (not connected)
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="text-[11px] text-slate-500">
            Tip: Instagram prefers square or portrait images.
          </div>
        </div>

        {/* Primary actions */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleSend}
            disabled={isPosting}
            className="rounded-full bg-emerald-500 px-5 py-2 text-slate-950 font-semibold disabled:opacity-60"
          >
            {isPosting ? "Sending…" : "Send Quick Blast"}
          </button>

          <button
            type="button"
            onClick={() => saveDraft("top action row")}
            className="rounded-full border border-emerald-500/60 bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-100 hover:bg-emerald-500/20"
          >
            Save for later
          </button>
        </div>

        {/* Feedback */}
        {status && <div className="text-emerald-400 text-sm">{status}</div>}

        {celebration && (
          <div className="rounded-xl border border-emerald-500/40 bg-emerald-950/25 px-4 py-3 text-sm text-emerald-100">
            <span className="font-semibold">✓</span> {celebration}
          </div>
        )}

        {error && (
          <div className="text-red-300 text-sm whitespace-pre-wrap">{error}</div>
        )}

        {/* Self-heal panel */}
        {anyFailure && (
          <div className="rounded-2xl border border-amber-500/40 bg-amber-950/20 p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-[11px] uppercase tracking-wide text-amber-200">
                Self-heal actions
              </div>

              {recommendedLabel && (
                <div className="text-[11px] text-slate-200">
                  <span className="text-slate-400">Recommended:</span>{" "}
                  <span className="font-medium text-slate-50">
                    {recommendedLabel}
                  </span>
                </div>
              )}
            </div>

            {hadPartialSuccess && (
              <div className="text-sm text-amber-100">
                Good news: some channels succeeded. We can retry only what
                failed.
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              {selfHealButtons
                .filter((b) => b.show)
                .map((b) => (
                  <button
                    key={b.key}
                    type="button"
                    onClick={b.onClick}
                    disabled={isPosting}
                    className={buttonClass(b.recommended, b.tone)}
                  >
                    {b.label}
                    {b.recommended && <RecommendedPill />}
                  </button>
                ))}
            </div>
          </div>
        )}

        {/* Coach */}
        {coachMessage && (
          <div className="rounded-2xl border border-sky-500/40 bg-sky-950/25 p-4 space-y-3">
            <div className="text-[11px] uppercase tracking-wide text-sky-200">
              Root Coach
            </div>
            <div className="text-sm text-sky-50 whitespace-pre-wrap">
              {coachMessage}
            </div>
          </div>
        )}

        {/* Technical details */}
        {lastResponse && (
          <div className="text-xs bg-slate-900 border border-slate-700 rounded-xl p-3 space-y-2">
            <div className="text-[11px] uppercase tracking-wide text-slate-400">
              Technical details
            </div>

            {quotaMessage && (
              <div className="text-sm text-amber-200 whitespace-pre-wrap border border-amber-500/30 bg-amber-950/20 rounded-lg p-3">
                {quotaMessage}
              </div>
            )}

            <pre className="mt-1 whitespace-pre-wrap text-[10px] text-slate-200 bg-black/30 border border-slate-800 rounded-lg p-2 overflow-auto">
              {safeJson(redactVendorsDeep(lastResponse))}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
