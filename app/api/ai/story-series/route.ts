// app/dashboard/stories/new/page.tsx
"use client";

import React, { useState } from "react";

type ChannelId = "facebook" | "instagram" | "linkedin" | "tiktok" | "reddit";

type GeneratedPost = {
  title: string;
  body: string;
  platformSuggestion?: string;
  cta?: string;
  imagePrompt?: string;
};

type StoryTypeOption =
  | "Personal journey"
  | "Professional insight"
  | "HR director perspective"
  | "Problem → Solution → Success"
  | "Client case (anonymous)"
  | "Educational mini-series"
  | "Behind the scenes"
  | "Trauma recovery arc";

type ToneOption =
  | "Warm & supportive"
  | "Professional & confident"
  | "Inspirational & human"
  | "Strong thought-leader"
  | "Data-backed but human";

type CtaStyleOption =
  | "Comment for more / next part"
  | "Like or share if this resonates"
  | "DM me to talk privately"
  | "Follow for the next part"
  | "Click through to learn more";

const ORG_ID = "23a054db-7040-40b1-b193-2f43cfa139de";

export default function NewStoryPage() {
  const [idea, setIdea] = useState("");
  const [storyType, setStoryType] = useState<StoryTypeOption>(
    "Problem → Solution → Success"
  );
  const [tone, setTone] = useState<ToneOption>("Inspirational & human");
  const [targetPlatform, setTargetPlatform] =
    useState<ChannelId>("linkedin");
  const [ctaStyle, setCtaStyle] =
    useState<CtaStyleOption>("Comment for more / next part");
  const [seriesLength, setSeriesLength] = useState(3);

  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(
    null
  );
  const [posts, setPosts] = useState<GeneratedPost[]>([]);

  const [seriesStart, setSeriesStart] = useState("");
  const [isScheduling, setIsScheduling] = useState(false);
  const [scheduleStatus, setScheduleStatus] = useState<string | null>(null);
  const [scheduleError, setScheduleError] = useState<string | null>(null);

  const canGenerate = !!idea.trim() && !isGenerating;

  const handleGenerateSeries = async () => {
    setIsGenerating(true);
    setGenerationError(null);
    setPosts([]);
    setScheduleStatus(null);
    setScheduleError(null);

    try {
      const res = await fetch("/api/ai/story-series", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idea: idea.trim(),
          storyType,
          tone,
          seriesLength,
          platform: targetPlatform,
          ctaStyle,
        }),
      });

      const data: any = await res.json();

      if (!res.ok || !data?.success) {
        throw new Error(
          data?.error ||
            "Could not generate story series. Please refine your idea and try again."
        );
      }

      if (!Array.isArray(data.posts) || data.posts.length === 0) {
        throw new Error(
          "AI did not return any posts. Try again with a clearer brief."
        );
      }

      const mapped: GeneratedPost[] = data.posts.map((p: any) => ({
        title: typeof p.title === "string" ? p.title : "",
        body: typeof p.body === "string" ? p.body : "",
        platformSuggestion:
          typeof p.platformSuggestion === "string"
            ? p.platformSuggestion
            : undefined,
        cta: typeof p.cta === "string" ? p.cta : undefined,
        imagePrompt:
          typeof p.imagePrompt === "string" ? p.imagePrompt : undefined,
      }));

      setPosts(mapped);
    } catch (err: any) {
      console.error("[NewStoryPage] generate error", err);
      setGenerationError(
        err?.message ||
          "Something went wrong generating your story series."
      );
    } finally {
      setIsGenerating(false);
    }
  };

  const handleScheduleSeries = async () => {
    setIsScheduling(true);
    setScheduleStatus(null);
    setScheduleError(null);

    try {
      if (!seriesStart) {
        throw new Error(
          "Choose when you want the first post in the series to go out."
        );
      }

      if (posts.length === 0) {
        throw new Error(
          "Generate the story series first, then you can schedule it."
        );
      }

      const base = new Date(seriesStart);
      if (isNaN(base.getTime())) {
        throw new Error("The series start date/time is not valid.");
      }

      let successCount = 0;
      let failureCount = 0;

      for (let i = 0; i < posts.length; i++) {
        const post = posts[i];
        const scheduledDate = new Date(
          base.getTime() + i * 24 * 60 * 60 * 1000
        ); // + i days

        const messageParts = [
          post.title?.trim() ? post.title.trim() : "",
          post.body?.trim() ? post.body.trim() : "",
          post.cta?.trim() ? `\n\n${post.cta.trim()}` : "",
        ].filter(Boolean);

        const message = messageParts.join("\n\n");

        const res = await fetch("/api/social/schedule", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message,
            platforms: [targetPlatform],
            imageUrl: undefined,
            scheduledAt: scheduledDate.toISOString(),
            organisationId: ORG_ID,
          }),
        });

        const data: any = await res.json();

        if (!res.ok || !data?.success) {
          failureCount++;
          console.error(
            "[NewStoryPage] schedule failure for post index",
            i,
            data
          );
        } else {
          successCount++;
        }
      }

      if (successCount === 0) {
        throw new Error(
          "None of the posts could be scheduled. Please check your Ayrshare plan and connections."
        );
      }

      setScheduleStatus(
        `Series scheduled: ${successCount} post(s) queued, ${failureCount} failed. You can see them under Dashboard → Scheduled.`
      );
    } catch (err: any) {
      console.error("[NewStoryPage] schedule series error", err);
      setScheduleError(
        err?.message || "Something went wrong scheduling the series."
      );
    } finally {
      setIsScheduling(false);
    }
  };

  const canScheduleSeries =
    posts.length > 0 && !!seriesStart && !isScheduling;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 px-4 py-8 flex justify-center">
      <div className="w-full max-w-6xl space-y-8">
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-semibold">
              Story & Series Builder
            </h1>
            <p className="mt-1 text-sm text-slate-300 max-w-xl">
              Turn one idea into a high-impact single post or multi-part
              series. Generated by AI, scheduled by Root Health Ops, voiced by
              you.
            </p>
          </div>
        </header>

        {/* Main layout */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Left: Controls */}
          <section className="rounded-3xl border border-slate-700 bg-slate-900/80 p-5 md:p-6 space-y-5">
            <h2 className="text-base md:text-lg font-semibold mb-1">
              1. Shape the story
            </h2>

            {/* Idea */}
            <div className="space-y-2">
              <label className="block text-[11px] font-medium text-slate-300">
                What do you want this story or series to be about?
              </label>
              <textarea
                className="w-full min-h-[120px] rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                value={idea}
                onChange={(e) => setIdea(e.target.value)}
                placeholder="E.g. a 3-part story from the HR director's point of view: struggling to choose a wellbeing program, discovering Root Health, implementing it, and seeing the culture change."
              />
            </div>

            {/* Story type */}
            <div className="space-y-2">
              <label className="block text-[11px] font-medium text-slate-300">
                Story type
              </label>
              <select
                className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                value={storyType}
                onChange={(e) =>
                  setStoryType(e.target.value as StoryTypeOption)
                }
              >
                <option value="Problem → Solution → Success">
                  Problem → Solution → Success
                </option>
                <option value="HR director perspective">
                  HR director perspective
                </option>
                <option value="Personal journey">Personal journey</option>
                <option value="Professional insight">
                  Professional insight
                </option>
                <option value="Client case (anonymous)">
                  Client case (anonymous)
                </option>
                <option value="Educational mini-series">
                  Educational mini-series
                </option>
                <option value="Behind the scenes">
                  Behind the scenes
                </option>
                <option value="Trauma recovery arc">
                  Trauma recovery arc
                </option>
              </select>
            </div>

            {/* Tone & platform */}
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="block text-[11px] font-medium text-slate-300">
                  Tone
                </label>
                <select
                  className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                  value={tone}
                  onChange={(e) =>
                    setTone(e.target.value as ToneOption)
                  }
                >
                  <option value="Warm & supportive">
                    Warm & supportive
                  </option>
                  <option value="Professional & confident">
                    Professional & confident
                  </option>
                  <option value="Inspirational & human">
                    Inspirational & human
                  </option>
                  <option value="Strong thought-leader">
                    Strong thought-leader
                  </option>
                  <option value="Data-backed but human">
                    Data-backed but human
                  </option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="block text-[11px] font-medium text-slate-300">
                  Main platform
                </label>
                <select
                  className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                  value={targetPlatform}
                  onChange={(e) =>
                    setTargetPlatform(e.target.value as ChannelId)
                  }
                >
                  <option value="linkedin">LinkedIn</option>
                  <option value="facebook">Facebook</option>
                  <option value="instagram">Instagram</option>
                  <option value="reddit">Reddit</option>
                  <option value="tiktok">TikTok (keep it punchy)</option>
                </select>
              </div>
            </div>

            {/* Series length & CTA */}
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="block text-[11px] font-medium text-slate-300">
                  Series length
                </label>
                <input
                  type="number"
                  min={1}
                  max={10}
                  className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                  value={seriesLength}
                  onChange={(e) =>
                    setSeriesLength(
                      Math.max(1, Math.min(10, Number(e.target.value)))
                    )
                  }
                />
                <p className="text-[10px] text-slate-500">
                  1 for a single story, 3–5 for a mini-series, up to 10 for a
                  full arc.
                </p>
              </div>

              <div className="space-y-2">
                <label className="block text-[11px] font-medium text-slate-300">
                  CTA style
                </label>
                <select
                  className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                  value={ctaStyle}
                  onChange={(e) =>
                    setCtaStyle(e.target.value as CtaStyleOption)
                  }
                >
                  <option value="Comment for more / next part">
                    Comment for more / next part
                  </option>
                  <option value="Like or share if this resonates">
                    Like or share if this resonates
                  </option>
                  <option value="DM me to talk privately">
                    DM me to talk privately
                  </option>
                  <option value="Follow for the next part">
                    Follow for the next part
                  </option>
                  <option value="Click through to learn more">
                    Click through to learn more
                  </option>
                </select>
              </div>
            </div>

            {/* Generate button */}
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleGenerateSeries}
                disabled={!canGenerate}
                className="inline-flex items-center rounded-full bg-emerald-500 px-5 py-2 text-sm font-semibold text-slate-950 disabled:opacity-60 disabled:cursor-not-allowed hover:bg-emerald-400 transition"
              >
                {isGenerating
                  ? "Shaping your story…"
                  : "Generate story / series"}
              </button>
              <p className="text-[11px] text-slate-500">
                AI will draft ${"{seriesLength}"} coherent posts. You can then
                schedule them in one click.
              </p>
            </div>

            {generationError && (
              <div className="mt-2 text-[11px] text-red-400">
                {generationError}
              </div>
            )}
          </section>

          {/* Right: Preview & scheduling */}
          <section className="rounded-3xl border border-slate-700 bg-slate-900/80 p-5 md:p-6 space-y-5">
            <h2 className="text-base md:text-lg font-semibold mb-1">
              2. Preview & schedule
            </h2>

            {posts.length === 0 && (
              <p className="text-sm text-slate-400">
                Once you generate a story or series, the posts will appear here
                ready to review and schedule.
              </p>
            )}

            {posts.length > 0 && (
              <>
                {/* Series timing */}
                <div className="space-y-2">
                  <label className="block text-[11px] font-medium text-slate-300">
                    When should the <span className="font-semibold">first</span>{" "}
                    post go out?
                  </label>
                  <input
                    type="datetime-local"
                    className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 placeholder:text-slate-500"
                    value={seriesStart}
                    onChange={(e) => setSeriesStart(e.target.value)}
                  />
                  <p className="text-[10px] text-slate-500">
                    Root Health Ops will schedule each following post one day
                    apart automatically.
                  </p>
                </div>

                {/* Schedule whole series */}
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={handleScheduleSeries}
                    disabled={!canScheduleSeries}
                    className="inline-flex items-center rounded-full bg-emerald-500 px-5 py-2 text-sm font-semibold text-slate-950 disabled:opacity-60 disabled:cursor-not-allowed hover:bg-emerald-400 transition"
                  >
                    {isScheduling
                      ? "Scheduling series…"
                      : `Schedule ${posts.length} post${
                          posts.length > 1 ? "s" : ""
                        }`}
                  </button>
                  <p className="text-[11px] text-slate-500">
                    These will appear under{" "}
                    <span className="font-medium">Dashboard → Scheduled</span>.
                  </p>
                </div>

                {scheduleStatus && (
                  <div className="mt-2 text-[11px] text-emerald-400">
                    {scheduleStatus}
                  </div>
                )}

                {scheduleError && (
                  <div className="mt-2 text-[11px] text-red-400">
                    {scheduleError}
                  </div>
                )}

                {/* Preview cards */}
                <div className="mt-4 space-y-3 max-h-[420px] overflow-y-auto pr-1">
                  {posts.map((p, idx) => (
                    <div
                      key={idx}
                      className="rounded-2xl border border-slate-700 bg-slate-950/70 p-3 text-xs space-y-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-[11px] text-slate-400">
                          Part {idx + 1} of {posts.length}
                        </div>
                        <div className="text-[10px] text-slate-500">
                          {p.platformSuggestion
                            ? `AI suggests: ${p.platformSuggestion}`
                            : `Target: ${targetPlatform}`}
                        </div>
                      </div>
                      {p.title && (
                        <div className="text-sm font-semibold text-slate-50">
                          {p.title}
                        </div>
                      )}
                      <div className="text-[12px] leading-snug text-slate-100 whitespace-pre-wrap">
                        {p.body}
                      </div>
                      {p.cta && (
                        <div className="text-[11px] text-emerald-300 mt-1">
                          CTA: {p.cta}
                        </div>
                      )}
                      {p.imagePrompt && (
                        <div className="text-[10px] text-slate-400 mt-1">
                          Image idea: {p.imagePrompt}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
