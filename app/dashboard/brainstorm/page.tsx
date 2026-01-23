"use client";

import React, { useMemo, useState } from "react";
import ConnectedChannelsBar from "../components/ConnectedChannelsBar";

type Mode = "direct" | "story_series";
type ChannelId = "linkedin" | "facebook" | "instagram" | "reddit" | "tiktok";

type DirectPost = {
  title?: string;
  body: string;
  cta?: string;
  hashtags?: string[];
};

type StoryPost = {
  title: string;
  body: string;
  platformSuggestion?: string;
  cta?: string;
  imagePrompt?: string;
};

export default function BrainstormPage() {
  const [mode, setMode] = useState<Mode>("direct");

  const [platform, setPlatform] = useState<ChannelId>("linkedin");
  const [tone, setTone] = useState<string>("Professional & confident");

  const [brief, setBrief] = useState<string>(
    "New year, new projects — I’m offering a free consultation to help HR/leadership pick a wellbeing programme that actually works. Make it confident, direct, and friendly."
  );

  const [seriesLength, setSeriesLength] = useState<number>(3);
  const [storyType, setStoryType] = useState<string>("HR director perspective");
  const [ctaStyle, setCtaStyle] = useState<string>("Comment for more / next part");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [directPost, setDirectPost] = useState<DirectPost | null>(null);
  const [seriesPosts, setSeriesPosts] = useState<StoryPost[]>([]);

  const canGenerate = useMemo(() => !!brief.trim() && !loading, [brief, loading]);

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);
    setDirectPost(null);
    setSeriesPosts([]);

    try {
      if (!brief.trim()) throw new Error("Write a brief first.");

      if (mode === "direct") {
        const res = await fetch("/api/ai/brainstorm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: brief.trim(),
            platform,
            tone,
            goal: "Direct post to my audience",
          }),
        });

        const data: any = await res.json().catch(() => null);
        if (!data?.success) {
          throw new Error(data?.error || "Brainstorm failed.");
        }

        const post = data?.post;
        if (!post?.body) throw new Error("AI returned an empty post.");
        setDirectPost(post);
        return;
      }

      // story_series
      const res = await fetch("/api/ai/story-series", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idea: brief.trim(),
          storyType,
          tone,
          seriesLength,
          platform,
          ctaStyle,
        }),
      });

      const data: any = await res.json().catch(() => null);
      if (!data?.success || !Array.isArray(data?.posts)) {
        throw new Error(data?.error || "Story series generation failed.");
      }

      setSeriesPosts(data.posts);
    } catch (e: any) {
      setError(e?.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // ignore
    }
  };

  const renderDirect = () => {
    if (!directPost) return null;

    const composed = [
      directPost.title?.trim() ? directPost.title.trim() : null,
      directPost.body?.trim() ? directPost.body.trim() : null,
      directPost.cta?.trim() ? directPost.cta.trim() : null,
      directPost.hashtags?.length ? directPost.hashtags.join(" ") : null,
    ]
      .filter(Boolean)
      .join("\n\n");

    return (
      <div className="rounded-3xl border border-slate-700 bg-slate-900/80 p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Result · Direct Post</h2>
          <button
            className="text-xs rounded-full border border-slate-600 px-3 py-1 hover:bg-white/10"
            onClick={() => copyToClipboard(composed)}
            type="button"
          >
            Copy
          </button>
        </div>

        <pre className="whitespace-pre-wrap text-sm text-slate-100 bg-slate-950/60 border border-slate-700 rounded-2xl p-3">
          {composed}
        </pre>

        <p className="text-[11px] text-slate-400">
          Tip: If you hit duplicate-content rules on platforms, tweak the opening line or CTA slightly.
        </p>
      </div>
    );
  };

  const renderSeries = () => {
    if (!seriesPosts.length) return null;

    return (
      <div className="rounded-3xl border border-slate-700 bg-slate-900/80 p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Result · Story Series ({seriesPosts.length})</h2>
          <button
            className="text-xs rounded-full border border-slate-600 px-3 py-1 hover:bg-white/10"
            onClick={() =>
              copyToClipboard(
                seriesPosts
                  .map((p, i) => `Part ${i + 1}/${seriesPosts.length}\n\n${p.title}\n\n${p.body}\n\n${p.cta || ""}`.trim())
                  .join("\n\n---\n\n")
              )
            }
            type="button"
          >
            Copy all
          </button>
        </div>

        <div className="space-y-3">
          {seriesPosts.map((p, i) => (
            <div key={i} className="rounded-2xl border border-slate-700 bg-slate-950/60 p-3 space-y-2">
              <div className="text-[11px] text-slate-400">Part {i + 1}/{seriesPosts.length}</div>
              <div className="text-sm font-semibold">{p.title}</div>
              <pre className="whitespace-pre-wrap text-sm text-slate-100">{p.body}</pre>
              {p.cta ? <div className="text-sm text-emerald-200">{p.cta}</div> : null}
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 px-4 py-8 flex justify-center">
      <div className="w-full max-w-6xl space-y-6">
        <header className="space-y-3">
          <h1 className="text-2xl md:text-3xl font-semibold">🧠 Brainstorm</h1>
          <p className="text-sm text-slate-300 max-w-2xl">
            Choose what you’re creating (direct post vs story series). This stops the “always story mode” behaviour.
          </p>

          {/* ✅ Shared connections bar */}
          <ConnectedChannelsBar title="Social connections" />
        </header>

        <section className="rounded-3xl border border-slate-700 bg-slate-900/80 p-5 space-y-4">
          <div className="grid md:grid-cols-4 gap-3">
            <div className="space-y-1">
              <label className="text-[11px] text-slate-300">Create</label>
              <select
                className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                value={mode}
                onChange={(e) => setMode(e.target.value as Mode)}
              >
                <option value="direct">Direct Post</option>
                <option value="story_series">Story Series</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] text-slate-300">Platform</label>
              <select
                className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                value={platform}
                onChange={(e) => setPlatform(e.target.value as ChannelId)}
              >
                <option value="linkedin">LinkedIn</option>
                <option value="facebook">Facebook</option>
                <option value="instagram">Instagram</option>
                <option value="reddit">Reddit</option>
                <option value="tiktok">TikTok</option>
              </select>
            </div>

            <div className="space-y-1 md:col-span-2">
              <label className="text-[11px] text-slate-300">Tone</label>
              <input
                className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                value={tone}
                onChange={(e) => setTone(e.target.value)}
                placeholder="Professional & confident"
              />
            </div>
          </div>

          {mode === "story_series" && (
            <div className="grid md:grid-cols-3 gap-3">
              <div className="space-y-1">
                <label className="text-[11px] text-slate-300">Story type</label>
                <input
                  className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                  value={storyType}
                  onChange={(e) => setStoryType(e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] text-slate-300">Series length</label>
                <input
                  type="number"
                  min={1}
                  max={10}
                  className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                  value={seriesLength}
                  onChange={(e) => setSeriesLength(Math.max(1, Math.min(10, Number(e.target.value) || 1)))}
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] text-slate-300">CTA style</label>
                <input
                  className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                  value={ctaStyle}
                  onChange={(e) => setCtaStyle(e.target.value)}
                />
              </div>
            </div>
          )}

          <div className="space-y-1">
            <label className="text-[11px] text-slate-300">Brief</label>
            <textarea
              className="w-full min-h-[140px] rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              placeholder="Tell the AI exactly what you want to post."
            />
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleGenerate}
              disabled={!canGenerate}
              className="inline-flex items-center rounded-full bg-emerald-500 px-5 py-2 text-sm font-semibold text-slate-950 disabled:opacity-60 disabled:cursor-not-allowed hover:bg-emerald-400 transition"
            >
              {loading ? "Generating…" : "Generate"}
            </button>

            {error ? <div className="text-sm text-red-400">{error}</div> : null}
          </div>
        </section>

        {mode === "direct" ? renderDirect() : renderSeries()}
      </div>
    </div>
  );
}
