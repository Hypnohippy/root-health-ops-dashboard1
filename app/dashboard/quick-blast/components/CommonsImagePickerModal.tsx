"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

type CommonsImage = {
  title?: string;
  url?: string;
  imageUrl?: string;
  thumb?: string;
  thumbnail?: string;
  source?: string;
};

function safeStr(v: any) {
  return String(v || "").trim();
}

function pickUrl(x: CommonsImage): string {
  return safeStr(x.url || x.imageUrl || x.source);
}

function pickThumb(x: CommonsImage): string {
  return safeStr(x.thumb || x.thumbnail || x.url || x.imageUrl || x.source);
}

export default function CommonsImagePickerModal(props: {
  open: boolean;
  onClose: () => void;
  onPick: (url: string) => void;
  title?: string;
  initialQuery?: string;
}) {
  const { open, onClose, onPick, title, initialQuery } = props;

  const [query, setQuery] = useState(initialQuery || "health");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<Array<{ title: string; url: string; thumb: string }>>([]);

  const mountedRef = useRef(false);

  // Lock background scroll when modal open
  useEffect(() => {
    if (!open) return;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  // Close on ESC
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  async function runSearch(q: string) {
    const term = safeStr(q);
    if (!term) return;

    setLoading(true);
    setError(null);

    try {
      // Try both param names to match whichever your API uses
      const urls = [
        `/api/media/commons-images?q=${encodeURIComponent(term)}`,
        `/api/media/commons-images?query=${encodeURIComponent(term)}`,
      ];

      let json: any = null;
      let ok = false;

      for (const u of urls) {
        const res = await fetch(u, { cache: "no-store" });
        json = await res.json().catch(() => null);
        if (res.ok && json) {
          ok = true;
          break;
        }
      }

      if (!ok) {
        setError("Search failed. Try again.");
        setItems([]);
        return;
      }

      const raw: any[] =
        (Array.isArray(json?.items) && json.items) ||
        (Array.isArray(json?.results) && json.results) ||
        (Array.isArray(json) && json) ||
        [];

      const cleaned = raw
        .map((x: any) => {
          const c: CommonsImage = {
            title: x?.title,
            url: x?.url,
            imageUrl: x?.imageUrl,
            thumb: x?.thumb,
            thumbnail: x?.thumbnail,
            source: x?.source,
          };

          const url = pickUrl(c);
          const thumb = pickThumb(c);
          return {
            title: safeStr(c.title) || "Untitled",
            url,
            thumb,
          };
        })
        .filter((x: { title: string; url: string; thumb: string }) => !!(x.url || x.thumb))
        .slice(0, 60);

      setItems(cleaned);
      setError(null);
    } catch (e: any) {
      setError(e?.message || "Search failed");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  // Auto-search when opened (only once per open)
  useEffect(() => {
    if (!open) return;
    if (!mountedRef.current) mountedRef.current = true;

    // Always re-run a search when opened so it doesn’t look “static”
    void runSearch(query || initialQuery || "health");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const hasItems = items.length > 0;

  const headerTitle = useMemo(() => title || "Search images", [title]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60]">
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/70"
      />

      {/* Modal */}
      <div className="absolute inset-0 flex items-center justify-center px-4 py-6">
        <div className="relative w-full max-w-4xl rounded-3xl border border-slate-700 bg-slate-950 shadow-2xl">
          {/* Top bar */}
          <div className="flex items-start justify-between gap-4 border-b border-slate-800 px-5 py-4">
            <div>
              <div className="text-xs text-slate-400">Commons search</div>
              <div className="mt-1 text-lg font-semibold text-slate-100">{headerTitle}</div>
              <div className="mt-1 text-[12px] text-slate-400">
                Pick an image and we’ll paste the URL into Quick Blast.
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="rounded-2xl border border-slate-700 bg-slate-900/70 px-3 py-2 text-sm text-slate-200 hover:border-slate-600"
            >
              Close
            </button>
          </div>

          {/* Body (scrollable) */}
          <div className="max-h-[78vh] overflow-y-auto px-5 py-4">
            {/* Search row */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void runSearch(query);
              }}
              className="flex flex-col gap-3 md:flex-row md:items-center"
            >
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder='Try: "health", "food", "therapy", "mindfulness"...'
                className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
              />

              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="rounded-2xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-60"
                >
                  {loading ? "Searching…" : "Search"}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setQuery("health");
                    void runSearch("health");
                  }}
                  className="rounded-2xl border border-slate-700 bg-slate-950 px-4 py-2 text-sm text-slate-200 hover:border-slate-600"
                >
                  Reset
                </button>
              </div>
            </form>

            {/* Status */}
            {error ? (
              <div className="mt-4 rounded-2xl border border-red-500/40 bg-red-950/25 p-3 text-sm text-red-100">
                {error}
              </div>
            ) : null}

            {!loading && !hasItems ? (
              <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-950/60 p-4 text-sm text-slate-300">
                No results. Try a different search.
              </div>
            ) : null}

            {/* Grid */}
            {hasItems ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                {items.map((it, idx) => (
                  <button
                    key={`${it.url}-${idx}`}
                    type="button"
                    onClick={() => {
                      const chosen = safeStr(it.url);
                      if (!chosen) return;
                      onPick(chosen);
                      onClose();
                    }}
                    className="group overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/60 text-left hover:border-emerald-500/50"
                    title="Click to choose"
                  >
                    <div className="aspect-[4/3] w-full overflow-hidden bg-black/20">
                      {/* Using img to keep it simple */}
                      <img
                        src={it.thumb || it.url}
                        alt={it.title}
                        className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.03]"
                        loading="lazy"
                      />
                    </div>
                    <div className="p-3">
                      <div className="text-[12px] font-semibold text-slate-100 line-clamp-2">
                        {it.title}
                      </div>
                      <div className="mt-1 text-[11px] text-slate-400 line-clamp-2 break-all">
                        {it.url}
                      </div>
                      <div className="mt-2 inline-flex rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-200">
                        Choose
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            ) : null}

            <div className="mt-5 text-[11px] text-slate-500">
              Note: Some platforms (Meta/Threads/IG) require the image URL to be directly downloadable. If a platform says
              “Media download failed”, we’ll switch to importing the image into your own storage (so Meta can read it).
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
