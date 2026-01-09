// app/dashboard/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";

type ChannelId =
  | "facebook"
  | "linkedin"
  | "instagram"
  | "threads"
  | "tiktok"
  | "reddit";

const ALL_CHANNELS: { id: ChannelId; label: string; dotClass: string }[] = [
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

/**
 * Scrub vendor/infrastructure mentions from any object,
 * so enterprise users never see third-party names or pricing/docs links.
 */
function redactVendorsDeep(input: any) {
  const vendorRegex = /ayrshare/gi;
  const pricingRegex = /https?:\/\/www\.ayrshare\.com\/pricing\/?/gi;
  const docsRegex = /https?:\/\/www\.ayrshare\.com\/docs\/[^\s"]+/gi;

  const walk = (v: any): any => {
    if (v == null) return v;

    if (typeof v === "string") {
      return v
        .replace(vendorRegex, "Social posting service")
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

function detectConnectedPlatformsFromSocialAccountsPayload(payload: any) {
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

/**
 * Friendly enterprise messaging for quota hits (429 / code 106).
 */
function userSafeQuotaMessage(payload: any) {
  const status = payload?.status;
  const code = payload?.details?.code;
  const msg = String(payload?.details?.message || "").toLowerCase();

  if (status === 429 || code === 106 || msg.includes("quota")) {
    return (
      "You’ve reached this month’s posting allowance for this channel.\n\n" +
      "You can still draft content and schedule ideas — posting will resume when the allowance resets, or you can increase capacity in your workspace plan."
    );
  }

  return null;
}

/**
 * Enterprise-safe human translation for Quick Blast failures.
 * Never repeats vendor names.
 */
function plainEnglishFromQuickBlastFailure(payload: any): string {
  const rawBase = String(payload?.error || payload?.message || "").trim();
  const baseLower = rawBase.toLowerCase();

  const safeBase =
    !rawBase
      ? "Something didn’t go through."
      : baseLower.includes("ayrshare") || baseLower.includes("post failed")
      ? "One or more channels couldn’t be posted right now."
      : rawBase;

  // Quota gets a special message
  const quota = userSafeQuotaMessage(payload);
  if (quota) {
    return quota;
  }

  const errs = payload?.details?.errors;

  if (Array.isArray(errs) && errs.length > 0) {
    const ig = errs.find(
      (e: any) => String(e?.platform).toLowerCase() === "instagram"
    );
    const e = ig || errs[0];

    const platform = String(e?.platform || "a channel");
    const code = e?.code;
    const msg = String(e?.message || "").trim();

    if (
      platform.toLowerCase() === "instagram" &&
      (code === 140 ||
        msg.toLowerCase().includes("aspect ratio") ||
        msg.toLowerCase().includes("image"))
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

    return (
      `${safeBase}\n\n` +
      `${platform} needs a small tweak: ${msg || "Please try again."}`
    );
  }

  return safeBase;
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

export default function DashboardHomePage() {
  const [message, setMessage] = useState(
    "Quick check-in from Root Health Ops Dashboard ✅"
  );
  const [imageUrl, setImageUrl] = useState("");

  const [isPosting, setIsPosting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Connections
  const [rawSocialAccounts, setRawSocialAccounts] = useState<any>(null);
  const [connectedHint, setConnectedHint] = useState<string>("Loading…");
  const [connected, setConnected] = useState<Record<ChannelId, boolean>>({
    facebook: false,
    linkedin: false,
    instagram: false,
    threads: false,
    tiktok: false,
    reddit: false,
  });
  const [organisationId, setOrganisationId] = useState<string | null>(null);

  // Selected channels
  const [selected, setSelected] = useState<Record<ChannelId, boolean>>({
    facebook: true,
    linkedin: false,
    instagram: false,
    threads: false,
    tiktok: false,
    reddit: false,
  });

  // Last Quick Blast response
  const [lastResponse, setLastResponse] = useState<any>(null);

  // Root Coach
  const [coachMessage, setCoachMessage] = useState<string | null>(null);

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

  const refreshConnections = async () => {
    try {
      const res = await fetch("/api/social-accounts", { method: "GET" });
      const data = await res.json().catch(() => null);

      setRawSocialAccounts(data);
      setConnectedHint(
        res.ok ? "Loaded from /api/social-accounts" : `HTTP ${res.status}`
      );
      setOrganisationId(
        typeof data?.organisationId === "string" ? data.organisationId : null
      );
      setConnected(detectConnectedPlatformsFromSocialAccountsPayload(data));
    } catch (e: any) {
      setConnectedHint(e?.message || "Failed to load /api/social-accounts");
    }
  };

  useEffect(() => {
    void refreshConnections();
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

  /**
   * IG guard: only blocks when clearly invalid (ratio outside 0.5–1.91),
   * otherwise lets the backend validate and respond.
   */
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
      // If we can’t read dimensions (CORS/CDN), don’t block — backend will tell us.
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
        context: "quick_blast",
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

    void callRootCoach({
      context: "quick_blast",
      userAction: `Quick Blast succeeded for: ${platforms.join(", ")}`,
      outcome: "success",
      successPlatforms: platforms,
    });

    return data;
  };

  const handleSend = async () => {
    setIsPosting(true);
    setStatus(null);
    setError(null);
    setCoachMessage(null);
    setLastResponse(null);

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

  // Self-heal actions
  const retryFailedOnly = async () => {
    if (!failedPlatforms.length) return;

    setIsPosting(true);
    setStatus(null);
    setError(null);
    setCoachMessage(null);

    try {
      await instagramImageGuard(failedPlatforms);
      await postQuickBlast(failedPlatforms);
    } catch (e: any) {
      setError((e?.message || "Retry failed.").toString());
    } finally {
      setIsPosting(false);
    }
  };

  const retryWithoutInstagram = async () => {
    setIsPosting(true);
    setStatus(null);
    setError(null);
    setCoachMessage(null);

    try {
      const platforms = selectedChannels.filter((p) => p !== "instagram");
      if (!platforms.length) {
        throw new Error(
          "If we skip Instagram, there are no channels left selected."
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
    setError(null);
    setCoachMessage(null);

    try {
      await instagramImageGuard(["instagram"]);
      await postQuickBlast(["instagram"]);
    } catch (e: any) {
      setError((e?.message || "Retry failed.").toString());
    } finally {
      setIsPosting(false);
    }
  };

  const syncConnectionRecord = async (platform: ChannelId) => {
    const ok = confirm(
      `Sync connection record for ${platform}?\n\nThis only updates your Root Health workspace so the UI stays consistent.`
    );
    if (!ok) return;

    try {
      await fetch("/api/social-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform,
          pageId: "pending_page_id",
          pageName:
            platform === "linkedin"
              ? "LinkedIn"
              : platform === "instagram"
              ? "Instagram"
              : platform === "threads"
              ? "Threads"
              : platform,
        }),
      });

      await refreshConnections();
      setStatus(`Synced connection record for ${platform}.`);
    } catch (e: any) {
      setError((e?.message || "Could not sync connection record.").toString());
    }
  };

  const quotaMessage = useMemo(() => userSafeQuotaMessage(lastResponse), [lastResponse]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6">
      <h1 className="text-2xl font-semibold mb-4">Root Health Ops Dashboard</h1>

      {/* Connections */}
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

        <div className="mt-3 flex gap-2 flex-wrap">
          <button
            type="button"
            onClick={refreshConnections}
            className="rounded-full border border-slate-600 bg-slate-900/80 px-3 py-1.5 text-xs text-slate-200 hover:border-slate-500"
          >
            Refresh connections
          </button>

          <details className="ml-auto">
            <summary className="text-xs text-slate-500 cursor-pointer">
              Show raw connections (admin)
            </summary>
            <pre className="mt-2 text-[10px] whitespace-pre-wrap bg-black/40 border border-slate-800 rounded-xl p-2 max-h-[260px] overflow-auto text-slate-300">
              {safeJson(rawSocialAccounts)}
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
            {ALL_CHANNELS.map((c) => {
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

        {/* Send */}
        <button
          onClick={handleSend}
          disabled={isPosting}
          className="rounded-full bg-emerald-500 px-5 py-2 text-slate-950 font-semibold disabled:opacity-60"
        >
          {isPosting ? "Sending…" : "Send Quick Blast"}
        </button>

        {/* Status */}
        {status && <div className="text-emerald-400 text-sm">{status}</div>}
        {error && (
          <div className="text-red-300 text-sm whitespace-pre-wrap">{error}</div>
        )}

        {/* Self-heal actions */}
        {anyFailure && (
          <div className="rounded-2xl border border-amber-500/40 bg-amber-950/20 p-4 space-y-3">
            <div className="text-[11px] uppercase tracking-wide text-amber-200">
              Self-heal actions
            </div>

            {hadPartialSuccess && (
              <div className="text-sm text-amber-100">
                Good news: some channels succeeded. We can retry only what
                failed.
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              {failedPlatforms.length > 0 && (
                <button
                  type="button"
                  onClick={retryFailedOnly}
                  disabled={isPosting}
                  className="rounded-full bg-amber-400 px-4 py-2 text-xs font-semibold text-slate-950 disabled:opacity-60"
                >
                  Retry failed only ({failedPlatforms.join(", ")})
                </button>
              )}

              {selectedChannels.includes("instagram") && (
                <button
                  type="button"
                  onClick={retryInstagramOnly}
                  disabled={isPosting}
                  className="rounded-full border border-amber-400/60 bg-amber-400/10 px-4 py-2 text-xs font-semibold text-amber-100 disabled:opacity-60"
                >
                  Retry Instagram only
                </button>
              )}

              {selectedChannels.includes("instagram") && (
                <button
                  type="button"
                  onClick={retryWithoutInstagram}
                  disabled={isPosting}
                  className="rounded-full border border-slate-600 bg-slate-900/80 px-4 py-2 text-xs text-slate-200 disabled:opacity-60"
                >
                  Send without Instagram for now
                </button>
              )}

              <button
                type="button"
                onClick={refreshConnections}
                disabled={isPosting}
                className="rounded-full border border-slate-600 bg-slate-900/80 px-4 py-2 text-xs text-slate-200 disabled:opacity-60"
              >
                Refresh connections
              </button>
            </div>

            <div className="text-[11px] text-amber-100/80">
              If a channel shows “not connected” but you know it’s connected,
              you can sync the record:
            </div>

            <div className="flex flex-wrap gap-2">
              {ALL_CHANNELS.map((c) => (
                <button
                  key={`sync-${c.id}`}
                  type="button"
                  onClick={() => syncConnectionRecord(c.id)}
                  className="rounded-full border border-slate-700 bg-slate-950/40 px-3 py-1.5 text-[11px] text-slate-200 hover:border-slate-500"
                >
                  Sync {c.id}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Root Coach */}
        {coachMessage && (
          <div className="rounded-2xl border border-sky-500/40 bg-sky-950/25 p-4 space-y-2">
            <div className="text-[11px] uppercase tracking-wide text-sky-200">
              Root Coach
            </div>
            <div className="text-sm text-sky-50 whitespace-pre-wrap">
              {coachMessage}
            </div>
          </div>
        )}

        {/* Technical details panel (enterprise-safe) */}
        {lastResponse && (
          <div className="text-xs bg-slate-900 border border-slate-700 rounded-xl p-3 space-y-2">
            <div className="text-[11px] uppercase tracking-wide text-slate-400">
              Technical details
            </div>

            {/* Friendly quota interpretation */}
            {quotaMessage && (
              <div className="text-sm text-amber-200 whitespace-pre-wrap border border-amber-500/30 bg-amber-950/20 rounded-lg p-3">
                {quotaMessage}
              </div>
            )}

            <details>
              <summary className="text-xs text-slate-400 cursor-pointer">
                Show safe technical view
              </summary>
              <pre className="mt-2 whitespace-pre-wrap text-[10px] text-slate-200 bg-black/30 border border-slate-800 rounded-lg p-2 overflow-auto">
                {safeJson(redactVendorsDeep(lastResponse))}
              </pre>
            </details>

            <details>
              <summary className="text-xs text-slate-500 cursor-pointer">
                Show raw response (admin)
              </summary>
              <pre className="mt-2 whitespace-pre-wrap text-[10px] text-slate-300 bg-black/40 border border-slate-800 rounded-lg p-2 overflow-auto">
                {safeJson(lastResponse)}
              </pre>
            </details>
          </div>
        )}
      </div>
    </div>
  );
}
