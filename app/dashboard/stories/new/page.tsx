// app/dashboard/stories/new/page.tsx
"use client";

import React, { useState } from "react";

type ChannelId = "facebook" | "instagram" | "linkedin" | "tiktok" | "reddit";

const ORG_ID = "23a054db-7040-40b1-b193-2f43cfa139de";

export default function NewStoryPage() {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [platform, setPlatform] = useState<ChannelId>("linkedin");
  const [imageUrl, setImageUrl] = useState("");

  const [scheduledAt, setScheduledAt] = useState("");
  const [isScheduling, setIsScheduling] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const combinedMessage = () => {
    const t = title.trim();
    const b = body.trim();
    if (t && b) return `${t}\n\n${b}`;
    if (b) return b;
    return t;
  };

  const handleScheduleStory = async () => {
    setIsScheduling(true);
    setStatus(null);
    setError(null);

    try {
      const msg = combinedMessage();

      if (!msg) {
        throw new Error("Please add a story title or body before scheduling.");
      }

      if (!scheduledAt) {
        throw new Error("Choose a date and time for this story to go out.");
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
          message: msg,
          platforms: [platform],
          imageUrl: imageUrl || undefined,
          scheduledAt: iso,
          organisationId: ORG_ID,
        }),
      });

      let data: any = null;
      try {
        data = await res.json();
      } catch {
        // ignore parse issue, treat as error if not ok
      }

      if (!res.ok || !data?.success) {
        const msgText =
          data?.error ||
          data?.message ||
          "Could not schedule this story. Please check your connections or plan.";
        throw new Error(msgText);
      }

      setStatus(
        `Story scheduled for ${date.toLocaleString()} on ${platform}. You can see it in Scheduled Posts.`
      );
    } catch (err: any) {
      const msg =
        err?.message || "Something went wrong scheduling this story.";
      setError(msg);
    } finally {
      setIsScheduling(false);
    }
  };

  const canSchedule =
    !!combinedMessage() && !!scheduledAt && !isScheduling && !!platform;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 px-4 py-8 flex justify-center">
      <div className="w-full max-w-5xl space-y-8">
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-semibold">
              New Story / Series Post
            </h1>
            <p className="mt-1 text-sm text-slate-300 max-w-xl">
              Draft a deeper story, then schedule it to go out via your social
              engine. This now feeds directly into{" "}
              <span className="font-medium">Scheduled Posts</span>.
            </p>
          </div>
        </header>

        {/* Story builder */}
        <section className="rounded-3xl border border-slate-700 bg-slate-900/80 p-5 md:p-6 space-y-5">
          {/* Title */}
          <div className="space-y-2">
            <label className="block text-[11px] font-medium text-slate-300">
              Story title (optional)
            </label>
            <input
              type="text"
              className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 placeholder:text-slate-500"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="E.g. Beneath the Surface"
            />
          </div>

          {/* Body */}
          <div className="space-y-2">
            <label className="block text-[11px] font-medium text-slate-300">
              Story body
            </label>
            <textarea
              className="w-full min-h-[200px] rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Write the main story you want to share with your audience."
            />
          </div>

          {/* Image URL */}
          <div className="space-y-1">
            <label className="block text-[11px] font-medium text-slate-300">
              Image URL (optional)
            </label>
            <input
              type="url"
              className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 placeholder:text-slate-500"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="https://example.com/story-image.jpg"
            />
            <p className="text-[10px] text-slate-500">
              Optional. For image-based posts (esp. Instagram), paste a direct
              JPG/PNG URL.
            </p>
          </div>

          {/* Platform + schedule */}
          <div className="grid md:grid-cols-2 gap-4">
            {/* Platform */}
            <div className="space-y-2">
              <p className="text-[11px] font-medium text-slate-300">
                Platform
              </p>
              <div className="flex flex-wrap gap-2 text-xs">
                {(
                  [
                    "facebook",
                    "instagram",
                    "linkedin",
                    "reddit",
                    "tiktok",
                  ] as ChannelId[]
                ).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPlatform(p)}
                    className={[
                      "inline-flex items-center gap-1 rounded-full border px-3 py-1.5 transition",
                      platform === p
                        ? "border-emerald-500 bg-emerald-500/10 text-emerald-100"
                        : "border-slate-600 bg-slate-900 text-slate-300 hover:border-slate-500",
                    ].join(" ")}
                  >
                    <span className="capitalize">{p}</span>
                    {platform === p && (
                      <span className="text-[10px] text-emerald-300 ml-1">
                        selected
                      </span>
                    )}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-slate-500">
                Stories are usually strongest on LinkedIn and Facebook, but you
                can still schedule them elsewhere.
              </p>
            </div>

            {/* Schedule */}
            <div className="space-y-2">
              <label className="block text-[11px] font-medium text-slate-300">
                When should this story go out?
              </label>
              <input
                type="datetime-local"
                className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 placeholder:text-slate-500"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
              />
              <p className="text-[10px] text-slate-500">
                Root Health Ops will hand this to your social engine at the
                chosen time.
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleScheduleStory}
              disabled={!canSchedule}
              className="inline-flex items-center rounded-full bg-emerald-500 px-5 py-2 text-sm font-semibold text-slate-950 disabled:opacity-60 disabled:cursor-not-allowed hover:bg-emerald-400 transition"
            >
              {isScheduling ? "Scheduling…" : "Schedule Story"}
            </button>

            <p className="text-[11px] text-slate-500">
              This no longer saves to Airtable. It now creates a scheduled post
              in your social engine, visible under{" "}
              <span className="font-medium">Dashboard → Scheduled</span>.
            </p>
          </div>

          {status && (
            <div className="mt-2 text-[11px] text-emerald-400">{status}</div>
          )}

          {error && (
            <div className="mt-2 text-[11px] text-red-400">{error}</div>
          )}
        </section>
      </div>
    </div>
  );
}
