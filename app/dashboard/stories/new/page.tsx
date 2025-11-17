"use client";

import React, { useState } from "react";

type StoryVariant = {
  title: string;
  story: string;
};

type StoryType =
  | "personal"
  | "workplace"
  | "client"
  | "founder"
  | "day_in_life"
  | "series";

type StoryTone =
  | "inspirational"
  | "emotional"
  | "corporate"
  | "cinematic"
  | "conversational"
  | "raw";

type StoryLength = "short" | "medium" | "long";

type StoryPlatform = "LinkedIn" | "Facebook" | "Instagram";

function HelpTip({ text }: { text: string }) {
  return (
    <span
      className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full border border-white/30 bg-black/40 text-[10px] text-slate-200 cursor-help"
      title={text}
    >
      ?
    </span>
  );
}

export default function NewStoryPage() {
  const [storyType, setStoryType] = useState<StoryType>("workplace");
  const [tone, setTone] = useState<StoryTone>("inspirational");
  const [length, setLength] = useState<StoryLength>("medium");
  const [platform, setPlatform] = useState<StoryPlatform>("LinkedIn");
  const [character, setCharacter] = useState("Sarah");
  const [scenario, setScenario] = useState(
    "a professional who looks fine on the outside but is quietly burning out"
  );

  const [seriesEnabled, setSeriesEnabled] = useState(false);
  const [seriesEpisode, setSeriesEpisode] = useState(1);
  const [totalEpisodes, setTotalEpisodes] = useState(3);

  const [variants, setVariants] = useState<StoryVariant[]>([]);
  const [selectedVariantIndex, setSelectedVariantIndex] =
    useState<number | null>(null);

  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isPosting, setIsPosting] = useState(false);

  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function resetNotices() {
    setMessage(null);
    setError(null);
  }

  async function handleGenerateStories() {
    resetNotices();
    setIsGenerating(true);

    try {
      const res = await fetch("/api/ai/story", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storyType,
          tone,
          length,
          character,
          scenario,
          platform,
          seriesEpisode: seriesEnabled ? seriesEpisode : undefined,
          totalEpisodes: seriesEnabled ? totalEpisodes : undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to generate stories");
        return;
      }

      const got = (data.variants || []) as StoryVariant[];
      if (!got.length) {
        setError("AI returned no story variants");
        return;
      }

      setVariants(got);
      setSelectedVariantIndex(0);
      setMessage("Generated 3 story variants.");
    } catch (e: any) {
      setError(e?.message || "Error generating stories");
    } finally {
      setIsGenerating(false);
    }
  }

  async function saveStoryToAirtable(variant: StoryVariant) {
    // Uses existing /api/content -> Content table in Airtable
    const res = await fetch("/api/content", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: variant.title || "Story post",
        platform,
        body: variant.story,
        status: "draft",
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || "Failed to save story to Airtable");
    }
  }

  async function handleSaveSelected() {
    resetNotices();
    if (selectedVariantIndex === null || !variants[selectedVariantIndex]) {
      setError("No story variant selected");
      return;
    }

    setIsSaving(true);
    try {
      await saveStoryToAirtable(variants[selectedVariantIndex]);
      setMessage("Story saved to Airtable Content as draft.");
    } catch (e: any) {
      setError(e?.message || "Error saving story");
    } finally {
      setIsSaving(false);
    }
  }

  async function handlePostSelectedToLinkedIn() {
    resetNotices();

    if (selectedVariantIndex === null || !variants[selectedVariantIndex]) {
      setError("No story variant selected");
      return;
    }

    if (platform !== "LinkedIn") {
      setError("Set platform to LinkedIn to post directly.");
      return;
    }

    const variant = variants[selectedVariantIndex];

    // Compose post: title as heading, then story
    const text = `${variant.title}\n\n${variant.story}`;

    try {
      setIsPosting(true);
      const res = await fetch("/api/linkedin/post", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to post story to LinkedIn");
        return;
      }

      setMessage("Posted story to LinkedIn successfully 🟢");
    } catch (e: any) {
      setError(e?.message || "Error posting story to LinkedIn");
    } finally {
      setIsPosting(false);
    }
  }

  const selectedVariant =
    selectedVariantIndex !== null ? variants[selectedVariantIndex] : null;

  const canPostToLinkedIn =
    !!selectedVariant && platform === "LinkedIn" && !isPosting;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-50">
      <div className="mx-auto max-w-6xl px-4 py-8 space-y-6">
        {/* Header */}
        <header className="flex items-center justify-between gap-2">
          <div>
            <h1 className="text-2xl font-semibold text-slate-50">
              New Story – Root Health
            </h1>
            <p className="text-sm text-slate-300">
              Turn real-life stress, burnout and recovery into human stories
              that build trust, conversation and a loyal audience.
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

        <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1.5fr)]">
          {/* LEFT: Controls */}
          <div className="space-y-6">
            {/* Story Setup */}
            <section className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-4 space-y-4 shadow-lg">
              <h2 className="text-sm font-semibold text-slate-50">
                Story setup
              </h2>

              {/* Story type + tone */}
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-200">
                    Story type
                    <HelpTip text="What kind of story you want: workplace scenario, anonymous client, personal founder moment, etc." />
                  </label>
                  <select
                    className="w-full rounded-md border border-white/20 bg-black/30 px-2 py-1.5 text-sm text-slate-50"
                    value={storyType}
                    onChange={(e) =>
                      setStoryType(e.target.value as StoryType)
                    }
                  >
                    <option value="workplace">Workplace burnout</option>
                    <option value="personal">Personal growth</option>
                    <option value="client">Anonymous client story</option>
                    <option value="founder">Founder story</option>
                    <option value="day_in_life">Day in the life</option>
                    <option value="series">Series / multi-part</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-200">
                    Tone
                    <HelpTip text="How the story should feel emotionally. You can experiment with different tones to see what your audience responds to." />
                  </label>
                  <select
                    className="w-full rounded-md border border-white/20 bg-black/30 px-2 py-1.5 text-sm text-slate-50"
                    value={tone}
                    onChange={(e) => setTone(e.target.value as StoryTone)}
                  >
                    <option value="inspirational">Inspirational</option>
                    <option value="emotional">Emotional</option>
                    <option value="conversational">Conversational</option>
                    <option value="cinematic">Cinematic</option>
                    <option value="corporate">Corporate / professional</option>
                    <option value="raw">Raw but safe</option>
                  </select>
                </div>
              </div>

              {/* Length + platform */}
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-200">
                    Length
                    <HelpTip text="Short = punchy. Medium = fuller story. Long = deeper narrative with reflection, better for LinkedIn or carousel posts." />
                  </label>
                  <select
                    className="w-full rounded-md border border-white/20 bg-black/30 px-2 py-1.5 text-sm text-slate-50"
                    value={length}
                    onChange={(e) =>
                      setLength(e.target.value as StoryLength)
                    }
                  >
                    <option value="short">Short (80–120 words)</option>
                    <option value="medium">
                      Medium (150–250 words, recommended)
                    </option>
                    <option value="long">
                      Long (300–500 words, episodic)
                    </option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-200">
                    Platform
                    <HelpTip text="Where this story will live. The AI adjusts style a little for LinkedIn vs Facebook/Instagram." />
                  </label>
                  <select
                    className="w-full rounded-md border border-white/20 bg-black/30 px-2 py-1.5 text-sm text-slate-50"
                    value={platform}
                    onChange={(e) =>
                      setPlatform(e.target.value as StoryPlatform)
                    }
                  >
                    <option value="LinkedIn">LinkedIn</option>
                    <option value="Facebook">Facebook</option>
                    <option value="Instagram">Instagram</option>
                  </select>
                </div>
              </div>

              {/* Character + Scenario */}
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-200">
                    Character name (optional)
                    <HelpTip text="If you want a named character (real or composite). Leave it as-is or change to something that fits the story." />
                  </label>
                  <input
                    className="w-full rounded-md border border-white/20 bg-black/30 px-2 py-1.5 text-sm text-slate-50 placeholder:text-slate-400"
                    value={character}
                    onChange={(e) => setCharacter(e.target.value)}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-200">
                    Scenario
                    <HelpTip text="One or two lines describing what's going on for this person – job, stress, situation." />
                  </label>
                  <input
                    className="w-full rounded-md border border-white/20 bg-black/30 px-2 py-1.5 text-sm text-slate-50 placeholder:text-slate-400"
                    value={scenario}
                    onChange={(e) => setScenario(e.target.value)}
                  />
                </div>
              </div>

              {/* Series mode */}
              <div className="space-y-2 rounded-xl border border-white/15 bg-black/30 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-medium text-slate-200">
                      Series mode
                      <HelpTip text="Turn this on if you want the story to feel like part of a multi-episode series (Episode 1 of X, etc.)." />
                    </p>
                    <p className="text-[11px] text-slate-300">
                      Great for “Stay tuned” posts and building ongoing
                      engagement.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSeriesEnabled((prev) => !prev)}
                    className={`inline-flex items-center rounded-full px-3 py-1 text-[11px] border ${
                      seriesEnabled
                        ? "bg-emerald-400 text-slate-950 border-emerald-300"
                        : "bg-black/30 text-slate-100 border-white/20"
                    }`}
                  >
                    {seriesEnabled ? "Series on" : "Series off"}
                  </button>
                </div>

                {seriesEnabled && (
                  <div className="grid gap-3 md:grid-cols-2 mt-2">
                    <div className="space-y-1">
                      <label className="text-[11px] font-medium text-slate-200">
                        This episode
                      </label>
                      <input
                        type="number"
                        min={1}
                        className="w-full rounded-md border border-white/20 bg-black/30 px-2 py-1.5 text-xs text-slate-50"
                        value={seriesEpisode}
                        onChange={(e) =>
                          setSeriesEpisode(Number(e.target.value) || 1)
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] font-medium text-slate-200">
                        Total episodes
                      </label>
                      <input
                        type="number"
                        min={2}
                        className="w-full rounded-md border border-white/20 bg-black/30 px-2 py-1.5 text-xs text-slate-50"
                        value={totalEpisodes}
                        onChange={(e) =>
                          setTotalEpisodes(Number(e.target.value) || 2)
                        }
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleGenerateStories}
                  disabled={isGenerating}
                  className="rounded-md bg-emerald-400 px-3 py-1.5 text-xs font-medium text-slate-950 shadow-md hover:bg-emerald-300 disabled:opacity-60"
                >
                  {isGenerating ? "Generating stories..." : "Generate 3 stories"}
                </button>
              </div>
            </section>

            {/* Variants + actions */}
            <section className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-4 space-y-4 shadow-lg">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-slate-50">
                    Story variants (A/B/C)
                  </h2>
                  <p className="text-[11px] text-slate-300">
                    Try different angles and tones. Pick your favourite, save it
                    to Airtable, or post it directly.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleSaveSelected}
                    disabled={
                      isSaving ||
                      selectedVariantIndex === null ||
                      !variants.length
                    }
                    className="rounded-md border border-white/30 bg-black/30 px-3 py-1.5 text-xs text-slate-100 hover:bg-black/40 disabled:opacity-60"
                  >
                    {isSaving ? "Saving..." : "Save selected to Airtable"}
                  </button>
                  <button
                    type="button"
                    onClick={handlePostSelectedToLinkedIn}
                    disabled={!canPostToLinkedIn}
                    className={`rounded-md px-3 py-1.5 text-xs font-medium shadow-md ${
                      canPostToLinkedIn
                        ? "bg-sky-400 text-slate-950 hover:bg-sky-300"
                        : "bg-black/30 text-slate-400 cursor-not-allowed border border-white/15"
                    }`}
                  >
                    {isPosting
                      ? "Posting to LinkedIn..."
                      : "Post selected to LinkedIn"}
                  </button>
                </div>
              </div>

              {variants.length > 0 ? (
                <>
                  <div className="flex flex-wrap gap-2">
                    {variants.map((v, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setSelectedVariantIndex(idx)}
                        className={`rounded-full px-3 py-1 text-xs border ${
                          selectedVariantIndex === idx
                            ? "bg-emerald-400 text-slate-950 border-emerald-300"
                            : "bg-black/30 text-slate-100 border-white/20"
                        }`}
                      >
                        Story {["A", "B", "C"][idx] || idx + 1}
                      </button>
                    ))}
                  </div>

                  {selectedVariant && (
                    <div className="rounded-xl border border-white/15 bg-black/30 p-3 space-y-3">
                      <div>
                        <p className="text-[11px] font-semibold text-slate-300">
                          Title
                        </p>
                        <p className="text-sm font-semibold text-slate-50">
                          {selectedVariant.title || "Untitled story"}
                        </p>
                      </div>
                      <div>
                        <p className="text-[11px] font-semibold text-slate-300">
                          Story
                        </p>
                        <p className="text-sm whitespace-pre-wrap text-slate-50">
                          {selectedVariant.story}
                        </p>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <p className="text-xs text-slate-300">
                  Generate stories to see variants here. You can then save one
                  as content, or post directly to LinkedIn if the platform is
                  set to LinkedIn.
                </p>
              )}
            </section>
          </div>

          {/* RIGHT: Guidance / help */}
          <div className="space-y-4">
            <section className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-4 text-xs text-slate-200 space-y-2 shadow-lg">
              <h2 className="text-sm font-semibold text-slate-50">
                How Story Mode works
              </h2>
              <p>
                Story Mode creates narrative posts instead of straight ads. Use
                these to build trust, start conversations and warm up your
                audience between more direct campaigns.
              </p>
              <ul className="list-disc pl-4 space-y-1">
                <li>
                  Each story follows a human arc: tension → insight → small
                  shift / hope.
                </li>
                <li>
                  Every story ends with exactly one gentle invitation to
                  comment, to start the engagement snowball.
                </li>
                <li>
                  Series mode lets you build multi-part narratives – perfect for
                  “Stay tuned for Part 2” styles.
                </li>
              </ul>
            </section>

            <section className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-4 text-xs text-slate-200 space-y-2 shadow-lg">
              <h2 className="text-sm font-semibold text-slate-50">
                How this connects to Airtable
              </h2>
              <ul className="list-disc pl-4 space-y-1">
                <li>
                  When you click <strong>Save selected to Airtable</strong>, the
                  story is saved into the <code>Content</code> table with{" "}
                  <code>title</code>, <code>platform</code>, <code>body</code>{" "}
                  and <code>status = draft</code>.
                </li>
                <li>
                  You can see and manage these stories alongside other content
                  in your main dashboard.
                </li>
                <li>
                  In future, scheduled posting will read from this same table or
                  a dedicated scheduler table.
                </li>
              </ul>
            </section>

            <section className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-4 text-xs text-slate-200 space-y-2 shadow-lg">
              <h2 className="text-sm font-semibold text-slate-50">
                Tips for story success
              </h2>
              <ul className="list-disc pl-4 space-y-1">
                <li>
                  Alternate between Story posts and direct Ad posts so your feed
                  feels human, not salesy.
                </li>
                <li>
                  Use workplace stories on LinkedIn, more emotional stories on
                  Facebook/Instagram.
                </li>
                <li>
                  Reuse strong stories in email, on your website and in
                  lead-magnets – they&apos;re assets, not one-offs.
                </li>
              </ul>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
