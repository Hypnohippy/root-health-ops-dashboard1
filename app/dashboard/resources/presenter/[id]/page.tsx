"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

type Resource = {
  id: string;
  title: string;
  resource_type: string;
  content: any;
  created_at: string;
  updated_at?: string | null;
};

type PresentationTheme = "calm" | "corporate" | "warm" | "dark";

type SyncState = {
  slideIndex: number;
  theme: PresentationTheme;
  showArtwork: boolean;
  updatedAt: number;
};

const SYNC_PREFIX = "root-health-presentation-sync:";

function syncKey(resourceId: string) {
  return `${SYNC_PREFIX}${resourceId}`;
}

function norm(v: any) {
  return String(v || "").trim();
}

function readSyncState(resourceId: string): SyncState {
  try {
    const raw = localStorage.getItem(syncKey(resourceId));
    if (!raw) {
      return {
        slideIndex: 0,
        theme: "calm",
        showArtwork: true,
        updatedAt: Date.now(),
      };
    }

    const parsed = JSON.parse(raw);

    return {
      slideIndex: Number(parsed?.slideIndex || 0),
      theme: (parsed?.theme || "calm") as PresentationTheme,
      showArtwork: parsed?.showArtwork !== false,
      updatedAt: Number(parsed?.updatedAt || Date.now()),
    };
  } catch {
    return {
      slideIndex: 0,
      theme: "calm",
      showArtwork: true,
      updatedAt: Date.now(),
    };
  }
}

function pushSyncState(resourceId: string, next: SyncState) {
  try {
    localStorage.setItem(syncKey(resourceId), JSON.stringify(next));
  } catch {}

  try {
    if (typeof BroadcastChannel !== "undefined") {
      const channel = new BroadcastChannel(`presentation:${resourceId}`);
      channel.postMessage(next);
      channel.close();
    }
  } catch {}
}

function slideThemeClasses(theme: PresentationTheme) {
  if (theme === "corporate") {
    return {
      frame: "border-slate-200 bg-white text-slate-900",
      panel: "border-slate-200 bg-slate-50 text-slate-800",
      chip: "border-slate-300 bg-white text-slate-700",
      overlay: "bg-gradient-to-br from-white/90 via-white/86 to-slate-100/78",
      tint: "bg-white/20",
      subtle: "text-slate-500",
    };
  }

  if (theme === "warm") {
    return {
      frame:
        "border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 text-slate-900",
      panel: "border-amber-200 bg-white/80 text-amber-950",
      chip: "border-amber-300 bg-white/90 text-amber-900",
      overlay: "bg-gradient-to-br from-amber-50/78 via-orange-50/66 to-white/58",
      tint: "bg-amber-50/14",
      subtle: "text-amber-900/60",
    };
  }

  if (theme === "dark") {
    return {
      frame:
        "border-slate-700 bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800 text-slate-100",
      panel: "border-slate-700 bg-slate-900/80 text-slate-200",
      chip: "border-slate-700 bg-slate-900/70 text-slate-300",
      overlay: "bg-gradient-to-br from-slate-950/66 via-slate-900/60 to-slate-950/62",
      tint: "bg-slate-950/18",
      subtle: "text-slate-400",
    };
  }

  return {
    frame:
      "border-emerald-500/20 bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950/30 text-slate-100",
    panel: "border-emerald-500/20 bg-slate-900/70 text-slate-200",
    chip: "border-emerald-500/30 bg-slate-900/70 text-emerald-100",
    overlay:
      "bg-gradient-to-br from-slate-950/58 via-slate-900/54 to-emerald-950/46",
    tint: "bg-emerald-950/10",
    subtle: "text-emerald-100/50",
  };
}

