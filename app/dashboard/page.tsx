// app/dashboard/page.tsx
"use client";

import React, { useState } from "react";

type ChannelId =
  | "facebook"
  | "instagram"
  | "linkedin"
  | "tiktok"
  | "google"
  | "email"
  | "whatsapp";

type QuickBlastResult = {
  channel: ChannelId;
  ok: boolean;
  error?: string;
  status?: number;
};

export default function DashboardHomePage() {
  const [message, setMessage] = useState(
    "Quick check-in from Root Health Ops Dashboard ✅"
  );
  const [imageUrl, setImageUrl] = useState(""); // 👈 NEW: Image URL state

  const [isPosting, setIsPosting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [coachMessage, setCoachMessage] = useState<string | null>(null);

  // Channel selection state – facebook on by default, others off but available
  const [sendToFacebook, setSendToFacebook] = useState(true);
  const [sendToInstagram, setSendToInstagram] = useState(false);
  const [sendToLinkedIn, setSendToLinkedIn] = useState(false);
  const [sendToTikTok, setSendToTikTok] = useState(false);

  const [lastResults, setLastResults] = useState<QuickBlastResult[] | null>(
    null
  );

  const buildSelectedChannels = (): ChannelId[] => {
    const chans: ChannelId[] = [];
    if (sendToFacebook) chans.push("facebook");
    if (sendToInstagram) chans.push("instagram");
    if (sendToLinkedIn) chans.push("linkedin");
    if (sendToTikTok) chans.push("tiktok");
    return chans;
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

      const res = await fetch("/api/social/quick-blast", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    message,
    platforms: selectedChannel ? [selectedChannel] : [],
    imageUrl,
  }),
});



      let data: any = null;
      try {
        data = await res.json();
      } catch {
        throw new Error(
          "Server did not return valid JSON. Check the /api/social/quick-blast route."
        );
      }

      if (!res.ok) {
        const msg =
          data?.error ||
          "Quick Blast failed for all selected channels. Check your connections.";
        setError(msg);
        if (data?.results) {
          setLastResults(data.results as QuickBlastResult[]);
        }
        throw new Error(msg);
      }

      const results: QuickBlastResult[] = data.results || [];
      setLastResults(results);

      const successChannels = results
        .filter((r) => r.ok)
        .map((r) => r.channel);

      if (successChannels.length === 0) {
        throw new Error(
          "Quick Blast did not succeed on any channel. Check your connections."
        );
      }

      setStatus(
        `Quick Blast sent via ${successChannels.join(", ")} using Root Health Ops 🎉`
      );
    } catch (err: any) {
      const msg =
        err?.message || "Something went wrong sending your Quick Blast.";
      setError(msg);

      // Ask Root Coach to help if something breaks
      fetch("/api/ai/root-coach", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          context: "quick_blast",
          errorMessage: msg,
          userAction:
            "Clicked Quick Blast on the dashboard (app/dashboard/page.tsx)",
        }),
      })
        .then((res) => res.json())
        .then((data) => {
          if (data && data.coachMessage) {
            setCoachMessage(data.coachMessage);
          }
        })
        .catch(() => {});
    } finally {
      setIsPosting(false);
    }
  };

  const isAnyChannelSelected =
    sendToFacebook || sendToInstagram || sendToLinkedIn || sendToTikTok;

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
              Post to your channels in a couple of clicks, then drop into
              campaigns, stories, and metrics when you’re ready.
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
                  A fast way to share a message across your channels. Behind
                  the scenes, Root Health talks to your Make scenarios so
                  therapists never have to touch tokens or dev tools.
                </p>
              </div>
              <span className="inline-flex items-center rounded-full border border-emerald-500/50 bg-emerald-500/10 px-3 py-1 text-[11px] font-medium text-emerald-200">
                Live beta · Make-powered
              </span>
            </div>

            <div className="space-y-2">
              <label className="block text-[11px] font-medium text-slate-300">
                What do you want to say?
              </label>
              <textarea
                className="w-full min-h-[140px] rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="E.g. A gentle check-in message, a reminder, or something supportive for your audience."
              />
            </div>

            {/* NEW: Image URL field */}
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
              </div>
              <p className="text-[10px] text-slate-500">
                Facebook is wired via your existing Make webhook. Other
                channels will light up as you add their Make webhook URLs in
                Vercel.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleQuickBlast}
                disabled={isPosting || !message.trim() || !isAnyChannelSelected}
                className="inline-flex items-center rounded-full bg-emerald-500 px-5 py-2 text-sm font-semibold text-slate-950 disabled:opacity-60 disabled:cursor-not-allowed hover:bg-emerald-400 transition"
              >
                {isPosting ? "Sending…" : "Send Quick Blast"}
              </button>

              {isPosting && (
                <span className="text-[11px] text-slate-400">
                  Talking to your Make scenarios…
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
                Use Quick Blast to share something supportive, then explore{" "}
                <span className="font-medium">Connect</span> to wire more
                channels and <span className="font-medium">Campaigns</span> to
                turn ideas into sequences.
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
                  ensure each card is wired to its Make scenario.
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
                  to turn the best ideas into scheduled posts via Make.
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
                Quick Blast now uses a single Make-powered endpoint for all
                channels. Coaches stay in a simple UI while your scenarios
                handle Facebook, Instagram, LinkedIn, and more.
              </p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
