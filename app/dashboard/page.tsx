// app/dashboard/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";

type ChannelId =
  | "facebook"
  | "instagram"
  | "linkedin"
  | "threads"
  | "tiktok"
  | "reddit"
  | "google"
  | "email"
  | "whatsapp";

type QuickBlastResult = {
  channel: ChannelId;
  ok: boolean;
  status?: number;
  error?: string;
  details?: any;
  sent?: any;
  raw?: any;
};

type Mode = "now" | "schedule";

function safeStringify(v: any) {
  try {
    if (v === undefined) return "";
    if (typeof v === "string") return v;
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

function extractConnectedPlatforms(payload: any): string[] {
  // /api/social-accounts might return:
  // - an array of rows
  // - { data: [...] }
  // - { accounts: [...] }
  // - { socialAccounts: [...] }
  // We'll handle all defensively.
  const rows =
    (Array.isArray(payload) ? payload : null) ||
    (Array.isArray(payload?.data) ? payload.data : null) ||
    (Array.isArray(payload?.accounts) ? payload.accounts : null) ||
    (Array.isArray(payload?.socialAccounts) ? payload.socialAccounts : null) ||
    (Array.isArray(payload?.social_accounts) ? payload.social_accounts : null) ||
    [];

  const platforms: string[] = [];

  for (const r of rows) {
    const p = String(r?.platform || "").toLowerCase().trim();
    const active = r?.is_active;
    // If is_active is missing, assume it's usable; if present, require true.
    if (!p) continue;
    if (active === false) continue;
    platforms.push(p);
  }

  // de-dupe
  return Array.from(new Set(platforms));
}

export default function DashboardHomePage() {
  const [message, setMessage] = useState(
    "Quick check-in from Root Health Ops Dashboard ✅"
  );
  const [imageUrl, setImageUrl] = useState("");

  const [mode, setMode] = useState<Mode>("now");
  const [scheduledAt, setScheduledAt] = useState(""); // datetime-local string

  const [isPosting, setIsPosting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [coachMessage, setCoachMessage] = useState<string | null>(null);

  const [lastResults, setLastResults] = useState<QuickBlastResult[] | null>(
    null
  );

  // Connected platforms from /api/social-accounts
  const [connectedPlatforms, setConnectedPlatforms] = useState<Set<ChannelId>>(
    new Set()
  );
  const [isLoadingPlatforms, setIsLoadingPlatforms] = useState(true);
  const [platformsLoadError, setPlatformsLoadError] = useState<string | null>(
    null
  );

  // Channel selection state (defaults: Facebook on)
  const [sendToFacebook, setSendToFacebook] = useState(true);
  const [sendToInstagram, setSendToInstagram] = useState(false);
  const [sendToLinkedIn, setSendToLinkedIn] = useState(false);
  const [sendToThreads, setSendToThreads] = useState(false);
  const [sendToTikTok, setSendToTikTok] = useState(false);
  const [sendToReddit, setSendToReddit] = useState(false);

  // hard-coded org for now (single-tenant beta)
  const organisationId = "23a054db-7040-40b1-b193-2f43cfa139de";

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setIsLoadingPlatforms(true);
      setPlatformsLoadError(null);

      try {
        const res = await fetch("/api/social-accounts", { method: "GET" });
        const data = await res.json().catch(() => null);

        if (!res.ok) {
          const msg =
            data?.error ||
            data?.message ||
            `Failed to load /api/social-accounts (HTTP ${res.status})`;
          throw new Error(msg);
        }

        const platforms = extractConnectedPlatforms(data);

        // Only allow the ones we support in this UI
        const allowed: ChannelId[] = [
          "facebook",
          "linkedin",
          "instagram",
          "threads",
          "tiktok",
          "reddit",
          "google",
          "email",
          "whatsapp",
        ];

        const set = new Set<ChannelId>();
        for (const p of platforms) {
          const lower = String(p).toLowerCase();
          if (allowed.includes(lower as ChannelId)) {
            set.add(lower as ChannelId);
          }
        }

        if (!cancelled) {
          setConnectedPlatforms(set);

          // If Facebook isn't connected, don't keep it auto-selected.
          if (!set.has("facebook")) setSendToFacebook(false);

          // If LinkedIn is connected and Facebook isn't, auto-select LinkedIn.
          if (!set.has("facebook") && set.has("linkedin")) {
            setSendToLinkedIn(true);
          }
        }
      } catch (e: any) {
        if (!cancelled) {
          setPlatformsLoadError(
            e?.message || "Could not load connected platforms."
          );
          // Keep connectedPlatforms empty (so UI will hide platform buttons)
          setConnectedPlatforms(new Set());
          // Also clear selections (avoid sending to disconnected channels)
          setSendToFacebook(false);
          setSendToInstagram(false);
          setSendToLinkedIn(false);
          setSendToThreads(false);
          setSendToTikTok(false);
          setSendToReddit(false);
        }
      } finally {
        if (!cancelled) setIsLoadingPlatforms(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const buildSelectedChannels = (): ChannelId[] => {
    const chans: ChannelId[] = [];
    const isConnected = (c: ChannelId) => connectedPlatforms.has(c);

    if (sendToFacebook && isConnected("facebook")) chans.push("facebook");
    if (sendToInstagram && isConnected("instagram")) chans.push("instagram");
    if (sendToLinkedIn && isConnected("linkedin")) chans.push("linkedin");
    if (sendToThreads && isConnected("threads")) chans.push("threads");
    if (sendToTikTok && isConnected("tiktok")) chans.push("tiktok");
    if (sendToReddit && isConnected("reddit")) chans.push("reddit");

    return chans;
  };

  const selectedChannels = useMemo(() => buildSelectedChannels(), [
    sendToFacebook,
    sendToInstagram,
    sendToLinkedIn,
    sendToThreads,
    sendToTikTok,
    sendToReddit,
    connectedPlatforms,
  ]);

  const isAnyChannelSelected = selectedChannels.length > 0;

  const callRootCoach = (msg: string) => {
    fetch("/api/ai/root-coach", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        context: "quick_blast",
        errorMessage: msg,
        userAction:
          mode === "now"
            ? "Clicked Quick Blast (send now) on dashboard"
            : "Clicked Quick Blast (schedule) on dashboard",
      }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data && data.coachMessage) {
          setCoachMessage(data.coachMessage);
        }
      })
      .catch(() => {});
  };

  const handleQuickBlast = async () => {
    setIsPosting(true);
    setStatus(null);
    setError(null);
    setCoachMessage(null);
    setLastResults(null);

    try {
      const trimmed = message.trim();

      if (!trimmed) {
        throw new Error("Please write something to send.");
      }

      if (isLoadingPlatforms) {
        throw new Error("Still loading connected platforms… try again in a second.");
      }

      if (platformsLoadError) {
        throw new Error(
          `Could not load connected platforms: ${platformsLoadError}`
        );
      }

      const channels = selectedChannels;

      if (channels.length === 0) {
        throw new Error(
          "Select at least one connected channel (Facebook, LinkedIn, Instagram, Threads)."
        );
      }

      const results: QuickBlastResult[] = [];

      for (const channel of channels) {
        const res = await fetch("/api/social/quick-blast", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: trimmed,
            channel, // single channel per call (matches your API)
            imageUrl,
            organisationId,
          }),
        });

        let data: any = null;
        try {
          data = await res.json();
        } catch {
          data = null;
        }

        // Your API returns { success: true/false, error, details, sent } (per your description)
        const success = Boolean(data?.success);

        if (!res.ok || !success) {
          results.push({
            channel,
            ok: false,
            status: res.status,
            error:
              data?.error ||
              data?.message ||
              `Quick Blast failed for ${channel} (HTTP ${res.status})`,
            details: data?.details,
            sent: data?.sent,
            raw: data,
          });
        } else {
          results.push({
            channel,
            ok: true,
            status: res.status,
            sent: data?.sent,
            raw: data,
          });
        }
      }

      setLastResults(results);

      const successChannels = results.filter((r) => r.ok).map((r) => r.channel);

      if (successChannels.length === 0) {
        // Build a useful, non-generic error message
        const lines = results.map((r) => {
          const detailBits: string[] = [];
          if (r.error) detailBits.push(`error: ${r.error}`);
          if (r.details !== undefined && r.details !== null)
            detailBits.push(`details: ${safeStringify(r.details)}`);
          if (r.sent !== undefined && r.sent !== null)
            detailBits.push(`sent: ${safeStringify(r.sent)}`);
          return `• ${r.channel}: ${detailBits.join(" | ") || "failed"}`;
        });

        throw new Error(
          `Quick Blast failed on all selected channels.\n\n${lines.join("\n")}`
        );
      }

      setStatus(
        `Quick Blast sent via ${successChannels.join(", ")} using Root Health Ops 🎉`
      );
    } catch (err: any) {
      const msg =
        err?.message || "Something went wrong sending your Quick Blast.";
      setError(msg);
      callRootCoach(msg);
    } finally {
      setIsPosting(false);
    }
  };

  const handleSchedule = async () => {
    setIsPosting(true);
    setStatus(null);
    setError(null);
    setCoachMessage(null);
    setLastResults(null);

    try {
      const trimmed = message.trim();

      if (!trimmed) {
        throw new Error("Please write something to schedule.");
      }

      if (isLoadingPlatforms) {
        throw new Error("Still loading connected platforms… try again in a second.");
      }

      if (platformsLoadError) {
        throw new Error(
          `Could not load connected platforms: ${platformsLoadError}`
        );
      }

      const channels = selectedChannels;

      if (channels.length === 0) {
        throw new Error(
          "Select at least one connected channel (Facebook, LinkedIn, Instagram, Threads)."
        );
      }

      if (!scheduledAt) {
        throw new Error("Choose a date and time to schedule this post.");
      }

      const date = new Date(scheduledAt);
      if (isNaN(date.getTime())) {
        throw new Error("The scheduled date/time is not valid.");
      }

      const iso = date.toISOString();

      const res = await fetch("/api/social/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: trimmed,
          platforms: channels,
          imageUrl,
          scheduledAt: iso,
          organisationId,
        }),
      });

      let data: any = null;
      try {
        data = await res.json();
      } catch {
        throw new Error(
          "Server did not return valid JSON from /api/social/schedule."
        );
      }

      if (!data?.success) {
        const msg =
          data?.error ||
          data?.message ||
          "Could not schedule this post. Check channel connections.";
        throw new Error(msg);
      }

      setStatus(
        `Post scheduled via ${channels.join(
          ", "
        )} for ${date.toLocaleString()} using Root Health Ops 📅`
      );
    } catch (err: any) {
      const msg =
        err?.message || "Something went wrong scheduling your post.";
      setError(msg);
      callRootCoach(msg);
    } finally {
      setIsPosting(false);
    }
  };

  const renderChannelResult = (channel: ChannelId) => {
    if (!lastResults) return null;
    const result = lastResults.find((r) => r.channel === channel);
    if (!result) return null;

    if (result.ok) {
      return <span className="text-[10px] text-emerald-300 ml-1">✓ sent</span>;
    }

    return (
      <span className="text-[10px] text-amber-300 ml-1">⚠ failed</span>
    );
  };

  const ChannelPill = ({
    id,
    label,
    dotClass,
    selected,
    onToggle,
  }: {
    id: ChannelId;
    label: string;
    dotClass: string;
    selected: boolean;
    onToggle: () => void;
  }) => {
    // Only show if connected
    if (!connectedPlatforms.has(id)) return null;

    return (
      <button
        type="button"
        onClick={onToggle}
        className={[
          "inline-flex items-center gap-1 rounded-full border px-3 py-1.5 transition",
          selected
            ? "border-emerald-500 bg-emerald-500/10 text-emerald-100"
            : "border-slate-600 bg-slate-900 text-slate-300 hover:border-slate-500",
        ].join(" ")}
      >
        <span className={["h-2 w-2 rounded-full", dotClass].join(" ")} />
        <span>{label}</span>
        {selected && (
          <span className="text-[10px] text-emerald-300 ml-1">selected</span>
        )}
        {renderChannelResult(id)}
      </button>
    );
  };

  const hasAnyConnected =
    connectedPlatforms.size > 0 &&
    (connectedPlatforms.has("facebook") ||
      connectedPlatforms.has("linkedin") ||
      connectedPlatforms.has("instagram") ||
      connectedPlatforms.has("threads") ||
      connectedPlatforms.has("tiktok") ||
      connectedPlatforms.has("reddit"));

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 px-4 py-8 flex justify-center">
      <div className="w-full max-w-6xl space-y-8">
        {/* Top hero / summary */}
        <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-semibold">
              Root Health Ops Dashboard
            </h1>
            <p className="mt-1 text-sm text-slate-300 max-w-xl">
              Post to your channels in a couple of clicks, or schedule content
              ahead. Then drop into campaigns, stories, and metrics when you’re
              ready.
            </p>
          </div>
          <div className="text-xs text-slate-400 bg-slate-900/80 border border-slate-700 rounded-2xl px-4 py-3 max-w-xs">
            <p className="font-medium text-slate-200 mb-1">
              You’re in therapist mode
            </p>
            <p>
              Think like your future customers: connect channels, post gently,
              and watch what lands.
            </p>
          </div>
        </header>

        {/* Main grid: Quick Blast + Overview cards */}
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Quick Blast composer */}
          <section className="lg:col-span-2 rounded-3xl border border-slate-700 bg-slate-900/80 p-5 md:p-6 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="text-base md:text-lg font-semibold">
                  Quick Blast
                </h2>
                <p className="text-[11px] md:text-xs text-slate-400">
                  Share a message right now or schedule it for later across your
                  connected channels.
                </p>
              </div>
              <span className="inline-flex items-center rounded-full border border-emerald-500/50 bg-emerald-500/10 px-3 py-1 text-[11px] font-medium text-emerald-200">
                Live beta · Social engine
              </span>
            </div>

            {/* Connected platforms status */}
            <div className="rounded-2xl border border-slate-700 bg-slate-950/50 p-3">
              <div className="text-[10px] uppercase tracking-wide text-slate-500 mb-1">
                Connected platforms (from /api/social-accounts)
              </div>
              {isLoadingPlatforms ? (
                <div className="text-[11px] text-slate-300">
                  Loading connected platforms…
                </div>
              ) : platformsLoadError ? (
                <div className="text-[11px] text-amber-300">
                  Could not load connected platforms: {platformsLoadError}
                </div>
              ) : (
                <div className="text-[11px] text-slate-300">
                  {connectedPlatforms.size === 0 ? (
                    <span>No connected platforms found.</span>
                  ) : (
                    <span>
                      Connected:{" "}
                      <span className="text-slate-100 font-medium">
                        {Array.from(connectedPlatforms).join(", ")}
                      </span>
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Mode toggle */}
            <div className="flex items-center gap-3 text-[11px]">
              <span className="text-slate-300 font-medium">Mode:</span>
              <div className="inline-flex rounded-full bg-slate-900 border border-slate-700 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setMode("now")}
                  className={[
                    "px-3 py-1.5",
                    mode === "now"
                      ? "bg-emerald-500 text-slate-950"
                      : "text-slate-300",
                  ].join(" ")}
                >
                  Send now
                </button>
                <button
                  type="button"
                  onClick={() => setMode("schedule")}
                  className={[
                    "px-3 py-1.5",
                    mode === "schedule"
                      ? "bg-emerald-500 text-slate-950"
                      : "text-slate-300",
                  ].join(" ")}
                >
                  Schedule
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-[11px] font-medium text-slate-300">
                What do you want to say?
              </label>
              <textarea
                className="w-full min-h-[140px] rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="E.g. a gentle check-in, reminder, or something supportive for your audience."
              />
            </div>

            {/* Image URL field */}
            <div className="space-y-1">
              <label className="block text-[11px] font-medium text-slate-300">
                Image URL (optional, mainly for Instagram/Threads if posting an image)
              </label>
              <input
                type="url"
                className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 placeholder:text-slate-500"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="https://example.com/your-image.jpg"
              />
              <p className="text-[10px] text-slate-500">
                Paste a direct image link (JPG/PNG). Some platforms require a valid image URL for image posts.
              </p>
            </div>

            {/* Schedule fields (only when in schedule mode) */}
            {mode === "schedule" && (
              <div className="space-y-1">
                <label className="block text-[11px] font-medium text-slate-300">
                  When should this go out?
                </label>
                <input
                  type="datetime-local"
                  className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 placeholder:text-slate-500"
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                />
                <p className="text-[10px] text-slate-500">
                  Choose a future date and time. Root Health Ops will hand this
                  to your social engine to post automatically.
                </p>
              </div>
            )}

            {/* Channel selection (ONLY SHOW CONNECTED) */}
            <div className="space-y-2">
              <p className="text-[11px] font-medium text-slate-300">Channels</p>

              {!isLoadingPlatforms && !platformsLoadError && !hasAnyConnected && (
                <div className="text-[11px] text-amber-300">
                  No connected social channels found. Go to Connect to link Facebook/LinkedIn/Instagram/Threads.
                </div>
              )}

              <div className="flex flex-wrap gap-3 text-xs">
                <ChannelPill
                  id="facebook"
                  label="Facebook Page"
                  dotClass="bg-[#1877F2]"
                  selected={sendToFacebook}
                  onToggle={() => setSendToFacebook((prev) => !prev)}
                />

                <ChannelPill
                  id="instagram"
                  label="Instagram"
                  dotClass="bg-pink-500"
                  selected={sendToInstagram}
                  onToggle={() => setSendToInstagram((prev) => !prev)}
                />

                <ChannelPill
                  id="threads"
                  label="Threads"
                  dotClass="bg-white"
                  selected={sendToThreads}
                  onToggle={() => setSendToThreads((prev) => !prev)}
                />

                <ChannelPill
                  id="linkedin"
                  label="LinkedIn"
                  dotClass="bg-sky-500"
                  selected={sendToLinkedIn}
                  onToggle={() => setSendToLinkedIn((prev) => !prev)}
                />

                <ChannelPill
                  id="tiktok"
                  label="TikTok"
                  dotClass="bg-white"
                  selected={sendToTikTok}
                  onToggle={() => setSendToTikTok((prev) => !prev)}
                />

                <ChannelPill
                  id="reddit"
                  label="Reddit"
                  dotClass="bg-orange-500"
                  selected={sendToReddit}
                  onToggle={() => setSendToReddit((prev) => !prev)}
                />
              </div>

              <p className="text-[10px] text-slate-500">
                Only connected platforms are shown here (pulled from /api/social-accounts).
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={mode === "now" ? handleQuickBlast : handleSchedule}
                disabled={
                  isPosting ||
                  !message.trim() ||
                  !isAnyChannelSelected ||
                  isLoadingPlatforms ||
                  Boolean(platformsLoadError) ||
                  (mode === "schedule" && !scheduledAt)
                }
                className="inline-flex items-center rounded-full bg-emerald-500 px-5 py-2 text-sm font-semibold text-slate-950 disabled:opacity-60 disabled:cursor-not-allowed hover:bg-emerald-400 transition"
              >
                {isPosting
                  ? mode === "now"
                    ? "Sending…"
                    : "Scheduling…"
                  : mode === "now"
                  ? "Send Quick Blast"
                  : "Schedule Post"}
              </button>

              {isPosting && (
                <span className="text-[11px] text-slate-400">
                  Talking to your social engine…
                </span>
              )}
            </div>

            {status && (
              <div className="mt-1 text-[11px] text-emerald-400 whitespace-pre-wrap">
                {status}
              </div>
            )}

            {error && (
              <div className="mt-1 text-[11px] text-red-400 whitespace-pre-wrap">
                {error}
              </div>
            )}

            {/* Detailed channel results incl. Ayrshare details/sent */}
            {lastResults && (
              <div className="mt-3 rounded-2xl border border-slate-700 bg-slate-950/70 p-3 text-[11px] text-slate-200 space-y-2">
                <div className="text-[10px] uppercase tracking-wide text-slate-500">
                  Channel status (Ayrshare response surfaced)
                </div>

                {lastResults.map((r) => (
                  <div
                    key={r.channel}
                    className="rounded-xl border border-slate-800 bg-slate-950/60 p-2"
                  >
                    <div className="flex items-center justify-between">
                      <div className="font-medium text-slate-100">
                        {r.ok ? "✓" : "⚠"} {r.channel}
                      </div>
                      <div className="text-[10px] text-slate-500">
                        HTTP {r.status ?? "?"}
                      </div>
                    </div>

                    {r.ok ? (
                      <div className="text-emerald-300 mt-1">
                        Accepted
