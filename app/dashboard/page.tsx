// app/dashboard/page.tsx
"use client";

import React, { useState } from "react";

type ChannelId =
  | "facebook"
  | "instagram"
  | "linkedin"
  | "tiktok"
  | "reddit"
  | "google"
  | "email"
  | "whatsapp";

type QuickBlastResult = {
  channel: ChannelId;
  ok: boolean;
  error?: string;
  status?: number;
};

type Mode = "now" | "schedule";

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

  // Channel selection state
  const [sendToFacebook, setSendToFacebook] = useState(true);
  const [sendToInstagram, setSendToInstagram] = useState(false);
  const [sendToLinkedIn, setSendToLinkedIn] = useState(false);
  const [sendToTikTok, setSendToTikTok] = useState(false);
  const [sendToReddit, setSendToReddit] = useState(false);

  const [lastResults, setLastResults] = useState<QuickBlastResult[] | null>(
    null
  );

  // 👇 ADD THIS: hard-coded org for now (replace with your real org ID)
  const organisationId = "e83aeab8-69bf-4405-b34f-c13c6fa4bfd5";

  const buildSelectedChannels = (): ChannelId[] => {
    const chans: ChannelId[] = [];
    if (sendToFacebook) chans.push("facebook");
    if (sendToInstagram) chans.push("instagram");
    if (sendToLinkedIn) chans.push("linkedin");
    if (sendToTikTok) chans.push("tiktok");
    if (sendToReddit) chans.push("reddit");
    return chans;
  };

  const isAnyChannelSelected =
    sendToFacebook ||
    sendToInstagram ||
    sendToLinkedIn ||
    sendToTikTok ||
    sendToReddit;

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

      const channels = buildSelectedChannels();

      if (channels.length === 0) {
        throw new Error("Select at least one channel (e.g. Facebook).");
      }

      const results: QuickBlastResult[] = [];

      for (const channel of channels) {
        const res = await fetch("/api/social/quick-blast", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: trimmed,
            channel, // single channel per call
            imageUrl,
            organisationId, // 👈 now actually sent
          }),
        });

        let data: any = null;
        try {
          data = await res.json();
        } catch {
          // ignore JSON parse errors, we'll treat as generic failure
        }

        if (!data || data.success === false) {
          const errText =
            data?.error ||
            data?.message ||
            (data ? JSON.stringify(data) : null) ||
            "Quick Blast failed for this channel. Check your social setup.";

          results.push({
            channel,
            ok: false,
            error: errText,
          });
        } else {
          results.push({
            channel,
            ok: true,
          });
        }
      }

      setLastResults(results);

      const successChannels = results.filter((r) => r.ok).map((r) => r.channel);

      if (successChannels.length === 0) {
        throw new Error(
          "Quick Blast did not succeed on any channel. Check your Ayrshare connections or plan."
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

      const channels = buildSelectedChannels();

      if (channels.length === 0) {
        throw new Error("Select at least one channel (e.g. Facebook).");
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
          organisationId, // 👈 now actually sent
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
          "Could not schedule this post. Please check your channels or plan.";
        setError(msg);
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
      return (
        <span className="text-[10px] text-emerald-300 ml-1">
          ✓ sent
        </span>
      );
    }

    return (
      <span className="text-[10px] text-amber-300 ml-1">
        ⚠ {result.error ? "check setup" : "failed"}
      </span>
    );
  };

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
                Image URL (optional, mainly for Instagram)
              </label>
              <input
                type="url"
                className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 placeholder:text-slate-500"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="https://example.com/your-image.jpg"
              />
              <p className="text-[10px] text-slate-500">
                Paste a direct image link (JPG/PNG). Instagram requires a valid
                image URL for photo posts. You can leave this blank for
                Facebook-only blasts.
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

            {/* Channel selection */}
            <div className="space-y-2">
              <p className="text-[11px] font-medium text-slate-300">
                Channels
              </p>
              <div className="flex flex-wrap gap-3 text-xs">
                <button
                  type="button"
                  onClick={() => setSendToFacebook((prev) => !prev)}
                  className={[
                    "inline-flex items-center gap-1 rounded-full border px-3 py-1.5 transition",
                    sendToFacebook
                      ? "border-emerald-500 bg-emerald-500/10 text-emerald-100"
                      : "border-slate-600 bg-slate-900 text-slate-300 hover:border-slate-500",
                  ].join(" ")}
                >
                  <span className="h-2 w-2 rounded-full bg-[#1877F2]" />
                  <span>Facebook Page</span>
                  {sendToFacebook && (
                    <span className="text-[10px] text-emerald-300 ml-1">
                      selected
                    </span>
                  )}
                  {renderChannelResult("facebook")}
                </button>

                <button
                  type="button"
                  onClick={() => setSendToInstagram((prev) => !prev)}
                  className={[
                    "inline-flex items-center gap-1 rounded-full border px-3 py-1.5 transition",
                    sendToInstagram
                      ? "border-emerald-500 bg-emerald-500/10 text-emerald-100"
                      : "border-slate-600 bg-slate-900 text-slate-300 hover:border-slate-500",
                  ].join(" ")}
                >
                  <span className="h-2 w-2 rounded-full bg-pink-500" />
                  <span>Instagram</span>
                  {sendToInstagram && (
                    <span className="text-[10px] text-emerald-300 ml-1">
                      selected
                    </span>
                  )}
                  {renderChannelResult("instagram")}
                </button>

                <button
                  type="button"
                  onClick={() => setSendToLinkedIn((prev) => !prev)}
                  className={[
                    "inline-flex items-center gap-1 rounded-full border px-3 py-1.5 transition",
                    sendToLinkedIn
                      ? "border-emerald-500 bg-emerald-500/10 text-emerald-100"
                      : "border-slate-600 bg-slate-900 text-slate-300 hover:border-slate-500",
                  ].join(" ")}
                >
                  <span className="h-2 w-2 rounded-full bg-sky-500" />
                  <span>LinkedIn</span>
                  {sendToLinkedIn && (
                    <span className="text-[10px] text-emerald-300 ml-1">
                      selected
                    </span>
                  )}
                  {renderChannelResult("linkedin")}
                </button>

                <button
                  type="button"
                  onClick={() => setSendToTikTok((prev) => !prev)}
                  className={[
                    "inline-flex items-center gap-1 rounded-full border px-3 py-1.5 transition",
                    sendToTikTok
                      ? "border-emerald-500 bg-emerald-500/10 text-emerald-100"
                      : "border-slate-600 bg-slate-900 text-slate-300 hover:border-slate-500",
                  ].join(" ")}
                >
                  <span className="h-2 w-2 rounded-full bg-white" />
                  <span>TikTok</span>
                  {sendToTikTok && (
                    <span className="text-[10px] text-emerald-300 ml-1">
                      selected
                    </span>
                  )}
                  {renderChannelResult("tiktok")}
                </button>

                <button
                  type="button"
                  onClick={() => setSendToReddit((prev) => !prev)}
                  className={[
                    "inline-flex items-center gap-1 rounded-full border px-3 py-1.5 transition",
                    sendToReddit
                      ? "border-emerald-500 bg-emerald-500/10 text-emerald-100"
                      : "border-slate-600 bg-slate-900 text-slate-300 hover:border-slate-500",
                  ].join(" ")}
                >
                  <span className="h-2 w-2 rounded-full bg-orange-500" />
                  <span>Reddit</span>
                  {sendToReddit && (
                    <span className="text-[10px] text-emerald-300 ml-1">
                      selected
                    </span>
                  )}
                  {renderChannelResult("reddit")}
                </button>
              </div>
              <p className="text-[10px] text-slate-500">
                Facebook, Instagram, LinkedIn and more are powered by your
                unified social engine connection. TikTok and advanced features
                unlock on higher plans.
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
              <div className="mt-1 text-[11px] text-emerald-400">{status}</div>
            )}

            {error && (
              <div className="mt-1 text-[11px] text-red-400">{error}</div>
            )}

            {lastResults && (
              <div className="mt-3 rounded-2xl border border-slate-700 bg-slate-950/70 p-3 text-[11px] text-slate-200 space-y-1">
                <div className="text-[10px] uppercase tracking-wide text-slate-500">
                  Channel status
                </div>
                {lastResults.map((r) => (
                  <div key={r.channel}>
                    {r.ok ? (
                      <span className="text-emerald-300">
                        ✓ {r.channel} accepted Quick Blast
                      </span>
                    ) : (
                      <span className="text-amber-300">
                        ⚠ {r.channel}: {r.error || "Check connection setup."}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}

            {coachMessage && (
              <div className="mt-3 rounded-2xl border border-sky-500/40 bg-sky-950/40 p-3">
                <div className="text-[10px] uppercase tracking-wide text-sky-300 mb-1">
                  Root Coach
                </div>
                <div className="text-[11px] text-sky-50 whitespace-pre-wrap">
                  {coachMessage}
                </div>
              </div>
            )}
          </section>

          {/* Right column: overview / links into other tabs */}
          <section className="space-y-4">
            <div className="rounded-3xl border border-slate-700 bg-slate-900/80 p-4 space-y-2 text-sm">
              <p className="text-[11px] uppercase tracking-wide text-slate-500">
                Today’s focus
              </p>
              <p className="text-slate-100">
                Use Quick Blast to send something supportive now, or schedule a
                few posts for the week ahead. Then explore{" "}
                <span className="font-medium">Connect</span> to wire more
                channels and <span className="font-medium">Campaigns</span> to
                turn the best ideas into sequences.
              </p>
            </div>

            <div className="rounded-3xl border border-slate-700 bg-slate-900/80 p-4 space-y-3 text-xs">
              <p className="text-[11px] uppercase tracking-wide text-slate-500">
                Next steps in your Ops workspace
              </p>
              <ul className="space-y-2 text-slate-300">
                <li>
                  • Use{" "}
                  <span className="font-medium text-slate-100">Connect</span> to
                  ensure each card is wired to your social engine.
                </li>
                <li>
                  • Visit{" "}
                  <span className="font-medium text-slate-100">
                    🧠 Brainstorm
                  </span>{" "}
                  to generate scripts and content.
                </li>
                <li>
                  • Use{" "}
                  <span className="font-medium text-slate-100">Campaigns</span>{" "}
                  to turn the best ideas into scheduled posts.
                </li>
                <li>
                  • Later,{" "}
                  <span className="font-medium text-slate-100">Metrics</span>{" "}
                  will show how content performs across channels.
                </li>
              </ul>
            </div>

            <div className="rounded-3xl border border-slate-700 bg-slate-900/80 p-4 text-xs text-slate-400">
              <p className="text-[11px] uppercase tracking-wide text-slate-500 mb-1">
                Note
              </p>
              <p>
                Quick Blast and scheduling now use a single social engine
                endpoint for all channels. Therapists stay in a simple UI while
                Root Health handles the complex API work under the surface.
              </p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
