// app/dashboard/stories/new/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { applyAntiDuplicateVariation } from "../../../../lib/socialText";
import MediaDropzone from "../../components/MediaDropzone";

type ChannelId = "facebook" | "instagram" | "linkedin" | "tiktok" | "reddit" | "threads";

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

/**
 * Prefill sources:
 * - Older flow: { mode, series: [{title, body...}], direct: "..." }
 * - Brainstorm flow: { mode:"single"|"series", items:[{title,text,imageUrl...}], platform, tone }
 */
type BrainstormItem = {
  title?: string;
  text?: string;
  imageUrl?: string;
  videoUrl?: string;
  attribution?: any;
};

type Prefill = {
  mode?: "single" | "series" | "direct" | "story_series";
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

  items?: BrainstormItem[] | null;

  imageUrl?: string | null;
  videoUrl?: string | null;
  createdAt?: string;
  note?: string;
};

function safeParsePrefill(raw: string | null): Prefill | null {
  try {
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed as Prefill;
  } catch {
    return null;
  }
}

const PREFILL_STORIES_KEYS = ["rootops_prefill_stories_v1", "rh_prefill_stories_v1"];

function getLocalStorageFirst(keys: string[]) {
  try {
    for (const k of keys) {
      const raw = window.localStorage.getItem(k);
      if (raw) return raw;
    }
  } catch {}
  return null;
}

function removeLocalStorageMulti(keys: string[]) {
  try {
    for (const k of keys) {
      try {
        window.localStorage.removeItem(k);
      } catch {}
    }
  } catch {}
}

