"use client";

import React, { useState } from "react";

type Platform = "LinkedIn" | "Facebook";

export default function BrainstormPage() {
  const [idea, setIdea] = useState(
    "I want to tell a vulnerable story about why I built Root Health, how burnout and anxiety pushed me to the edge, and how the app helps people feel less alone."
  );

  const [platform, setPlatform] = useState<Platform>("LinkedIn");
  const [draft, setDraft] = useState("");
  const [isThinking, setIsThinking] = useState(false);

  const [isSaving, setIsSaving] = useState(false);
  const [isPostingLinkedIn, setIsPostingLinkedIn] = useState(false);
  const [isPostingFacebook, setIsPostingFacebook] = useState(false);

  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function resetNotices() {
    setMessage(null);
    setError(null);
  }

  async function handleGenerateDraft() {
    resetNotices();

    if (!idea.trim()) {
      setError("Give the AI at least a rough idea to work with.");
      return;
    }

    setIsThinking(true);
    try {
      const res = await fetch("/api/ai/story", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storyType: "founder",
          tone: "conversational",
          length: "medium",
          character: "David",
          scenario: idea,
          platform,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to generate draft");
        return;
      }

      const variants = (data.variants || []) as { title: string; story: string }[];
      if (!variants.length) {
        setError("AI returned no variants");
        return;
      }

      // Take the first variant as the working draft
      const first = variants[0];
      const combined = `${first.title}\n\n${first.story}`;
      setDraft(combined);
      setMessage("Draft generated. Tweak it freely before posting.");
    } catch (e: any) {
      setError(e?.message || "Error talking to AI");
    } finally {
      setIsThinking(false);
    }
  }

  async function handleSaveToAirtable() {
    resetNotices();

    if (!draft.trim()) {
      setError("Nothing to save yet. Generate or write a draft first.");
      return;
    }

    setIsSaving(true);
    try {
      const lines = draft.split("\n").filter((l) => l.trim().length > 0);
      const title = lines[0]?.slice(0, 80) || "Brainstormed post";

      const res = await fetch("/api/content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          platform,
          body: draft,
          status: "draft",
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to save to Airtable");
        return;
      }

      setMessage("Saved to Airtable Content as draft.");
    } catch (e: any) {
      setError(e?.message || "Error saving to Airtable");
    } finally {
      setIsSaving(false);
    }
  }

  async function handlePostLinkedInNow() {
    resetNotices();

    if (!draft.trim()) {
      setError("Write or generate a draft before posting.");
      return;
    }

    setIsPostingLinkedIn(true);
    try {
      const res = await fetch("/api/linkedin/post", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: draft }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to post to LinkedIn");
        return;
      }

      setMessage("Posted to LinkedIn successfully 🟢");
    } catch (e: any) {
      setError(e?.message || "Error posting to LinkedIn");
    } finally {
      setIsPostingLinkedIn(false);
    }
  }

  async function handlePostFacebookNow() {
    resetNotices();

    if (!draft.trim()) {
      setError("Write or generate a draft before posting.");
      return;
    }

    setIsPostingFacebook(true);
    try {
      const res = await fetch("/api/facebook/post", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Assumes /api/facebook/post expects { text }. Change to { message: draft }
        // if your route is using a different property.
        body: JSON.stringify({ text: draft }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to post to Facebook");
        return;
      }

      setMessage("Posted to Facebook page (Fuel Geist) successfully 🟢");
    } catch (e: any) {
      setError(e?.message || "Error posting to Facebook");
    } finally {
      setIsPostingFacebook(false);
    }
  }

  const canPost = !!draft.trim();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-50">
      <div className="mx-auto max-w-6xl px-4 py-8 space-y-6">
        {/* Header */}
        <header className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-slate-50">
              🧠 Brainstorm Studio
            </h1>
            <p className="text-sm text-slate-300">
              Chat with AI to shape vulnerable, human posts – then post straight
              to LinkedIn or your Fuel Geist Facebook page.
            </p>
          </div>
          <a
            href="/dashboard"
            className="rounded-full border border-white/20 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-50 hover:bg-white/10"
          >
            ← Back to dashboard
          </a>
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

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1.5fr)]">
          {/* LEFT: Idea + generate */}
          <section className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-4 space-y-4 shadow-lg">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold text-slate-50">
                  Start the brainstorm
                </h2>
                <p className="text-[11px] text-slate-300">
                  Talk to the AI like you talk to me here. Describe the angle,
                  feelings, and what you want the reader to do.
                </p>
              </div>
              <div className="space-y-1 text-right">
                <label className="text-[11px] font-medium text-slate-200">
                  Target platform
                </label>
                <select
                  className="rounded-md border border-white/20 bg-black/40 px-2 py-1 text-xs text-slate-50"
                  value={platform}
                  onChange={(e) => setPlatform(e.target.value as Platform)}
                >
                  <option value="LinkedIn">LinkedIn</option>
                  <option value="Facebook">Facebook (Fuel Geist)</option>
                </select>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-200">
                Your idea / riff
              </label>
              <textarea
                rows={6}
                className="w-full rounded-xl border border-white/20 bg-black/40 px-3 py-2 text-sm text-slate-50 placeholder:text-slate-400"
                value={idea}
                onChange={(e) => setIdea(e.target.value)}
                placeholder="e.g. I want to tell the honest story of how burnout nearly ended my career and why Root Health exists..."
              />
              <p className="text-[11px] text-slate-400">
                You can keep tweaking this and regenerate. Think of it as you
                and the AI riffing until the story feels right.
              </p>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleGenerateDraft}
                disabled={isThinking}
                className="rounded-md bg-emerald-400 px-3 py-1.5 text-xs font-medium text-slate-950 shadow-md hover:bg-emerald-300 disabled:opacity-60"
              >
                {isThinking ? "Thinking..." : "Generate / refresh draft"}
              </button>
            </div>
          </section>

          {/* RIGHT: Working draft + actions */}
          <section className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-4 space-y-4 shadow-lg">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold text-slate-50">
                  Working draft
                </h2>
                <p className="text-[11px] text-slate-300">
                  Edit anything you like – wording, pacing, call to action.
                  This is what will be posted.
                </p>
              </div>
            </div>

            <textarea
              rows={16}
              className="w-full rounded-xl border border-white/20 bg-black/40 px-3 py-2 text-sm text-slate-50 placeholder:text-slate-400"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Your draft will appear here after you click “Generate / refresh draft”, or you can write from scratch."
            />

            <div className="flex flex-wrap gap-2 justify-between items-center">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleSaveToAirtable}
                  disabled={isSaving || !canPost}
                  className="rounded-md border border-white/30 bg-black/30 px-3 py-1.5 text-xs text-slate-100 hover:bg-black/40 disabled:opacity-60"
                >
                  {isSaving ? "Saving..." : "Save as draft to Airtable"}
                </button>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handlePostLinkedInNow}
                  disabled={!canPost || isPostingLinkedIn}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium shadow-md ${
                    canPost && !isPostingLinkedIn
                      ? "bg-sky-400 text-slate-950 hover:bg-sky-300"
                      : "bg-black/30 text-slate-400 cursor-not-allowed border border-white/15"
                  }`}
                >
                  {isPostingLinkedIn
                    ? "Posting to LinkedIn..."
                    : "Post now to LinkedIn"}
                </button>

                <button
                  type="button"
                  onClick={handlePostFacebookNow}
                  disabled={!canPost || isPostingFacebook}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium shadow-md ${
                    canPost && !isPostingFacebook
                      ? "bg-blue-500 text-slate-950 hover:bg-blue-400"
                      : "bg-black/30 text-slate-400 cursor-not-allowed border border-white/15"
                  }`}
                >
                  {isPostingFacebook
                    ? "Posting to Facebook..."
                    : "Post now to Facebook"}
                </button>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
