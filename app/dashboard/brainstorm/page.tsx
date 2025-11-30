"use client";

import React, { useState } from "react";

type Mode = "single" | "series";

type BrainstormPost = {
  title: string;
  body: string;
  call_to_action: string;
};

type BrainstormResult = {
  mode: Mode;
  posts: BrainstormPost[];
};

export default function BrainstormPage() {
  const [idea, setIdea] = useState("");
  const [tone, setTone] = useState("open, vulnerable, hopeful");
  const [platform, setPlatform] = useState("LinkedIn & Facebook");
  const [mode, setMode] = useState<Mode>("series");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BrainstormResult | null>(null);

  // Allow inline tweaking of generated posts
  const updatePost = (index: number, field: keyof BrainstormPost, value: string) => {
    if (!result) return;
    const updatedPosts = [...result.posts];
    updatedPosts[index] = { ...updatedPosts[index], [field]: value };
    setResult({ ...result, posts: updatedPosts });
  };

  const handleGenerate = async () => {
    if (!idea.trim()) {
      setError("Give me at least a short idea to work from.");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/ai/brainstorm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idea, tone, platform, mode }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Something went wrong");
      }

      const data = (await res.json()) as BrainstormResult;
      setResult(data);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to generate brainstorm");
    } finally {
      setIsLoading(false);
    }
  };

  const copyAllToClipboard = async () => {
    if (!result) return;

    const text = result.posts
      .map((p, idx) => {
        const header =
          result.mode === "series"
            ? `Series Part ${idx + 1}: ${p.title}`
            : p.title;
        return `${header}\n\n${p.body}\n\n${p.call_to_action}`;
      })
      .join("\n\n---\n\n");

    try {
      await navigator.clipboard.writeText(text);
      alert("Copied full brainstorm to clipboard. Go paste into Stories or Campaigns. 🙌");
    } catch {
      alert("Could not access clipboard. You can still select and copy manually.");
    }
  };

  // 🔌 HOOK POINT for future direct Airtable integration:
  // Once we know your existing Stories API shape (URL + fields),
  // we can replace the clipboard step with a real POST, reusing
  // the same endpoint your /dashboard/stories/new page uses.
  const saveSeriesToStories = async () => {
    if (!result) return;
    alert(
      "This is where we’ll wire it straight into your existing Stories/Airtable endpoint. " +
        "For now, use 'Copy to clipboard' and paste into Stories."
    );
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold">🧠 Brainstorm Studio</h1>
        <p className="text-sm text-slate-300">
          Chat-style content studio for crafting vulnerable, story-driven posts
          you can use in your existing Stories & Campaigns flows.
        </p>
      </header>

      {/* Controls */}
      <section className="rounded-xl border border-white/10 bg-black/30 p-4 backdrop-blur">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <label className="text-xs font-medium text-slate-200">
              Core idea / theme
            </label>
            <textarea
              className="w-full rounded-md border border-white/10 bg-black/40 p-2 text-sm text-slate-50 outline-none focus:border-emerald-400"
              rows={4}
              placeholder="e.g. I built Root Health because I burned out while carrying too much in silence..."
              value={idea}
              onChange={(e) => setIdea(e.target.value)}
            />
          </div>

          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-200">
                Tone
              </label>
              <input
                className="w-full rounded-md border border-white/10 bg-black/40 p-2 text-sm text-slate-50 outline-none focus:border-emerald-400"
                value={tone}
                onChange={(e) => setTone(e.target.value)}
              />
              <p className="text-[11px] text-slate-400">
                You can type things like: “raw but hopeful”, “professional but human”, “quietly confident”, etc.
              </p>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-200">
                Platform focus
              </label>
              <input
                className="w-full rounded-md border border-white/10 bg-black/40 p-2 text-sm text-slate-50 outline-none focus:border-emerald-400"
                value={platform}
                onChange={(e) => setPlatform(e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-200">
                Format
              </label>
              <div className="flex gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => setMode("single")}
                  className={`flex-1 rounded-md border px-2 py-1.5 ${
                    mode === "single"
                      ? "border-emerald-400 bg-emerald-400/10 text-emerald-200"
                      : "border-white/10 text-slate-200 hover:bg-white/5"
                  }`}
                >
                  Single post
                </button>
                <button
                  type="button"
                  onClick={() => setMode("series")}
                  className={`flex-1 rounded-md border px-2 py-1.5 ${
                    mode === "series"
                      ? "border-emerald-400 bg-emerald-400/10 text-emerald-200"
                      : "border-white/10 text-slate-200 hover:bg-white/5"
                  }`}
                >
                  3-part series
                </button>
              </div>
            </div>

            <div>
              <button
                type="button"
                onClick={handleGenerate}
                disabled={isLoading}
                className="mt-2 w-full rounded-md bg-emerald-400 px-3 py-2 text-sm font-semibold text-slate-950 shadow-lg shadow-emerald-500/40 disabled:opacity-60"
              >
                {isLoading ? "Thinking..." : "Generate with AI"}
              </button>
              {error && (
                <p className="mt-2 text-xs text-red-400">
                  {error}
                </p>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Results */}
      {result && (
        <section className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">
              Draft {result.mode === "series" ? "Series" : "Post"}
            </h2>
            <div className="flex gap-2 text-xs">
              <button
                onClick={copyAllToClipboard}
                className="rounded-md border border-emerald-400/70 px-3 py-1.5 font-medium text-emerald-200 hover:bg-emerald-400/10"
              >
                Copy full text for Stories
              </button>
              <button
                onClick={saveSeriesToStories}
                className="rounded-md border border-white/20 px-3 py-1.5 font-medium text-slate-200 hover:bg-white/5"
              >
                (Future) Send to Stories / Airtable
              </button>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {result.posts.map((post, idx) => (
              <div
                key={idx}
                className="space-y-2 rounded-xl border border-white/10 bg-black/40 p-3"
              >
                <p className="text-[11px] uppercase tracking-wide text-slate-400">
                  {result.mode === "series" ? `Part ${idx + 1}` : "Post"}
                </p>
                <input
                  className="w-full rounded-md border border-white/10 bg-black/60 p-2 text-sm font-semibold text-slate-50 outline-none focus:border-emerald-400"
                  value={post.title}
                  onChange={(e) =>
                    updatePost(idx, "title", e.target.value)
                  }
                />
                <textarea
                  className="mt-1 h-40 w-full rounded-md border border-white/10 bg-black/60 p-2 text-sm text-slate-50 outline-none focus:border-emerald-400"
                  value={post.body}
                  onChange={(e) =>
                    updatePost(idx, "body", e.target.value)
                  }
                />
                <textarea
                  className="mt-1 w-full rounded-md border border-white/10 bg-black/60 p-2 text-xs text-slate-200 outline-none focus:border-emerald-400"
                  value={post.call_to_action}
                  onChange={(e) =>
                    updatePost(idx, "call_to_action", e.target.value)
                  }
                />
                <button
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(
                        `${post.title}\n\n${post.body}\n\n${post.call_to_action}`
                      );
                      alert(
                        `Copied part ${idx + 1} to clipboard. Paste it into Stories or Campaigns.`
                      );
                    } catch {
                      alert("Could not access clipboard, please copy manually.");
                    }
                  }}
                  className="mt-2 w-full rounded-md border border-white/20 px-2 py-1.5 text-xs text-slate-100 hover:bg-white/5"
                >
                  Copy this post only
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