export default function StorySeriesBuilderPage() {
  // Create lane
  const [idea, setIdea] = useState("");
  const [storyType, setStoryType] = useState<StoryTypeOption>("HR director perspective");
  const [tone, setTone] = useState<ToneOption>("Professional & confident");
  const [targetPlatform, setTargetPlatform] = useState<ChannelId>("linkedin");
  const [ctaStyle, setCtaStyle] = useState<CtaStyleOption>("Comment for more / next part");
  const [seriesLength, setSeriesLength] = useState<number>(3);

  // Draft lane (this is what we SEND)
  const [drafts, setDrafts] = useState<GeneratedPost[]>([]);

  const [autoVariation, setAutoVariation] = useState(true);

  const [mode, setMode] = useState<Mode>("schedule");
  const [seriesStart, setSeriesStart] = useState<string>("");
  const [dailyCadence, setDailyCadence] = useState<number>(1);

  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);

  const [isDispatching, setIsDispatching] = useState(false);
  const [dispatchStatus, setDispatchStatus] = useState<string | null>(null);
  const [dispatchError, setDispatchError] = useState<string | null>(null);

  const [orgId, setOrgId] = useState<string | null>(null);

  const [importedFromBrainstorm, setImportedFromBrainstorm] = useState(false);

  // Media (global for this series of drafts)
  const [imageUrl, setImageUrl] = useState<string>("");
  const [videoUrl, setVideoUrl] = useState<string>("");

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

  // ✅ Import from Brainstorm or older flows into DRAFTS
  useEffect(() => {
    try {
      const raw = getLocalStorageFirst(PREFILL_STORIES_KEYS);
      const prefill = safeParsePrefill(raw);
      if (!prefill) return;

      setImportedFromBrainstorm(true);

      if (prefill.platform) setTargetPlatform(prefill.platform);

      if (prefill.tone) {
        const t = String(prefill.tone);
        const mapped: ToneOption =
          t.includes("Warm")
            ? "Warm & supportive"
            : t.includes("Inspirational")
            ? "Inspirational & human"
            : t.includes("thought")
            ? "Strong thought-leader"
            : t.includes("Data")
            ? "Data-backed but human"
            : "Professional & confident";
        setTone(mapped);
      }

      if (prefill.storyType) {
        const st = String(prefill.storyType) as StoryTypeOption;
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

      // Brainstorm payload: items[]
      if (Array.isArray(prefill.items) && prefill.items.length > 0) {
        const items = prefill.items;

        // carry media if supplied
        const first = items[0] || {};
        if (first.imageUrl) setImageUrl(String(first.imageUrl));
        if (first.videoUrl) setVideoUrl(String(first.videoUrl));

        const mappedDrafts: GeneratedPost[] = items.map((it) => ({
          title: typeof it.title === "string" ? it.title : "",
          body: typeof it.text === "string" ? it.text : "",
          cta: "", // Brainstorm already joins CTA/hashtags into text; keep blank
        }));

        setDrafts(mappedDrafts);
        setSeriesLength(mappedDrafts.length);

        // IMPORTANT: keep create lane empty (that’s fine) — but drafts are now sendable.
        if (prefill.mode === "single") setMode("now");
        else setMode("schedule");

        setGenerationError(null);
        setDispatchStatus(null);
        setDispatchError(null);

        removeLocalStorageMulti(PREFILL_STORIES_KEYS);
        return;
      }

      // Older payload: series[]
      if (Array.isArray(prefill.series) && prefill.series.length > 0) {
        const mappedDrafts: GeneratedPost[] = prefill.series.map((p) => ({
          title: typeof p.title === "string" ? p.title : "",
          body: typeof p.body === "string" ? p.body : "",
          platformSuggestion: typeof p.platformSuggestion === "string" ? p.platformSuggestion : undefined,
          cta: typeof p.cta === "string" ? p.cta : undefined,
          imagePrompt: typeof p.imagePrompt === "string" ? p.imagePrompt : undefined,
        }));

        setDrafts(mappedDrafts);
        setSeriesLength(mappedDrafts.length);
        setGenerationError(null);
        setDispatchStatus(null);
        setDispatchError(null);
      } else if (typeof prefill.direct === "string" && prefill.direct.trim()) {
        setIdea(prefill.direct.trim());
      }

      if (prefill.imageUrl) setImageUrl(String(prefill.imageUrl));
      if (prefill.videoUrl) setVideoUrl(String(prefill.videoUrl));

      removeLocalStorageMulti(PREFILL_STORIES_KEYS);
    } catch {
      // ignore
    }
  }, []);

  const canGenerate = useMemo(() => !!idea.trim() && !isGenerating, [idea, isGenerating]);
  const hasDrafts = drafts.length > 0;

  const normalizeIdea = (raw: string) => raw.replace(/\s+/g, " ").trim();

  const handleGenerate = async () => {
    setIsGenerating(true);
    setGenerationError(null);
    setDrafts([]);
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
          const msg = data?.error || data?.message || `AI generation failed (status ${res.status}).`;
          throw new Error(msg);
        }

        if (!Array.isArray(data.posts) || data.posts.length === 0) {
          if (attempt === 1) continue;
          throw new Error("AI did not return any posts.");
        }

        const mapped: GeneratedPost[] = data.posts.map((p: any) => ({
          title: typeof p.title === "string" ? p.title : "",
          body: typeof p.body === "string" ? p.body : "",
          platformSuggestion: typeof p.platformSuggestion === "string" ? p.platformSuggestion : undefined,
          cta: typeof p.cta === "string" ? p.cta : undefined,
          imagePrompt: typeof p.imagePrompt === "string" ? p.imagePrompt : undefined,
        }));

        setDrafts(mapped);
        setIsGenerating(false);
        return;
      } catch (err: any) {
        if (attempt === 2) setGenerationError(err?.message || "Generation failed.");
      }
    }

    setIsGenerating(false);
  };

  const buildMessage = (p: GeneratedPost, ctx?: { part?: number; total?: number; whenIso?: string }) => {
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

  const updateDraft = (index: number, patch: Partial<GeneratedPost>) => {
    setDrafts((prev) => prev.map((p, i) => (i === index ? { ...p, ...patch } : p)));
  };

  // ✅ NEW: Send drafts even when create lane is empty
  const sendDraftsNow = async () => {
    setIsDispatching(true);
    setDispatchStatus(null);
    setDispatchError(null);

    try {
      if (!hasDrafts) throw new Error("No drafts to send.");
      if (!orgId) throw new Error("Organisation not loaded yet. Refresh the page.");

      let ok = 0;
      let fail = 0;
      const failures: string[] = [];

      for (let i = 0; i < drafts.length; i++) {
        const message = buildMessage(drafts[i], { part: i + 1, total: drafts.length });
        if (!message) {
          fail++;
          failures.push(`Draft ${i + 1}: empty message`);
          continue;
        }

        const res = await fetch("/api/social/quick-blast", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          body: JSON.stringify({
            message,
            platforms: [targetPlatform],
            imageUrl: imageUrl || undefined,
            videoUrl: videoUrl || undefined,
          }),
        });

        const data: any = await res.json().catch(() => null);
        if (!res.ok || !data?.success) {
          fail++;
          failures.push(`Draft ${i + 1}: ${data?.error || data?.message || `Failed (${res.status})`}`);
        } else {
          ok++;
        }
      }

      if (ok === 0) throw new Error(failures[0] || "All drafts failed.");

      setDispatchStatus(
        fail === 0
          ? `Sent ${ok}/${drafts.length} drafts now ✅`
          : `Sent ${ok}/${drafts.length} drafts now (some failed)`
      );

      if (failures.length) {
        setDispatchError(failures.slice(0, 6).join("\n"));
      }
    } catch (e: any) {
      setDispatchError(e?.message || "Send drafts failed.");
    } finally {
      setIsDispatching(false);
    }
  };

  const scheduleDrafts = async () => {
    setIsDispatching(true);
    setDispatchStatus(null);
    setDispatchError(null);

    try {
      if (!orgId) throw new Error("Organisation not loaded yet. Refresh the page.");
      if (!hasDrafts) throw new Error("No drafts to schedule.");
      if (!seriesStart) throw new Error("Choose the first post date/time.");

      const base = new Date(seriesStart);
      if (isNaN(base.getTime())) throw new Error("Start date/time is not valid.");

      const cadenceDays = Math.max(1, Math.min(14, Number(dailyCadence) || 1));

      let ok = 0;
      let fail = 0;
      const failures: string[] = [];

      for (let i = 0; i < drafts.length; i++) {
        const scheduledDate = new Date(base.getTime() + i * cadenceDays * 24 * 60 * 60 * 1000);
        const whenIso = scheduledDate.toISOString();

        const message = buildMessage(drafts[i], { part: i + 1, total: drafts.length, whenIso });
        if (!message) {
          fail++;
          failures.push(`Draft ${i + 1}: empty message`);
          continue;
        }

        const res = await fetch("/api/social/schedule", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          body: JSON.stringify({
            message,
            platforms: [targetPlatform],
            scheduledAt: whenIso,
            organisationId: orgId,

            createdBy: {
              user_id: "owner",
              name: "Clinic Owner",
              email: "owner@clinic.local",
            },

            meta: {
              series: drafts.length > 1,
              part: i + 1,
              total: drafts.length,
              cadenceDays,
              source: "stories_drafts",
              video_url: videoUrl || null,
            },

            imageUrl: imageUrl || null,
          }),
        });

        const data: any = await res.json().catch(() => null);

        if (!res.ok || !data?.success) {
          fail++;
          failures.push(`Draft ${i + 1}: ${data?.error || data?.message || `Failed (${res.status})`}`);
        } else {
          ok++;
        }
      }

      if (ok === 0) throw new Error(failures[0] || "All drafts failed scheduling.");

      setDispatchStatus(
        fail === 0
          ? `Scheduled ${ok}/${drafts.length} drafts ✅`
          : `Scheduled ${ok}/${drafts.length} drafts (some failed)`
      );

      if (failures.length) {
        setDispatchError(failures.slice(0, 6).join("\n"));
      }
    } catch (e: any) {
      setDispatchError(e?.message || "Schedule drafts failed.");
    } finally {
      setIsDispatching(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 px-4 py-8 flex justify-center">
      <div className="w-full max-w-6xl space-y-8">
        <header className="space-y-2">
          <h1 className="text-2xl md:text-3xl font-semibold">Stories</h1>
          <p className="text-sm text-slate-300 max-w-3xl">
            Generate on this page, or import drafts from Brainstorm — either way, you can now SEND/SCHEDULE drafts directly.
          </p>
        </header>

        {importedFromBrainstorm ? (
          <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
            Imported from Brainstorm ✅ Your drafts are ready to send (even if “Create” is empty).
          </div>
        ) : null}

        {/* ✅ Media always available (even if Create is empty) */}
        <section className="rounded-3xl border border-slate-700 bg-slate-900/80 p-5 md:p-6 space-y-3">
          <div className="text-base font-semibold">Media (optional)</div>
          <div className="text-[12px] text-slate-400">
            Add media here AFTER importing from Brainstorm. It will apply to all drafts you send/schedule from this page.
          </div>

          <MediaDropzone
            organisationId={orgId || undefined}
            onUploaded={(m) => {
              const ct = String(m?.contentType || "").toLowerCase();
              if (ct.startsWith("video/")) {
                setVideoUrl(m.url);
                setImageUrl("");
              } else {
                setImageUrl(m.url);
                setVideoUrl("");
              }
            }}
          />

          <div className="grid md:grid-cols-2 gap-3">
            <div>
              <div className="text-[11px] text-slate-400 mb-1">Image URL</div>
              <input
                className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none"
                value={imageUrl}
                onChange={(e) => {
                  setImageUrl(e.target.value);
                  if (e.target.value.trim()) setVideoUrl("");
                }}
                placeholder="Direct image URL (jpg/png)…"
              />
            </div>
            <div>
              <div className="text-[11px] text-slate-400 mb-1">Video URL</div>
              <input
                className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none"
                value={videoUrl}
                onChange={(e) => {
                  setVideoUrl(e.target.value);
                  if (e.target.value.trim()) setImageUrl("");
                }}
                placeholder="Direct video URL (mp4)…"
              />
            </div>
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Create lane */}
          <section className="rounded-3xl border border-slate-700 bg-slate-900/80 p-5 md:p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-base md:text-lg font-semibold">Create</h2>

              <div className="inline-flex rounded-full bg-slate-900 border border-slate-700 overflow-hidden text-[11px]">
                <button
                  type="button"
                  onClick={() => setMode("now")}
                  className={["px-3 py-1.5", mode === "now" ? "bg-emerald-500 text-slate-950" : "text-slate-300"].join(" ")}
                >
                  Send now
                </button>
                <button
                  type="button"
                  onClick={() => setMode("schedule")}
                  className={["px-3 py-1.5", mode === "schedule" ? "bg-emerald-500 text-slate-950" : "text-slate-300"].join(" ")}
                >
                  Schedule
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-[11px] font-medium text-slate-300">Your idea / brief</label>
              <textarea
                className="w-full min-h-[120px] rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none"
                value={idea}
                onChange={(e) => setIdea(e.target.value)}
                placeholder="Type an idea here to generate new stories…"
              />
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="block text-[11px] font-medium text-slate-300">Story type</label>
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
                <label className="block text-[11px] font-medium text-slate-300">Tone</label>
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
                  <option value="Data-backed but human">Data-backed but human</option>
                </select>
              </div>
            </div>

            <div className="grid md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <label className="block text-[11px] font-medium text-slate-300">Platform</label>
                <select
                  className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none"
                  value={targetPlatform}
                  onChange={(e) => setTargetPlatform(e.target.value as ChannelId)}
                >
                  <option value="linkedin">LinkedIn</option>
                  <option value="facebook">Facebook</option>
                  <option value="instagram">Instagram</option>
                  <option value="threads">Threads</option>
                  <option value="reddit">Reddit</option>
                  <option value="tiktok">TikTok</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="block text-[11px] font-medium text-slate-300">Series length</label>
                <input
                  type="number"
                  min={1}
                  max={10}
                  className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none"
                  value={seriesLength}
                  onChange={(e) => setSeriesLength(Math.max(1, Math.min(10, Number(e.target.value) || 1)))}
                />
              </div>

              <div className="space-y-2">
                <label className="block text-[11px] font-medium text-slate-300">CTA style</label>
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
                {isGenerating ? "Generating…" : "Generate"}
              </button>

              <label className="flex items-center gap-2 text-[11px] text-slate-300">
                <input type="checkbox" checked={autoVariation} onChange={(e) => setAutoVariation(e.target.checked)} />
                Auto-variation (recommended)
              </label>
            </div>

            {generationError ? (
              <div className="mt-2 text-[11px] text-red-400 whitespace-pre-wrap">{generationError}</div>
            ) : null}
          </section>

          {/* Drafts lane + ✅ NEW send buttons */}
          <section className="rounded-3xl border border-slate-700 bg-slate-900/80 p-5 md:p-6 space-y-4">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <h2 className="text-base md:text-lg font-semibold">Drafts</h2>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={sendDraftsNow}
                  disabled={!hasDrafts || isDispatching}
                  className="rounded-full bg-emerald-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-60"
                >
                  {isDispatching ? "Sending…" : `Send drafts now → ${targetPlatform}`}
                </button>

                <button
                  type="button"
                  onClick={scheduleDrafts}
                  disabled={!hasDrafts || isDispatching || !seriesStart || !orgId}
                  className="rounded-full border border-slate-600 bg-slate-950 px-4 py-2 text-xs text-slate-100 hover:bg-white/10 disabled:opacity-60"
                >
                  {isDispatching ? "Scheduling…" : "Schedule drafts"}
                </button>
              </div>
            </div>

            {mode === "schedule" && hasDrafts ? (
              <div className="rounded-2xl border border-slate-700 bg-slate-950/60 p-3 space-y-3">
                <div className="text-[11px] font-semibold text-slate-200">Scheduling options</div>

                <div className="grid md:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="block text-[11px] font-medium text-slate-300">First post date/time</label>
                    <input
                      type="datetime-local"
                      className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none"
                      value={seriesStart}
                      onChange={(e) => setSeriesStart(e.target.value)}
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="block text-[11px] font-medium text-slate-300">Cadence (days between episodes)</label>
                    <input
                      type="number"
                      min={1}
                      max={14}
                      className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none"
                      value={dailyCadence}
                      onChange={(e) => setDailyCadence(Math.max(1, Math.min(14, Number(e.target.value) || 1)))}
                    />
                  </div>
                </div>
              </div>
            ) : null}

            {dispatchStatus ? <div className="text-[11px] text-emerald-400">{dispatchStatus}</div> : null}
            {dispatchError ? <div className="text-[11px] text-red-400 whitespace-pre-wrap">{dispatchError}</div> : null}

            {!hasDrafts ? (
              <div className="text-sm text-slate-400">No drafts yet — generate on the left or import from Brainstorm.</div>
            ) : (
              <div className="space-y-3 max-h-[620px] overflow-y-auto pr-1">
                {drafts.map((p, idx) => (
                  <div key={idx} className="rounded-2xl border border-slate-700 bg-slate-950/60 p-3 space-y-2">
                    <div className="text-[11px] text-slate-400">
                      {drafts.length > 1 ? `Episode ${idx + 1} / ${drafts.length}` : "Single post"}
                    </div>

                    <input
                      className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none"
                      value={p.title || ""}
                      onChange={(e) => updateDraft(idx, { title: e.target.value })}
                      placeholder="Title (optional)"
                    />

                    <textarea
                      className="w-full min-h-[140px] rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none whitespace-pre-wrap"
                      value={p.body || ""}
                      onChange={(e) => updateDraft(idx, { body: e.target.value })}
                      placeholder="Post body"
                    />

                    <input
                      className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none"
                      value={p.cta || ""}
                      onChange={(e) => updateDraft(idx, { cta: e.target.value })}
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
