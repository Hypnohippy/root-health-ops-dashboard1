'use client';

import React, { useState } from 'react';

export default function ConnectPage() {
  const [testMessage, setTestMessage] = useState(
    'This is a test post from Root Health Ops Dashboard ✅'
  );
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [coachMessage, setCoachMessage] = useState<string | null>(null);

  const sendTestPost = async () => {
    setIsLoading(true);
    setError(null);
    setStatus(null);
    setCoachMessage(null);

    try {
      const res = await fetch('/api/facebook-test-post', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: testMessage,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to send test post');
      }

      setStatus('Test post sent successfully to Facebook via Make 🎉');
    } catch (err: any) {
      const message =
        err?.message || 'Something went wrong sending the test post.';
      setError(message);

      // Ask Root Coach what to do next
      fetch('/api/ai/root-coach', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          context: 'facebook_test_post',
          errorMessage: message,
          userAction:
            'Tried to send Facebook Test Post from Connect page in Root Health Ops Dashboard',
        }),
      })
        .then((res) => res.json())
        .then((data) => {
          if (data && data.coachMessage) {
            setCoachMessage(data.coachMessage);
          }
        })
        .catch(() => {
          // silently ignore Root Coach failure
        });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50">
      <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">
        <header className="space-y-2">
          <h1 className="text-3xl font-bold">
            Connect Channels &amp; Facebook Test Post
          </h1>
          <p className="text-slate-300 text-sm">
            Wire up your social channels and fire a live Facebook test post via
            Make. If anything breaks, Root Coach will help you debug it.
          </p>
        </header>

        {/* Channel tiles */}
        <section className="grid gap-4 md:grid-cols-3">
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-2">
            <h2 className="font-semibold">Facebook Page</h2>
            <p className="text-xs text-slate-400">
              Connect your Facebook Page for outbound posts and campaign
              tracking.
            </p>
            <button
              className="mt-2 inline-flex items-center justify-center rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-medium hover:bg-slate-700"
              type="button"
            >
              Connect / Refresh
            </button>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-2 opacity-60">
            <h2 className="font-semibold">Instagram</h2>
            <p className="text-xs text-slate-400">
              Coming soon – post reels & stories from Root Health Ops.
            </p>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-2 opacity-60">
            <h2 className="font-semibold">TikTok</h2>
            <p className="text-xs text-slate-400">
              Coming soon – viral short-form sequences for your brand.
            </p>
          </div>
        </section>

        {/* Facebook Test Post Panel */}
        <section className="mt-6 rounded-2xl border border-emerald-500/30 bg-slate-900/70 p-6 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-xl font-semibold">Facebook Test Post</h2>
              <p className="text-xs text-slate-400">
                Sends a live test payload to your Make webhook (
                <code className="text-[10px] bg-slate-800 px-1 py-0.5 rounded">
                  FACEBOOK_TEST_WEBHOOK_URL
                </code>
                ). Use this to confirm your pipeline is alive end-to-end.
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-medium text-slate-300">
              Test Message
            </label>
            <textarea
              className="w-full min-h-[120px] rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
              value={testMessage}
              onChange={(e) => setTestMessage(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={sendTestPost}
              disabled={isLoading || !testMessage.trim()}
              className="inline-flex items-center rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-60 disabled:cursor-not-allowed hover:bg-emerald-400 transition"
            >
              {isLoading ? 'Sending…' : 'Send Facebook Test Post'}
            </button>

            {isLoading && (
              <span className="text-xs text-slate-400">
                Talking to Make &amp; Facebook…
              </span>
            )}
          </div>

          {status && (
            <div className="mt-2 text-xs text-emerald-400">
              {status}
            </div>
          )}

          {error && (
            <div className="mt-2 text-xs text-red-400">
              {error}
            </div>
          )}

          {coachMessage && (
            <div className="mt-3 rounded-lg border border-sky-500/40 bg-sky-950/40 p-3">
              <div className="text-[10px] uppercase tracking-wide text-sky-300 mb-1">
                Root Coach
              </div>
              <div className="text-xs text-sky-50 whitespace-pre-wrap">
                {coachMessage}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
