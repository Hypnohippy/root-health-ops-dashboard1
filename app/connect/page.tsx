"use client";

import React, { useState } from "react";

export default function ConnectPage() {
  const [fbMessage, setFbMessage] = useState(
    "This is a test post from Root Health Ops."
  );
  const [fbLink, setFbLink] = useState("");
  const [fbStatus, setFbStatus] = useState<string | null>(null);
  const [fbLoading, setFbLoading] = useState(false);

  const handleFacebookTestPost = async () => {
    try {
      setFbLoading(true);
      setFbStatus(null);

      const res = await fetch("/api/social/facebook-test-post", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: fbMessage,
          link: fbLink,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || "Failed to trigger test post");
      }

      setFbStatus("✅ Test post triggered. Check your Facebook Page.");
    } catch (err: any) {
      console.error("[connect] facebook test error", err);
      setFbStatus(
        err?.message ||
          "Something went wrong triggering the test post. Check your webhook URL and try again."
      );
    } finally {
      setFbLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-4xl bg-slate-900/80 border border-slate-700 rounded-3xl shadow-xl p-6 md:p-10 backdrop-blur">
        <header className="mb-6">
          <h1 className="text-2xl md:text-3xl font-semibold">
            Connect your channels
          </h1>
          <p className="mt-2 text-sm text-slate-300 max-w-2xl">
            This is where Root Health Ops plugs into Facebook, Instagram,
            LinkedIn, TikTok and more. Today you can fire a real test post to
            Facebook using your existing Make scenario, so you know the
            pipeline works end-to-end.
          </p>
        </header>

        {/* Channel status cards */}
        <section className="grid gap-4 md:grid-cols-2 text-xs mb-8">
          {[
            { label: "Facebook Page", status: "Test posting available" },
            { label: "Instagram Business", status: "Coming soon" },
            { label: "LinkedIn Page", status: "Coming soon" },
            { label: "TikTok", status: "Coming soon" },
            { label: "Google Business Profile", status: "Coming soon" },
            { label: "Email newsletter", status: "Coming soon" },
          ].map((item) => (
            <div
              key={item.label}
              className="rounded-2xl border border-slate-700 bg-slate-950/80 px-4 py-3 flex items-center justify-between"
            >
              <div>
                <div className="text-slate-100 font-medium">{item.label}</div>
                <div className="text-[11px] text-slate-400">{item.status}</div>
              </div>
              <button
                type="button"
                disabled
                className="rounded-full border border-slate-600 bg-slate-900/80 px-3 py-1.5 text-[11px] text-slate-400 cursor-not-allowed"
              >
                {item.status === "Test posting available"
                  ? "Using webhook"
                  : "Not yet available"}
              </button>
            </div>
          ))}
        </section>

        {/* Facebook test posting panel */}
        <section className="rounded-2xl border border-blue-500/60 bg-blue-500/10 p-4 mb-4 text-sm">
          <h2 className="text-sm font-semibold text-blue-100 mb-2">
            Facebook test post (via Make)
          </h2>
          <p className="text-[11px] text-blue-50/80 mb-3">
            This uses your existing Make scenario. Make sure{" "}
            <span className="font-mono">
              FACEBOOK_TEST_WEBHOOK_URL
            </span>{" "}
            is set in Vercel to your Make webhook URL. Then send a test post
            straight from Root Health Ops.
          </p>

          <div className="space-y-3">
            <div>
              <label className="block text-[11px] text-blue-50 mb-1">
                Message
              </label>
              <textarea
                className="w-full rounded-xl bg-slate-950/70 border border-blue-500/60 px-3 py-2 text-xs text-slate-100"
                value={fbMessage}
                onChange={(e) => setFbMessage(e.target.value)}
                rows={3}
              />
            </div>
            <div>
              <label className="block text-[11px] text-blue-50 mb-1">
                Link (optional)
              </label>
              <input
                className="w-full rounded-xl bg-slate-950/70 border border-blue-500/60 px-3 py-2 text-xs text-slate-100"
                value={fbLink}
                onChange={(e) => setFbLink(e.target.value)}
                placeholder="https://roothealth.app"
              />
            </div>

            {fbStatus && (
              <div className="text-[11px] text-blue-50 mt-1">{fbStatus}</div>
            )}

            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleFacebookTestPost}
                disabled={fbLoading}
                className="rounded-full bg-blue-500 px-4 py-2 text-xs font-semibold text-slate-50 hover:bg-blue-400 disabled:opacity-40"
              >
                {fbLoading ? "Sending…" : "Send test post to Facebook"}
              </button>
            </div>
          </div>
        </section>

        <footer className="text-[11px] text-slate-500">
          As we wire in each platform, this page will light up with real
          “Connect” buttons, status tags and posting options, all guided by Root
          Coach so you&apos;re never left guessing.
        </footer>
      </div>
    </div>
  );
}