export default function PresenterConsolePage() {
  const params = useParams();
  const resourceId = norm((params as any)?.id);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resource, setResource] = useState<Resource | null>(null);
  const [sync, setSync] = useState<SyncState>({
    slideIndex: 0,
    theme: "calm",
    showArtwork: true,
    updatedAt: Date.now(),
  });

  useEffect(() => {
    async function load() {
      if (!resourceId) {
        setError("Missing presentation id.");
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const orgRes = await fetch("/api/social-accounts", {
          cache: "no-store",
        });
        const orgData = await orgRes.json().catch(() => null);

        if (!orgRes.ok || !orgData?.organisationId) {
          throw new Error(orgData?.error || "Failed to load organisation");
        }

        const libRes = await fetch(
          `/api/resource-library?organisationId=${orgData.organisationId}`,
          { cache: "no-store" }
        );
        const libData = await libRes.json().catch(() => null);

        if (!libRes.ok) {
          throw new Error(libData?.error || "Failed to load presentation");
        }

        const rows = Array.isArray(libData?.resources) ? libData.resources : [];
        const found =
          rows.find((r: Resource) => String(r.id) === resourceId) || null;

        if (!found) {
          throw new Error("Presentation not found.");
        }

        if (!Array.isArray(found?.content?.slides) || !found.content.slides.length) {
          throw new Error("This resource does not contain presentation slides.");
        }

        setResource(found);

        const initial = readSyncState(resourceId);
        setSync(initial);
        pushSyncState(resourceId, initial);
      } catch (e: any) {
        setError(e?.message || "Failed to load presentation");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [resourceId]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!resource) return;

      if (e.key === "ArrowRight" || e.key === "PageDown" || e.key === " ") {
        e.preventDefault();
        goNext();
      }

      if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        goPrev();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  const slides = useMemo(() => {
    return Array.isArray(resource?.content?.slides) ? resource!.content.slides : [];
  }, [resource]);

  const safeIndex = useMemo(() => {
    if (!slides.length) return 0;
    return Math.min(Math.max(0, sync.slideIndex), slides.length - 1);
  }, [slides, sync.slideIndex]);

  const slide = slides[safeIndex] || null;
  const theme = slideThemeClasses(sync.theme);

  function updateSync(partial: Partial<SyncState>) {
    if (!resourceId) return;

    const next: SyncState = {
      slideIndex:
        partial.slideIndex !== undefined ? partial.slideIndex : sync.slideIndex,
      theme: (partial.theme || sync.theme) as PresentationTheme,
      showArtwork:
        partial.showArtwork !== undefined ? partial.showArtwork : sync.showArtwork,
      updatedAt: Date.now(),
    };

    setSync(next);
    pushSyncState(resourceId, next);
  }

  function goPrev() {
    updateSync({ slideIndex: Math.max(0, safeIndex - 1) });
  }

  function goNext() {
    updateSync({ slideIndex: Math.min(slides.length - 1, safeIndex + 1) });
  }

  function openAudienceScreen() {
    if (!resource) return;
    window.open(`/dashboard/resources/present/${resource.id}`, "_blank");
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center px-6">
        <div className="text-sm text-slate-400">Loading presenter console…</div>
      </div>
    );
  }

  if (error || !resource || !slide) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center px-6">
        <div className="max-w-xl rounded-3xl border border-red-500/30 bg-red-950/20 p-6 text-center">
          <div className="text-lg font-semibold">Presenter console unavailable</div>
          <div className="mt-2 text-sm text-red-200">
            {error || "No slide data found."}
          </div>
        </div>
      </div>
    );
  }

  const generatedImageUrl = norm(slide?.generated_image_url);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-6">
      <div className="mx-auto flex max-w-[1800px] flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-slate-800 bg-slate-900/70 p-4">
          <div>
            <div className="text-xs uppercase tracking-[0.18em] text-slate-500">
              Presenter console
            </div>
            <div className="mt-1 text-lg font-semibold">{resource.title}</div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={openAudienceScreen}
              className="rounded-full bg-emerald-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-emerald-400"
            >
              Open audience screen
            </button>

            <select
              value={sync.theme}
              onChange={(e) =>
                updateSync({ theme: e.target.value as PresentationTheme })
              }
              className="rounded-full border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100"
            >
              <option value="calm">Calm</option>
              <option value="corporate">Corporate</option>
              <option value="warm">Warm</option>
              <option value="dark">Dark</option>
            </select>

            <button
              type="button"
              onClick={() => updateSync({ showArtwork: !sync.showArtwork })}
              className="rounded-full border border-slate-700 bg-slate-950 px-4 py-2 text-xs text-slate-100 hover:bg-white/10"
            >
              {sync.showArtwork ? "Artwork on" : "Artwork off"}
            </button>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_420px]">
          <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-4">
            <div
              className={[
                "relative mx-auto aspect-[16/9] w-full overflow-hidden rounded-[28px] border shadow-2xl",
                theme.frame,
              ].join(" ")}
            >
              {sync.showArtwork && generatedImageUrl ? (
                <>
                  <img
                    src={generatedImageUrl}
                    alt={slide?.slide_title || `Slide ${safeIndex + 1}`}
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                  <div className={`absolute inset-0 ${theme.tint}`} />
                  <div className={`absolute inset-0 ${theme.overlay}`} />
                </>
              ) : null}

              <div className="relative z-10 flex h-full flex-col justify-between p-6 md:p-10">
                <div className="flex items-start justify-between gap-4">
                  <div className={`text-[11px] uppercase tracking-[0.18em] ${theme.subtle}`}>
                    Slide {safeIndex + 1} / {slides.length}
                  </div>

                  <div
                    className={[
                      "rounded-full border px-3 py-1 text-[10px] uppercase tracking-wide",
                      theme.chip,
                    ].join(" ")}
                  >
                    Audience screen
                  </div>
                </div>

                <div className="max-w-[72%]">
                  <div className="text-2xl font-semibold leading-tight md:text-4xl">
                    {norm(slide?.slide_title) || `Slide ${safeIndex + 1}`}
                  </div>

                  {Array.isArray(slide?.bullets) && slide.bullets.length > 0 ? (
                    <div className="mt-6 space-y-3">
                      {slide.bullets.map((bullet: any, idx: number) => (
                        <div
                          key={`presenter-preview-bullet-${idx}`}
                          className="flex items-start gap-3 text-base leading-relaxed md:text-xl"
                        >
                          <span className="mt-1 opacity-70">•</span>
                          <span>{norm(bullet)}</span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>

                <div className="h-6" />
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={goPrev}
                disabled={safeIndex <= 0}
                className="rounded-full border border-slate-700 bg-slate-950 px-4 py-2 text-xs text-slate-100 hover:bg-white/10 disabled:opacity-50"
              >
                Previous
              </button>

              <div className="text-xs text-slate-400">
                Use arrow keys to move through slides
              </div>

              <button
                type="button"
                onClick={goNext}
                disabled={safeIndex >= slides.length - 1}
                className="rounded-full bg-emerald-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>

          <div className="space-y-4">
            <div className={["rounded-3xl border p-5", theme.panel].join(" ")}>
              <div className="text-xs uppercase tracking-[0.18em] opacity-60">
                Current slide
              </div>
              <div className="mt-2 text-lg font-semibold">
                {norm(slide?.slide_title) || `Slide ${safeIndex + 1}`}
              </div>
            </div>

            <div className={["rounded-3xl border p-5", theme.panel].join(" ")}>
              <div className="text-xs uppercase tracking-[0.18em] opacity-60">
                Slide goal
              </div>
              <div className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">
                {norm(slide?.slide_goal) || "—"}
              </div>
            </div>

            <div className={["rounded-3xl border p-5", theme.panel].join(" ")}>
              <div className="text-xs uppercase tracking-[0.18em] opacity-60">
                Speaker notes
              </div>
              <div className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">
                {norm(slide?.speaker_notes) || "—"}
              </div>
            </div>

            <div className={["rounded-3xl border p-5", theme.panel].join(" ")}>
              <div className="text-xs uppercase tracking-[0.18em] opacity-60">
                Audience prompt
              </div>
              <div className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">
                {norm(slide?.audience_prompt) || "—"}
              </div>
            </div>

            <div className={["rounded-3xl border p-5", theme.panel].join(" ")}>
              <div className="text-xs uppercase tracking-[0.18em] opacity-60">
                Presentation objective
              </div>
              <div className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">
                {norm(resource?.content?.objective) || "—"}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
