"use client";

import React, { useState } from "react";

export default function ConnectPage() {
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [testingLinkedIn, setTestingLinkedIn] = useState(false);
  const [testingFacebook, setTestingFacebook] = useState(false);

  async function postLinkedInTest() {
    try {
      setTestingLinkedIn(true);
      setMessage(null);
      setError(null);

      const res = await fetch("/api/linkedin/post", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text:
            "Testing Root Health Ops LinkedIn connection – posted from the Connect page 🌱",
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to post to LinkedIn.");
        return;
      }

      setMessage("Posted a test update to LinkedIn successfully 🟢");
    } catch (e: any) {
      setError(e?.message || "Unknown error posting to LinkedIn.");
    } finally {
      setTestingLinkedIn(false);
    }
  }

  async function postFacebookTest() {
    try {
      setTestingFacebook(true);
      setMessage(null);
      setError(null);

      const res = await fetch("/api/facebook/post", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to trigger Facebook posting.");
        return;
      }

      setMessage("Told Make to post a test update to Facebook 🟢");
    } catch (e: any) {
      setError(e?.message || "Unknown error posting to Facebook.");
    } finally {
      setTestingFacebook(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-50">
      <div className="mx-auto max-w-6xl px-4 py-8 space-y-6">
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold">Connect Accounts</h1>
          <p className="text-sm text-slate-300">
            Hook up the services you use. We&apos;ll automate posting, listening,
            and analytics.
          </p>
        </header>

        {(message || error) && (
          <div className="space-y-2">
            {message && (
              <div className="rounded-lg border border-emerald-400/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
                {message}
              </div>
            )}
            {error && (
              <div className="rounded-lg border border-red-400/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                {error}
              </div>
            )}
          </div>
        )}

        {/* Summary panel */}
        <section className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-4 shadow-lg flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-medium text-slate-200">Status</p>
            <p className="text-sm text-slate-100">1 / 5 connected</p>
            <p className="mt-2 text-xs text-slate-300">
              Recommended: start with LinkedIn for posting & replies.
            </p>
          </div>
          <div className="text-xs text-slate-300 space-y-1">
            <p>
              <span className="font-semibold text-slate-100">Next:</span> Enable
              Facebook via Make, then Google (ads) & Stripe (billing) once
              you&apos;re ready to scale.
            </p>
          </div>
        </section>

        {/* Services grid */}
        <div className="grid gap-4 md:grid-cols-2">
          {/* LinkedIn card */}
          <section className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 backdrop-blur-xl p-4 shadow-lg space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold flex items-center gap-2">
                  LinkedIn
                  <span className="inline-flex items-center rounded-full bg-emerald-400/20 px-2 py-0.5 text-[10px] font-medium text-emerald-200 border border-emerald-400/40">
                    Connected
                  </span>
                </h2>
                <p className="text-xs text-emerald-100">
                  Post updates, read comments on your posts, and pull basic
                  engagement analytics.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled
                className="inline-flex items-center rounded-full border border-emerald-300/60 bg-emerald-300/10 px-3 py-1.5 text-[11px] font-medium text-emerald-100 cursor-default"
              >
                Disconnect (coming soon)
              </button>
              <button
                type="button"
                onClick={postLinkedInTest}
                disabled={testingLinkedIn}
                className="inline-flex items-center rounded-full border border-emerald-300/80 bg-emerald-400 px-3 py-1.5 text-[11px] font-medium text-slate-950 shadow-md hover:bg-emerald-300 disabled:opacity-60"
              >
                {testingLinkedIn ? "Posting..." : "Post a LinkedIn test now"}
              </button>
            </div>

            <p className="text-[11px] text-emerald-100/90">
              This sends a simple test update to your LinkedIn feed using the
              Root Health Ops connection, so you can confirm everything is wired
              correctly.
            </p>
          </section>

          {/* Facebook card */}
          <section className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-4 shadow-lg space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold">Facebook</h2>
                <p className="text-xs text-slate-300">
                  Post to your Page via Make. Full multi-user OAuth will come
                  later; for now this connects your own Page.
                </p>
              </div>
              <span className="inline-flex items-center rounded-full bg-emerald-400/15 px-2 py-0.5 text-[10px] font-medium text-emerald-200 border border-emerald-400/40">
                Connected (via Make)
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={postFacebookTest}
                disabled={testingFacebook}
                className="inline-flex items-center rounded-full border border-sky-400/80 bg-sky-400 px-3 py-1.5 text-[11px] font-medium text-slate-950 shadow-md hover:bg-sky-300 disabled:opacity-60"
              >
                {testingFacebook ? "Posting..." : "Post a Facebook test now"}
              </button>
            </div>
            <p className="text-[11px] text-slate-300/90">
              This calls your Make webhook, which in turn posts a fixed caption +
              link to your connected Facebook Page. Later we&apos;ll wire this
              to campaigns and stories.
            </p>
          </section>

          {/* Instagram card */}
          <section className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-4 shadow-lg space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold">Instagram</h2>
                <p className="text-xs text-slate-300">
                  Schedule posts via Instagram Business (through Meta). Analytics
                  coming soon.
                </p>
              </div>
              <span className="inline-flex items-center rounded-full bg-slate-500/10 px-2 py-0.5 text-[10px] font-medium text-slate-300 border border-slate-500/40">
                Not connected
              </span>
            </div>
            <button
              type="button"
              disabled
              className="inline-flex items-center rounded-full border border-white/20 bg-white/5 px-3 py-1.5 text-[11px] font-medium text-slate-200 cursor-not-allowed"
            >
              Unavailable (coming soon)
            </button>
          </section>

          {/* Google card */}
          <section className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-4 shadow-lg space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold">Google</h2>
                <p className="text-xs text-slate-300">
                  Google Ads & Calendar (for discovery calls). Use budget + goal
                  to auto-plan campaigns.
                </p>
              </div>
              <span className="inline-flex items-center rounded-full bg-slate-500/10 px-2 py-0.5 text-[10px] font-medium text-slate-300 border border-slate-500/40">
                Not connected
              </span>
            </div>
            <button
              type="button"
              disabled
              className="inline-flex items-center rounded-full border border-white/20 bg-white/5 px-3 py-1.5 text-[11px] font-medium text-slate-200 cursor-not-allowed"
            >
              Unavailable (coming soon)
            </button>
          </section>

          {/* Stripe card */}
          <section className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-4 shadow-lg space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold">Stripe</h2>
                <p className="text-xs text-slate-300">
                  Billing & plans. Track MRR and take payments for your coaching
                  programs.
                </p>
              </div>
              <span className="inline-flex items-center rounded-full bg-slate-500/10 px-2 py-0.5 text-[10px] font-medium text-slate-300 border border-slate-500/40">
                Not connected
              </span>
            </div>
            <button
              type="button"
              disabled
              className="inline-flex items-center rounded-full border border-white/20 bg-white/5 px-3 py-1.5 text-[11px] font-medium text-slate-200 cursor-not-allowed"
            >
              Unavailable (coming soon)
            </button>
          </section>
        </div>
      </div>
    </div>
  );
}
