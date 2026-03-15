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
const RESOURCE_CACHE_PREFIX = "root-health-presentation-resource:";

function syncKey(resourceId: string) {
  return `${SYNC_PREFIX}${resourceId}`;
}

function resourceCacheKey(resourceId: string) {
  return `${RESOURCE_CACHE_PREFIX}${resourceId}`;
}

function norm(v: any) {
  return String(v || "").trim();
}

function readCachedResource(resourceId: string): Resource | null {
  try {
    const raw = localStorage.getItem(resourceCacheKey(resourceId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.id || String(parsed.id) !== resourceId) return null;
    if (!Array.isArray(parsed?.content?.slides)) return null;
    return parsed as Resource;
  } catch {
    return null;
  }
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

function slideThemeClasses(theme: PresentationTheme) {
  if (theme === "corporate") {
    return {
      shell: "bg-slate-100 text-slate-900",
      slide: "border-slate-200 bg-white text-slate-900",
      overlay: "bg-gradient-to-br from-white/88 via-white/80 to-slate-100/78",
      imageTint: "bg-white/20",
      pill: "border-slate-300 bg-white/90 text-slate-700",
      subtle: "text-slate-500",
    };
  }

  if (theme === "warm") {
    return {
      shell: "bg-amber-50 text-slate-900",
      slide:
        "border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 text-slate-900",
      overlay:
        "bg-gradient-to-br from-amber-50/76 via-orange-50/62 to-white/58",
      imageTint: "bg-amber-50/12",
      pill: "border-amber-300 bg-white/80 text-amber-900",
      subtle: "text-amber-900/60",
    };
  }

  if (theme === "dark") {
    return {
      shell: "bg-slate-950 text-slate-100",
      slide:
        "border-slate-700 bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800 text-slate-100",
      overlay:
        "bg-gradient-to-br from-slate-950/62 via-slate-900/56 to-slate-950/62",
      imageTint: "bg-slate-950/18",
      pill: "border-slate-700 bg-slate-900/70 text-slate-300",
      subtle: "text-slate-400",
    };
  }

  return {
    shell: "bg-slate-950 text-slate-100",
    slide:
      "border-emerald-500/20 bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950/30 text-slate-100",
    overlay:
      "bg-gradient-to-br from-slate-950/54 via-slate-900/48 to-emerald-950/44",
    imageTint: "bg-emerald-950/10",
    pill: "border-emerald-500/30 bg-slate-900/70 text-emerald-100",
    subtle: "text-emerald-100/50",
  };
}

export default function AudiencePresentationPage() {
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
  const [isFullscreen, setIsFullscreen] = useState(false);

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
        const cached = readCachedResource(resourceId);
        if (cached) {
          setResource(cached);
          setSync(readSyncState(resourceId));
          setLoading(false);
          return;
        }

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

        try {
          localStorage.setItem(resourceCacheKey(resourceId), JSON.stringify(found));
        } catch {}

        setResource(found);
        setSync(readSyncState(resourceId));
      } catch (e: any) {
        setError(e?.message || "Failed to load presentation");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [resourceId]);

  useEffect(() => {
    if (!resourceId) return;

    const channel =
      typeof BroadcastChannel !== "undefined"
        ? new BroadcastChannel(`presentation:${resourceId}`)
        : null;

    function applySync(next: SyncState) {
      setSync({
        slideIndex: Math.max(0, Number(next?.slideIndex || 0)),
        theme: (next?.theme || "calm") as PresentationTheme,
        showArtwork: next?.showArtwork !== false,
        updatedAt: Number(next?.updatedAt || Date.now()),
      });
    }

    function onStorage(e: StorageEvent) {
      if (e.key === syncKey(resourceId) && e.newValue) {
        try {
          applySync(JSON.parse(e.newValue));
        } catch {}
      }

      if (e.key === resourceCacheKey(resourceId) && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          if (Array.isArray(parsed?.content?.slides)) {
            setResource(parsed as Resource);
          }
        } catch {}
      }
    }

    function onMessage(event: MessageEvent) {
      if (!event?.data) return;
      applySync(event.data as SyncState);
    }

    window.addEventListener("storage", onStorage);
    channel?.addEventListener("message", onMessage);

    return () => {
      window.removeEventListener("storage", onStorage);
      channel?.removeEventListener("message", onMessage);
      channel?.close();
    };
  }, [resourceId]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key.toLowerCase() === "f") {
        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen().catch(() => {});
        } else {
          document.exitFullscreen().catch(() => {});
        }
      }
    }

    function onFullscreenChange() {
      setIsFullscreen(!!document.fullscreenElement);
    }

    window.addEventListener("keydown", onKeyDown);
    document.addEventListener("fullscreenchange", onFullscreenChange);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("fullscreenchange", onFullscreenChange);
    };
  }, []);

  const slides = useMemo(() => {
    return Array.isArray(resource?.content?.slides) ? resource!.content.slides : [];
  }, [resource]);

  const safeIndex = useMemo(() => {
    if (!slides.length) return 0;
    return Math.min(Math.max(0, sync.slideIndex), slides.length - 1);
  }, [slides, sync.slideIndex]);

  const slide = slides[safeIndex] || null;
  const theme = slideThemeClasses(sync.theme);
  const generatedImageUrl = norm(slide?.generated_image_url);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center px-6">
        <div className="text-sm text-slate-400">Loading presentation…</div>
      </div>
    );
  }

  if (error || !resource || !slide) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center px-6">
        <div className="max-w-xl rounded-3xl border border-red-500/30 bg-red-950/20 p-6 text-center">
          <div className="text-lg font-semibold">Presentation unavailable</div>
          <div className="mt-2 text-sm text-red-200">
            {error || "No slide data found."}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={[
        "min-h-screen w-full overflow-hidden",
        "flex items-center justify-center p-4 md:p-6",
        theme.shell,
      ].join(" ")}
    >
      {!isFullscreen ? (
        <button
          type="button"
          onClick={() => document.documentElement.requestFullscreen().catch(() => {})}
          className={[
            "fixed right-4 top-4 z-30 rounded-full border px-4 py-2 text-xs font-semibold backdrop-blur",
            theme.pill,
          ].join(" ")}
        >
          Enter full screen
        </button>
      ) : null}

      <div className="w-full max-w-[1800px]">
        <div
          className={[
            "relative mx-auto aspect-[16/9] w-full overflow-hidden rounded-[32px] border shadow-2xl",
            theme.slide,
          ].join(" ")}
        >
          {sync.showArtwork && generatedImageUrl ? (
            <>
              <img
                src={generatedImageUrl}
                alt={slide?.slide_title || `Slide ${safeIndex + 1}`}
                className="absolute inset-0 h-full w-full object-cover"
              />
              <div className={`absolute inset-0 ${theme.imageTint}`} />
              <div className={`absolute inset-0 ${theme.overlay}`} />
            </>
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-transparent via-transparent to-black/10" />
          )}

          <div className="relative z-10 flex h-full flex-col justify-between p-8 md:p-12 lg:p-16">
            <div className="flex items-start justify-between gap-4">
              <div className={`text-[11px] uppercase tracking-[0.2em] ${theme.subtle}`}>
                {resource.title}
              </div>

              <div
                className={[
                  "rounded-full border px-3 py-1 text-[10px] uppercase tracking-wide",
                  theme.pill,
                ].join(" ")}
              >
                Slide {safeIndex + 1} / {slides.length}
              </div>
            </div>

            <div className="max-w-[72%]">
              <h1 className="text-3xl font-semibold leading-tight md:text-5xl lg:text-6xl">
                {norm(slide?.slide_title) || `Slide ${safeIndex + 1}`}
              </h1>

              {Array.isArray(slide?.bullets) && slide.bullets.length > 0 ? (
                <div className="mt-8 space-y-4 md:space-y-5">
                  {slide.bullets.map((bullet: any, idx: number) => (
                    <div
                      key={`aud-bullet-${idx}`}
                      className="flex items-start gap-4 text-lg leading-relaxed md:text-2xl"
                    >
                      <span className="mt-1 opacity-70">•</span>
                      <span>{norm(bullet)}</span>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="h-8" />
          </div>
        </div>
      </div>
    </div>
  );
}
