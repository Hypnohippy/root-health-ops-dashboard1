"use client";

import React, { useState } from "react";

type Mode = "single" | "series";

type SinglePost = {
  title: string;
  body: string;
};

type SeriesPost = {
  title: string;
  body: string;
};

export default function BrainstormPage() {
  const [prompt, setPrompt] = useState("");
  const [tone, setTone] = useState("open, honest, and conversational");
  const [platform, setPlatform] = useState("LinkedIn + Facebook");
  const [mode, setMode] = useState<Mode>("series"); // default to series
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [singlePost, setSinglePost] = useState<SinglePost | null>(null);
  const [seriesPosts, setSeriesPosts] = useState<SeriesPost[]>([]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSinglePost(null);
    setSeriesPosts([]);

    try {
      const res = await fetch("/api/ai/brainstorm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, tone, platform, mode }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Request failed");
      }

      const data = await res.json();

      if (data.type === "single" && data.post) {
        setSinglePost(data.post);
      } else if (data.type === "series" && Array.isArray(data.posts)) {
        setSeriesPosts(data.posts);
      } else {
        throw new Error("Unexpected response format from AI");
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      alert("Copied to clipboard");
    } catch {
      alert("Could not copy. Please select and copy manually.");
    }
  };

  const copySeriesPost = (index: number) => {
    const post = seriesPosts[index];
    if (!post) return;
    const text = `${post.title}\n\n${post.body}`;
    copyToClipboard(text);
  };

  const copySingle = () => {
    if (!singlePost) return;
    const text = `${singlePost.title}\n\n${singlePost.body}`;
    copyToClipboard(text);
  };

  const copyAllSeries = () => {
    if (seriesPosts.length === 0) return;
    const text = seriesPosts
      .map(
        (p, i) => `PART ${i + 1}: ${p.title}\n\n${p.body}\n\n------------------------`
      )
      .join("\n");
    copyToClipboard(text);
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">🧠 Brainstorm Studio</h1>
        <p className="text-sm text-slate-300 max-w-2xl">
          Talk to your built-in content brain. Describe what you want to say,
          your vibe, and whether you want a single post or a 3-part series.
          Then copy the results straight into{" "}
          <span className="font-medium">Stories</span> or your campaigns.
        </p>
      </header>

      {/* Form */}
      <form
        onSubmit={handleSubmit}
        className="space-y-4 rounded-xl border border-white/10 bg-black/30 p-4 backdrop-blur"
      >
        <div className="space-y-1">
          <label className="text-sm font-medium">
            What do you want to talk about?
          </label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            className="w-full rounded-lg border border-white/10 bg-black/40 p-3 text-sm outline-none focus:border-emerald-400"
            rows={4}
            placeholder={`e.g. “I want to tell the real story of why I built Root Health – burnout, anxiety, and how talking to Coach Marcus and journaling helped me get my life back, with a gentle, hopeful tone and a soft call to action.”`}
            required
          />
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-1">
            <label className="text-sm font-medium">Tone</label>
            <input
              value={tone}
              onChange={(e) => setTone(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none focus:border-emerald-400"
            />
            <p className="text-[11px] text-slate-400">
              e.g. “open, vulnerable and hopeful”, “punchy and direct”, etc.
            </p>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">Platform focus</label>
            <input
              value={platform}
              onChange={(e) => setPlatform(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none focus:border-emerald-400"
            />
            <p className="text-[11px] text-slate-400">
              Just for context – e.g. “LinkedIn leaders”, “Facebook community”.
            </p>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">Output type</label>
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as Mode)}
              className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none focus:border-emerald-400"
            >
              <option value="single">Single post</option>
              <option value="series">3-part series</option>
            </select>
            <p className="text-[11px] text-slate-400">
              Choose “3-part series” for A → B → C style posts.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={loading}
            className="rounded-lg bg-emerald-400 px-4 py-2 text-sm font-medium text-slate-950 shadow-lg shadow-emerald-500/40 disabled:opacity-60"
          >
            {loading ? "Thinking…" : "Generate content"}
          </button>
          {error && (
            <span className="text-xs text-red-400">Error: {error}</span>
          )}
        </div>
      </form>

      {/* Results */}
      {singlePost && (
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Generated post</h2>
            <button
              onClick={copySingle}
              className="rounded-md border border-white/10 px-3 py-1 text-xs hover:bg-white/5"
            >
              Copy for Stories
            </button>
          </div>
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)]">
            <article className="space-y-2 rounded-xl border border-white/10 bg-black/40 p-3 text-sm">
              <h3 className="font-semibold text-slate-50">
                {singlePost.title}
              </h3>
              <p className="whitespace-pre-line text-slate-200">
                {singlePost.body}
              </p>
            </article>
          </div>
          <p className="text-[11px] text-slate-400">
            To use this in{" "}
            <span className="font-medium">Stories &gt; New</span>, click
            “Copy”, then paste into the story content box and schedule it as
            usual.
          </p>
        </section>
      )}

      {seriesPosts.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">
              3-part series for Stories
            </h2>
            <button
              onClick={copyAllSeries}
              className="rounded-md border border-white/10 px-3 py-1 text-xs hover:bg-white/5"
            >
              Copy all parts together
            </button>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            {seriesPosts.map((post, index) => (
              <article
                key={index}
                className="flex flex-col rounded-xl border border-white/10 bg-black/40 p-3 text-sm"
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-slate-400">
                      Part {index + 1}
                    </p>
                    <h3 className="text-sm font-semibold text-slate-50">
                      {post.title}
                    </h3>
                  </div>
                  <button
                    onClick={() => copySeriesPost(index)}
                    className="rounded-md border border-white/10 px-2 py-1 text-[11px] hover:bg-white/5"
                  >
                    Copy
                  </button>
                </div>
                <p className="whitespace-pre-line text-slate-200 flex-1">
                  {post.body}
                </p>
                <p className="mt-3 text-[11px] text-slate-400">
                  Tip: paste this into a new Story and schedule it as{" "}
                  <span className="font-medium">
                    “Part {index + 1} of 3”
                  </span>{" "}
                  for LinkedIn/Facebook.
                </p>
              </article>
            ))}
          </div>

          <p className="text-[11px] text-slate-400">
            Workflow: generate → copy Part 1 → paste into{" "}
            <span className="font-medium">Stories &gt; New</span> & schedule →
            repeat for Parts 2 and 3 with different dates/times.
          </p>
        </section>
      )}
    </div>
  );
}
