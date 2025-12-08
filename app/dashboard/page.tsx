// app/dashboard/page.tsx
"use client";

import React, { useState } from "react";

export default function DashboardHomePage() {
  const [message, setMessage] = useState(
    "Quick check-in from Root Health Ops Dashboard ✅"
  );
  const [isPosting, setIsPosting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [coachMessage, setCoachMessage] = useState<string | null>(null);

  // For now we support Facebook directly via Graph API
  const [sendToFacebook, setSendToFacebook] = useState(true);

  const handleQuickBlast = async () => {
    setIsPosting(true);
    setStatus(null);
    setError(null);
    setCoachMessage(null);

    try {
      if (!message.trim()) {
        throw new Error("Please write something to send.");
      }

      if (!sendToFacebook) {
        throw new Error("Select at least one channel (Facebook for now).");
      }

      const res = await fetch("/api/facebook/post-direct", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message,
          origin: "quick_blast",
        }),
      });

      let data: any = null;
      try {
        data = await res.json();
      } catch {
        throw new Error(
          "Server did not return valid JSON. Check the /api/facebook/post-direct route."
        );
      }

      if (!res.ok) {
        throw new Error(data.error || "Failed to send Quick Blast.");
      }

      setStatus("Quick Blast posted directly to your Facebook Page 🎉");
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
                  A fast way to share a message across your channels. Start
                  with Facebook, layer in LinkedIn and others as we wire them.
                </p>
              </div>
              <span className="inline-flex items-center rounded-full border border-emerald-500/50 bg-emerald-500/10 px-3 py-1 text-[11px] font-medium text-emerald-200">
                Live beta
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

            {/* Channel selection – for now, only Facebook is wired */}
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
                    <span className="text-[10px] text-emerald-300">
                      selected
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  disabled
                  className="inline-flex items-center gap-1 rounded-full border border-slate-700 bg-slate-900/60 px-3 py-1.5 text-slate-500 cursor-not-allowed"
                >
                  <span className="h-2 w-2 rounded-full bg-pink-500/60" />
                  <span>Instagram (soon)</span>
                </button>

                <button
                  type="button"
                  disabled
                  className="inline-flex items-center gap-1 rounded-full border border-slate-700 bg-slate-900/60 px-3 py-1.5 text-slate-500 cursor-not-allowed"
                >
                  <span className="h-2 w-2 rounded-full bg-sky-500/60" />
                  <span>LinkedIn (soon)</span>
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleQuickBlast}
                disabled={isPosting || !message.trim() || !sendToFacebook}
                className="inline-flex items-center rounded-full bg-emerald-500 px-5 py-2 text-sm font-semibold text-slate-950 disabled:opacity-60 disabled:cursor-not-allowed hover:bg-emerald-400 transition"
              >
                {isPosting ? "Sending…" : "Send Quick Blast"}
              </button>

              {isPosting && (
                <span className="text-[11px] text-slate-400">
                  Talking directly to Facebook…
                </span>
              )}
            </div>

            {status && (
              <div className="mt-1 text-[11px] text-emerald-400">{status}</div>
            )}

            {error && (
              <div className="mt-1 text-[11px] text-red-400">{error}</div>
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
                <span className="font-medium">Brainstorm</span> or{" "}
                <span className="font-medium">Campaigns</span> to build more
                structured content.
              </p>
            </div>

            <div className="rounded-3xl border border-slate-700 bg-slate-900/80 p-4 space-y-3 text-xs">
              <p className="text-[11px] uppercase tracking-wide text-slate-500">
                Next steps in your Ops workspace
              </p>
              <ul className="space-y-2 text-slate-300">
                <li>
                  • Check{" "}
                  <span className="font-medium text-slate-100">Connect</span> to
                  ensure Facebook shows as connected.
                </li>
                <li>
                  • Visit{" "}
                  <span className="font-medium text-slate-100">🧠 Brainstorm</span>{" "}
                  to generate ideas and scripts.
                </li>
                <li>
                  • Use{" "}
                  <span className="font-medium text-slate-100">Campaigns</span>{" "}
                  to turn the best ideas into sequences and scheduled posts.
                </li>
                <li>
                  • Later,{" "}
                  <span className="font-medium text-slate-100">Metrics</span>{" "}
                  will show how your content performs.
                </li>
              </ul>
            </div>

            <div className="rounded-3xl border border-slate-700 bg-slate-900/80 p-4 text-xs text-slate-400">
              <p className="text-[11px] uppercase tracking-wide text-slate-500 mb-1">
                Note
              </p>
              <p>
                This is your live beta cockpit. Quick Blast now talks directly
                to Facebook. We can retire Make for posting bit by bit.
              </p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
