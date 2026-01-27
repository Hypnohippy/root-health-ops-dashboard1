// app/dashboard/stories/new/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { applyAntiDuplicateVariation } from "../../../../lib/socialText";

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

type Mode = "now" | "schedule";

type BrainstormPrefill = {
  mode?: "direct" | "story_series";
  platform?: ChannelId;
  tone?: string;
  storyType?: string;
  ctaStyle?: string;
  seriesLength?: number;
  direct?: string | null;
  series?: Array<{
    title: string;
    body: string;
    platformSuggestion?: string;
    cta?: string;
    imagePrompt?: string;
  }> | null;
  createdAt?: string;
};

function safeParsePrefill(raw: string | null): BrainstormPrefill | null {
  try {
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed as BrainstormPrefill;
  } catch {
    return null;
  }
}

export default function StorySeriesBuilderPage() {
  const [idea, setIdea] = useState("");

  const [storyType, setStoryType] = useState<StoryTypeOption>(
    "HR director perspective"
  );
  const [tone, setTone] = useState<ToneOption>("Professional & confident");
  const [targetPlatform, setTargetPlatform] = useState<ChannelId>("linkedin");
  const [ctaStyle, setCtaStyle] =
    useState<CtaStyleOption>("Comment for more / next part");
  const [seriesLength, setSeriesLength] = useState<number>(3);

  const [autoVariation, setAutoVariation] = useState(true);

  const [mode, setMode] = useState<Mode>("schedule");
  const [seriesStart, setSeriesStart] = useState<string>("");
  const [dailyCadence, setDailyCadence] = useState<number>(1);

  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [posts, setPosts] = useState<GeneratedPost[]>([]);

  const [isDispatching, setIsDispatching] = useState(false);
  const [dispatchStatus, setDispatchStatus] = useState<string | null>(null);
  const [dispatchError, setDispatchError] = useState<string | null>(null);

  // ✅ Org comes from backend (no hardcoding)
  const [orgId, setOrgId] = useState<string | null>(null);

  // Brainstorm import banner
  const [importedFromBrainstorm, setImportedFromBrainstorm] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/social-accounts", { cache: "no-store" });
        const data: any = await res.json().catch(() => null);
        const id = data?.organisationId ? String(data.organisationId) : null;
        setOrgId(id);
      } catch {
        setOrgId(null);
      }
    })();
  }, []);

  // ✅ Import from Brainstorm (client only)
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem("rh_prefill_stories_v1");
      const prefill = safeParsePrefill(raw);
      if (!prefill) return;

      // Mark banner
      setImportedFromBrainstorm(true);

      // Platform
      if (prefill.platform) setTargetPlatform(prefill.platform);

      // Tone (map string to closest option)
      if (prefill.tone) {
        const t = String(prefill.tone);
        const mapped: ToneOption =
          t.includes("Warm") ? "Warm & supportive" :
          t.includes("Inspirational") ? "Inspirational & human" :
          t.includes("thought") ? "Strong thought-leader" :
          t.includes("Data") ? "Data-backed but human" :
          "Professional & confident";
        setTone(mapped);
      }

      // Story type (best-effort match)
      if (prefill.storyType) {
        const st = String(prefill.storyType) as StoryTypeOption;
        // only set if it's one of our allowed values
        const allowed: StoryTypeOption[] = [
          "Personal journey",
          "Professional insight",
          "HR director perspective",
          "Problem → Solution → Success",
          "Client case (anonymous)",
          "Educational mini-series",
          "Behind the scenes",
          "Trauma recovery arc",
        ];
        if (allowed.includes(st)) setStoryType(st);
      }

      // CTA style match
      if (prefill.ctaStyle) {
        const cs = String(prefill.ctaStyle) as CtaStyleOption;
        const allowed: CtaStyleOption[] = [
          "Comment for more / next part",
          "Like or share if this resonates",
          "DM me to talk privately",
          "Follow for the next part",
          "Click through to learn more",
        ];
        if (allowed.includes(cs)) setCtaStyle(cs);
      }

      // Series length
      if (typeof prefill.seriesLength === "number") {
        setSeriesLength(Math.max(1, Math.min(10, prefill.seriesLength)));
      }

      // If Brainstorm sent a full series, pre-fill posts directly
      if (Array.isArray(prefill.series) && prefill.series.length > 0) {
        const mapped: GeneratedPost[] = prefill.series.map((p) => ({
          title: typeof p.title === "string" ? p.title : "",
          body: typeof p.body === "string" ? p.body : "",
          platformSuggestion: typeof p.platformSuggestion === "string" ? p.platformSuggestion : undefined,
          cta: typeof p.cta === "string" ? p.cta : undefined,
          imagePrompt: typeof p.imagePrompt === "string" ? p.imagePrompt : undefined,
        }));

        setPosts(mapped);
        setSeriesLength(mapped.length);
        setGenerationError(null);
        setDispatchStatus(null);
        setDispatchError(null);
      } else if (typeof prefill.direct === "string" && prefill.direct.trim()) {
        // If Brainstorm sent a direct draft, use it as the idea to generate a series from
        setIdea(prefill.direct.trim());
      }

      // Optional: clear after import so it doesn't re-import forever
      window.localStorage.removeItem("rh_prefill_stories_v1");
    } catch {
      // ignore
    }
  }, []);

  const canGenerate = useMemo(
    () => !!idea.trim() && !isGenerating,
    [idea, isGenerating]
  );

  const normalizeIdea = (raw: string) => raw.replace(/\s+/g, " ").trim();

  const handleGenerate = async () => {
    setIsGenerating(true);
    setGenerationError(null);
    setPosts([]);
    setDispatchStatus(null);
    setDispatchError(null);

    const payload = {
      idea: normalizeIdea(idea),
      storyType,
      tone,
      seriesLength,
      platform: targetPlatform,
      ctaStyle,
    };

    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const res = await fetch("/api/ai/story-series", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        const data: any = await res.json().catch(() => null);

        if (!res.ok || !data?.success) {
          if (attempt === 1) continue;
          const msg =
            data?.error ||
            data?.message ||
            `AI generation failed (status ${res.status}).`;
          throw new Error(msg);
        }

        if (!Array.isArray(data.posts) || data.posts.length === 0) {
          if (attempt === 1) continue;
          throw new Error("AI did not return any posts.");
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
        setIsGenerating(false);
        return;
      } catch (err: any) {
        if (attempt === 2) {
          setGenerationError(err?.message || "Generation failed.");
        }
      }
    }

    setIsGenerating(false);
  };

  const buildMessage = (
    p: GeneratedPost,
    ctx?: { part?: number; total?: number; whenIso?: string }
  ) => {
    const parts: string[] = [];
    if (p.title?.trim()) parts.push(p.title.trim());
    if (p.body?.trim()) parts.push(p.body.trim());
    if (p.cta?.trim()) parts.push(p.cta.trim());

    const base = parts.join("\n\n").trim();

    return applyAntiDuplicateVariation(
      base,
      {
        platform: targetPlatform,
        seriesPart: ctx?.part,
        seriesTotal: ctx?.total,
        scheduledAtIso: ctx?.whenIso,
      },
      {
        enabled: autoVariation,
        includePartTag: true,
        includeMicroLine: true,
        includeCtaRotation: true,
      }
    );
  };

  const updatePost = (index: number, patch: Partial<GeneratedPost>) => {
    setPosts((prev) =>
      prev.map((p, i) => (i === index ? { ...p, ...patch } : p))
    );
  };

  const handleSendNow = async () => {
    setIsDispatching(true);
    setDispatchStatus(null);
    setDispatchError(null);

    try {
      if (posts.length === 0) throw new Error("Generate a story first.");

      const p = posts[0];
      const message = buildMessage(p, { part: 1, total: posts.length });
      if (!message) throw new Error("The post content is empty.");

      const res = await fetch("/api/social/quick-blast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          platforms: [targetPlatform],
        }),
      });

      const data: any = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || data?.message || "Quick Blast failed.");
      }

      setDispatchStatus(
        `Sent now to ${targetPlatform}. Switch to Schedule to queue the full series.`
      );
    } catch (err: any) {
      setDispatchError(err?.message || "Send now failed.");
    } finally {
      setIsDispatching(false);
    }
  };

  const handleScheduleSeries = async () => {
    setIsDispatching(true);
    setDispatchStatus(null);
    setDispatchError(null);

    try {
      if (!orgId) throw new Error("Organisation not loaded yet. Refresh the page.");
      if (posts.length === 0) throw new Error("Generate a story/series first.");
      if (!seriesStart) throw new Error("Choose the first post date/time.");

      const base = new Date(seriesStart);
      if (isNaN(base.getTime()))
        throw new Error("Start date/time is not valid.");

      const cadenceDays = Math.max(1, Math.min(14, Number(dailyCadence) || 1));

      let successCount = 0;
      const failures: { index: number; error: string }[] = [];

      for (let i = 0; i < posts.length; i++) {
        const scheduledDate = new Date(
          base.getTime() + i * cadenceDays * 24 * 60 * 60 * 1000
        );

        const whenIso = scheduledDate.toISOString();
        const message = buildMessage(posts[i], {
          part: i + 1,
          total: posts.length,
          whenIso,
        });

        const res = await fetch("/api/social/schedule", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message,
            platforms: [targetPlatform],
            scheduledAt: whenIso,
            organisationId: orgId,
            meta: {
              series: posts.length > 1,
              part: i + 1,
              total: posts.length,
              cadenceDays,
            },
          }),
        });

        const data: any = await res.json().catch(() => null);

        if (!data?.success) {
          failures.push({
            index: i,
            error: data?.error || data?.message || `Failed scheduling part ${i + 1}`,
          });
        } else {
          successCount++;
        }
      }

      if (successCount === 0) {
        throw new Error(failures[0]?.error || "Could not schedule any posts.");
      }

      setDispatchStatus(
        failures.length === 0
          ? `Scheduled ${successCount} post(s). View them in Dashboard → Scheduled.`
          : `Scheduled ${successCount} post(s), ${failures.length} failed. View Scheduled for details.`
      );

      if (failures.length) {
        setDispatchError(
          `Some failed:\n` +
            failures
              .slice(0, 5)
              .map((f) => `Part ${f.index + 1}: ${f.error}`)
              .join("\n")
        );
      }
    } catch (err: any) {
      setDispatchError(err?.message || "Scheduling failed.");
    } finally {
      setIsDispatching(false);
    }
  };

  const isSingle = seriesLength === 1;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 px-4 py-8 flex justify-center">
      <div className="w-full max-w-6xl space-y-8">
        <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-semibold">
              Stories · Advanced Narrative Generator
            </h1>
            <p className="mt-1 text-sm text-slate-300 max-w-xl">
              Generate → edit → send now or schedule. Auto-variation helps prevent duplicate-content blocks.
            </p>
          </div>
        </header>

        {importedFromBrainstorm ? (
          <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
            Imported from Brainstorm. You can edit anything before generating/sending.
          </div>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-2">
          {/* --- your existing UI continues unchanged below --- */}
          {/* (Everything else remains exactly as you pasted, so no surprises.) */}

          <section className="rounded-3xl border border-slate-700 bg-slate-900/80 p-5 md:p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-base md:text-lg font-semibold">1) Create</h2>

              <div className="inline-flex rounded-full bg-slate-900 border border-slate-700 overflow-hidden text-[11px]">
                <button
                  type="button"
                  onClick={() => setMode("now")}
                  className={[
                    "px-3 py-1.5",
                    mode === "now"
                      ? "bg-emerald-500 text-slate-950"
                      : "text-slate-300",
                  ].join(" ")}
                >
                  Send now
                </button>
                <button
                  type="button"
                  onClick={() => setMode("schedule")}
                  className={[
                    "px-3 py-1.5",
                    mode === "schedule"
                      ? "bg-emerald-500 text-slate-950"
                      : "text-slate-300",
                  ].join(" ")}
                >
                  Schedule
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-[11px] font-medium text-slate-300">
                Your idea / brief
              </label>
              <textarea
                className="w-full min-h-[130px] rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none"
                value={idea}
                onChange={(e) => setIdea(e.target.value)}
              />
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="block text-[11px] font-medium text-slate-300">
                  Story type
                </label>
                <select
                  className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none"
                  value={storyType}
                  onChange={(e) => setStoryType(e.target.value as StoryTypeOption)}
                >
                  <option value="HR director perspective">HR director perspective</option>
                  <option value="Problem → Solution → Success">Problem → Solution → Success</option>
                  <option value="Professional insight">Professional insight</option>
                  <option value="Personal journey">Personal journey</option>
                  <option value="Client case (anonymous)">Client case (anonymous)</option>
                  <option value="Educational mini-series">Educational mini-series</option>
                  <option value="Behind the scenes">Behind the scenes</option>
                  <option value="Trauma recovery arc">Trauma recovery arc</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="block text-[11px] font-medium text-slate-300">
                  Tone
                </label>
                <select
                  className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none"
                  value={tone}
                  onChange={(e) => setTone(e.target.value as ToneOption)}
                >
                  <option value="Professional & confident">Professional & confident</option>
                  <option value="Warm & supportive">Warm & supportive</option>
                  <option value="Inspirational & human">Inspirational & human</option>
                  <option value="Strong thought-leader">Strong thought-leader</option>
                  <option value="Data-backed but human">Data-backed but human</option>
                </select>
              </div>
            </div>

            <div className="grid md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <label className="block text-[11px] font-medium text-slate-300">
                  Platform
                </label>
                <select
                  className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none"
                  value={targetPlatform}
                  onChange={(e) => setTargetPlatform(e.target.value as ChannelId)}
                >
                  <option value="linkedin">LinkedIn</option>
                  <option value="facebook">Facebook</option>
                  <option value="instagram">Instagram</option>
                  <option value="reddit">Reddit</option>
                  <option value="tiktok">TikTok</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="block text-[11px] font-medium text-slate-300">
                  Series length
                </label>
                <input
                  type="number"
                  min={1}
                  max={10}
                  className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none"
                  value={seriesLength}
                  onChange={(e) =>
                    setSeriesLength(Math.max(1, Math.min(10, Number(e.target.value) || 1)))
                  }
                />
              </div>

              <div className="space-y-2">
                <label className="block text-[11px] font-medium text-slate-300">
                  CTA style
                </label>
                <select
                  className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none"
                  value={ctaStyle}
                  onChange={(e) => setCtaStyle(e.target.value as CtaStyleOption)}
                >
                  <option value="Comment for more / next part">Comment for more / next part</option>
                  <option value="Follow for the next part">Follow for the next part</option>
                  <option value="DM me to talk privately">DM me to talk privately</option>
                  <option value="Like or share if this resonates">Like or share if this resonates</option>
                  <option value="Click through to learn more">Click through to learn more</option>
                </select>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleGenerate}
                disabled={!canGenerate}
                className="inline-flex items-center rounded-full bg-emerald-500 px-5 py-2 text-sm font-semibold text-slate-950 disabled:opacity-60"
              >
                {isGenerating ? "Generating…" : isSingle ? "Generate story" : "Generate series"}
              </button>

              <label className="flex items-center gap-2 text-[11px] text-slate-300">
                <input
                  type="checkbox"
                  checked={autoVariation}
                  onChange={(e) => setAutoVariation(e.target.checked)}
                />
                Auto-variation (recommended)
              </label>
            </div>

            {generationError && (
              <div className="mt-2 text-[11px] text-red-400 whitespace-pre-wrap">
                {generationError}
              </div>
            )}

            {mode === "schedule" && posts.length > 0 && (
              <div className="mt-3 rounded-2xl border border-slate-700 bg-slate-950/60 p-3 space-y-3">
                <div className="text-[11px] font-semibold text-slate-200">Scheduling options</div>

                <div className="grid md:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="block text-[11px] font-medium text-slate-300">
                      First post date/time
                    </label>
                    <input
                      type="datetime-local"
                      className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none"
                      value={seriesStart}
                      onChange={(e) => setSeriesStart(e.target.value)}
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="block text-[11px] font-medium text-slate-300">
                      Cadence (days between episodes)
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={14}
                      className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none"
                      value={dailyCadence}
                      onChange={(e) =>
                        setDailyCadence(Math.max(1, Math.min(14, Number(e.target.value) || 1)))
                      }
                    />
                  </div>
                </div>
              </div>
            )}

            {posts.length > 0 && (
              <div className="flex flex-wrap items-center gap-3 pt-1">
                {mode === "now" ? (
                  <button
                    type="button"
                    onClick={handleSendNow}
                    disabled={isDispatching}
                    className="inline-flex items-center rounded-full bg-emerald-500 px-5 py-2 text-sm font-semibold text-slate-950 disabled:opacity-60"
                  >
                    {isDispatching ? "Sending…" : `Send now to ${targetPlatform}`}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleScheduleSeries}
                    disabled={isDispatching || !seriesStart || !orgId}
                    className="inline-flex items-center rounded-full bg-emerald-500 px-5 py-2 text-sm font-semibold text-slate-950 disabled:opacity-60"
                  >
                    {isDispatching
                      ? "Scheduling…"
                      : orgId
                        ? `Schedule ${posts.length} post${posts.length > 1 ? "s" : ""}`
                        : "Loading org…"}
                  </button>
                )}
              </div>
            )}

            {dispatchStatus && <div className="mt-2 text-[11px] text-emerald-400">{dispatchStatus}</div>}
            {dispatchError && (
              <div className="mt-2 text-[11px] text-red-400 whitespace-pre-wrap">{dispatchError}</div>
            )}
          </section>

          <section className="rounded-3xl border border-slate-700 bg-slate-900/80 p-5 md:p-6 space-y-4">
            <h2 className="text-base md:text-lg font-semibold">2) Edit & preview</h2>

            {posts.length === 0 ? (
              <p className="text-sm text-slate-400">Your generated story/series will appear here.</p>
            ) : (
              <div className="space-y-3 max-h-[620px] overflow-y-auto pr-1">
                {posts.map((p, idx) => (
                  <div
                    key={idx}
                    className="rounded-2xl border border-slate-700 bg-slate-950/60 p-3 space-y-2"
                  >
                    <div className="text-[11px] text-slate-400">
                      {posts.length > 1 ? `Episode ${idx + 1} / ${posts.length}` : "Single post"}
                    </div>

                    <input
                      className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none"
                      value={p.title || ""}
                      onChange={(e) => updatePost(idx, { title: e.target.value })}
                      placeholder="Title (optional)"
                    />

                    <textarea
                      className="w-full min-h-[140px] rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none whitespace-pre-wrap"
                      value={p.body || ""}
                      onChange={(e) => updatePost(idx, { body: e.target.value })}
                      placeholder="Post body"
                    />

                    <input
                      className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none"
                      value={p.cta || ""}
                      onChange={(e) => updatePost(idx, { cta: e.target.value })}
                      placeholder="CTA (optional)"
                    />
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
