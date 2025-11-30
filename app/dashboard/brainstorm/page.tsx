"use client";

import React, { useState } from "react";

type StoryVariant = {
  title: string;
  story: string;
};

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

export default function BrainstormPage() {
  // "Chatty" input
  const [idea, setIdea] = useState(
    "I want to share why I built Root Health, including my own burnout and anxiety, in a vulnerable but hopeful way."
  );

  const [tone, setTone] = useState<StoryTone>("conversational");
  const [length, setLength] = useState<StoryLength>("medium");
  const [platform, setPlatform] = useState<StoryPlatform>("LinkedIn");

  const [character, setCharacter] = useState("David");
  const [scenarioLabel, setScenarioLabel] = useState(
    "founder who burned out, rebuilt and created Root Health to help others."
  );

  const [variants, setVariants] = useState<StoryVariant[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const [scheduleDate, setScheduleDate] = useState("");
  const [scheduleTime, setScheduleTime] = useState("");

  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isPosting, setIsPosting] = useState(false);
  const [isScheduling, setIsScheduling] = useState(false);

  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function resetNotices() {
    setMessage(null);
    setError(null);
  }

  const selectedVariant =
    selectedIndex !== null ? variants[selectedIndex] : null;

  const canPostToLinkedIn =
    !!selectedVariant && platform === "LinkedIn" && !isPosting;
  const canSchedule = !!selectedVariant && !isScheduling;

  /* ---------------- AI: Generate 3 story options from the idea ---------------- */

  async function handleGenerateFromIdea() {
    resetNotices();
    setIsGenerating(true);

    try {
      // We feed your "idea" in as the scenario – this is the chatty bit
      const res = await fetch("/api/ai/story", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storyType: "founder",
          tone,
          length,
          character,
          scenario: idea || scenarioLabel,
          platform,
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
      setSelectedIndex(0);
      setMessage("Generated 3 brainstormed story options.");
    } catch (e: any) {
      setError(e?.message || "Error generating stories");
    } finally {
      setIsGenerating(false);
    }
  }

  /* ---------------- Airtable: save selected variant ---------------- */

  async function saveStoryToAirtable(variant: StoryVariant) {
    const res = await fetch("/api/content", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        // Match the shape used by your existing Stories page
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

    if (selectedIndex === null || !variants[selectedIndex]) {
      setError("No story variant selected to save.");
      return;
    }

    setIsSaving(true);
    try {
      await saveStoryToAirtable(variants[selectedIndex]);
      setMessage("Story saved to Airtable Content as draft.");
    } catch (e: any) {
      setError(e?.message || "Error saving story.");
    } finally {
      setIsSaving(false);
    }
  }

  /* ---------------- LinkedIn: post selected variant immediately ---------------- */

  async function handlePostSelectedToLinkedIn() {
    resetNotices();

    if (selectedIndex === null || !variants[selectedIndex]) {
      setError("No story variant selected.");
      return;
    }

    if (platform !== "LinkedIn") {
      setError("Set platform to LinkedIn to post directly.");
      return;
    }

    const variant = variants[selectedIndex];
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

  /* ---------------- Scheduler: schedule selected variant ---------------- */

  async function handleScheduleSelected() {
    resetNotices();

    if (selectedIndex === null || !variants[selectedIndex]) {
      setError("No story variant selected.");
      return;
    }

    if (!scheduleDate || !scheduleTime) {
      setError("Please choose a date and time to schedule.");
      return;
    }

    const variant = variants[selectedIndex];
    const scheduledISO = new Date(
      `${scheduleDate}T${scheduleTime}:00`
    ).toISOString();

    try {
      setIsScheduling(true);
      const res = await fetch("/api/schedule/story", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: variant.title || "Story post",
          body: variant.story,
          platform,
          scheduledTime: scheduledISO,
          // Optional extra metadata if your schedule API accepts it
          seriesName: idea.slice(0, 120), // short label based on the brainstorm
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to schedule story");
        return;
      }

      setMessage(
        "Story scheduled successfully. It will auto-post at that time."
      );
    } catch (e: any) {
      setError(e?.message || "Error scheduling story");
    } finally {
      setIsScheduling(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-50">
      <div className="mx-auto max-w-6xl px-4 py-8 space-y-6">
        {/* Header */}
        <header className="flex items-center justify-between gap-2">
          <div>
            <h1 className="text-2xl font-semibold text-slate-50">
              🧠 Brainstorm Studio
            </h1>
            <p className="text-sm text-slate-300">
              Talk to the AI like you talk to me here, then turn the best idea
              into a post you can save, schedule or publish with one click.
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

        <div className="grid gap-6 lg:grid-cols-[minmax(0,2.1fr)_minmax(0,1.5fr)]">
          {/* LEFT: Brainstorm input + story variants */}
          <div className="space-y-6">
            {/* Brainstorm input */}
            <section className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-4 space-y-4 shadow-lg">
              <h2 className="text-sm font-semibold text-slate-50">
                Start with your raw idea
              </h2>
              <p className="text-[11px] text-slate-300">
                Type what you’d say to me here: messy, human, emotional. The AI
                will turn it into polished story options.
              </p>

              <textarea
                className="w-full min-h-[120px] rounded-md border border-white/20 bg-black/30 px-3 py-2 text-sm text-slate-50 placeholder:text-slate-400"
                value={idea}
                onChange={(e) => setIdea(e.target.value)}
                placeholder="Example: I want to tell the truth about how close I came to burning out, and how the idea for Root Health came out of that..."
              />

              {/* Basic controls: tone, length, platform */}
              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-200">
                    Tone
                  </label>
                  <select
                    className="w-full rounded-md border border-white/20 bg-black/30 px-2 py-1.5 text-sm text-slate-50"
                    value={tone}
                    onChange={(e) => setTone(e.target.value as StoryTone)}
                  >
                    <option value="conversational">Conversational</option>
                    <option value="inspirational">Inspirational</option>
                    <option value="emotional">Emotional</option>
                    <option value="cinematic">Cinematic</option>
                    <option value="corporate">Corporate / professional</option>
                    <option value="raw">Raw but safe</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-200">
                    Length
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
                      Medium (150–250 words, good default)
                    </option>
                    <option value="long">Long (300–500 words)</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-200">
                    Platform
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

              {/* Character / scenario (optional seasoning) */}
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-200">
                    Character name (optional)
                  </label>
                  <input
                    className="w-full rounded-md border border-white/20 bg-black/30 px-2 py-1.5 text-sm text-slate-50"
                    value={character}
                    onChange={(e) => setCharacter(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-200">
                    Scenario label
                    <HelpTip text="Just a short description the AI can use; your full idea above is still the main input." />
                  </label>
                  <input
                    className="w-full rounded-md border border-white/20 bg-black/30 px-2 py-1.5 text-sm text-slate-50"
                    value={scenarioLabel}
                    onChange={(e) => setScenarioLabel(e.target.value)}
                  />
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleGenerateFromIdea}
                  disabled={isGenerating}
                  className="rounded-md bg-emerald-400 px-3 py-1.5 text-xs font-medium text-slate-950 shadow-md hover:bg-emerald-300 disabled:opacity-60"
                >
                  {isGenerating
                    ? "Thinking..."
                    : "Turn this idea into 3 stories"}
                </button>
              </div>
            </section>

            {/* Story variants + actions */}
            <section className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-4 space-y-4 shadow-lg">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-slate-50">
                    Draft story options
                  </h2>
                  <p className="text-[11px] text-slate-300">
                    Pick the one that feels truest to you. Then save it,
                    schedule it, or post it in a couple of clicks.
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleSaveSelected}
                    disabled={
                      isSaving || selectedIndex === null || !variants.length
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
                        onClick={() => setSelectedIndex(idx)}
                        className={`rounded-full px-3 py-1 text-xs border ${
                          selectedIndex === idx
                            ? "bg-emerald-400 text-slate-950 border-emerald-300"
                            : "bg-black/30 text-slate-100 border-white/20"
                        }`}
                      >
                        Story {["A", "B", "C"][idx] || idx + 1}
                      </button>
                    ))}
                  </div>

                  {selectedVariant && (
                    <>
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

                      {/* Scheduler */}
                      <div className="rounded-xl border border-white/15 bg-black/25 p-3 space-y-2 mt-3">
                        <p className="text-[11px] font-semibold text-slate-200">
                          Schedule this story
                          <HelpTip text="Once scheduled, it will sit in your existing Airtable / scheduler flow and auto-post like any other story." />
                        </p>
                        <div className="grid gap-2 md:grid-cols-2">
                          <div className="space-y-1">
                            <label className="text-[11px] text-slate-300">
                              Date
                            </label>
                            <input
                              type="date"
                              className="w-full rounded-md border border-white/20 bg-black/30 px-2 py-1.5 text-xs text-slate-50"
                              value={scheduleDate}
                              onChange={(e) => setScheduleDate(e.target.value)}
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[11px] text-slate-300">
                              Time
                            </label>
                            <input
                              type="time"
                              className="w-full rounded-md border border-white/20 bg-black/30 px-2 py-1.5 text-xs text-slate-50"
                              value={scheduleTime}
                              onChange={(e) => setScheduleTime(e.target.value)}
                            />
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={handleScheduleSelected}
                          disabled={!canSchedule}
                          className={`mt-2 rounded-md px-3 py-1.5 text-xs font-medium shadow-md ${
                            canSchedule
                              ? "bg-emerald-400 text-slate-950 hover:bg-emerald-300"
                              : "bg-black/30 text-slate-400 cursor-not-allowed border border-white/15"
                          }`}
                        >
                          {isScheduling
                            ? "Scheduling..."
                            : "Schedule story to auto-post"}
                        </button>
                      </div>
                    </>
                  )}
                </>
              ) : (
                <p className="text-xs text-slate-300">
                  Once you generate stories, they will appear here as A/B/C
                  options. Pick your favourite, then save, post, or schedule it.
                </p>
              )}
            </section>
          </div>

          {/* RIGHT: Small help column */}
          <div className="space-y-4">
            <section className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-4 text-xs text-slate-200 space-y-2 shadow-lg">
              <h2 className="text-sm font-semibold text-slate-50">
                How Brainstorm Studio fits in
              </h2>
              <ul className="list-disc pl-4 space-y-1">
                <li>
                  Use this page when you want to{" "}
                  <strong>riff, explore and get the story “just right”</strong>{" "}
                  – like our chats.
                </li>
                <li>
                  When a draft feels right, hit{" "}
                  <strong>Save selected to Airtable</strong> and it will land in
                  the same Content setup your Stories page uses.
                </li>
                <li>
                  If you&apos;re ready now, you can{" "}
                  <strong>Post to LinkedIn</strong> or{" "}
                  <strong>Schedule</strong> straight from here as well.
                </li>
              </ul>
            </section>

            <section className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-4 text-xs text-slate-200 space-y-2 shadow-lg">
              <h2 className="text-sm font-semibold text-slate-50">
                Workflow idea
              </h2>
              <ol className="list-decimal pl-4 space-y-1">
                <li>Type the messy human version of what you want to say.</li>
                <li>Generate 3 polished options.</li>
                <li>Pick one that feels most “you”.</li>
                <li>
                  Save as draft in Airtable, or schedule / post it straight
                  away.
                </li>
              </ol>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
