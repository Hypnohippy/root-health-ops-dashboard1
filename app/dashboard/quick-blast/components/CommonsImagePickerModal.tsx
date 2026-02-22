"use client";

import React, { useEffect, useMemo, useState } from "react";

type CommonsItem = {
  title: string;
  url: string;
  thumb: string;
};

export default function CommonsImagePickerModal(props: {
  open: boolean;
  initialQuery?: string;
  onClose: () => void;
  onPick: (url: string) => void;
}) {
  const { open, initialQuery, onClose, onPick } = props;

  const [query, setQuery] = useState(initialQuery || "health");
  const [busy, setBusy] = useState(false);
  const [items, setItems] = useState<CommonsItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  const canSearch = useMemo(() => query.trim().length >= 2, [query]);

  async function runSearch(q: string) {
    const term = q.trim();
    if (!term) return;

    setBusy(true);
    setError(null);

    try {
      const res = await fetch(`/api/media/commons-images?q=${encodeURIComponent(term)}`, {
        cache: "no-store",
      });
      const json = await res.json().catch(() => null);

      const list = Array.isArray(json?.items) ? (json.items as CommonsItem[]) : [];
      setItems(list);
    } catch (e: any) {
      setError(e?.message || "Search failed");
      setItems([]);
    } finally {
      setBusy(false);
    }
  }

  // initial load on open
  useEffect(() => {
    if (!open) return;
    runSearch(query || "health");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // ESC closes
  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      {/* overlay */}
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/70"
      />

      {/* panel wrapper */}
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div
          className="w-full max-w-5xl rounded-3xl border border-slate-700 bg-slate-950 shadow-2xl overflow-hidden"
          style={{ maxHeight: "calc(100vh - 2rem)" }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* sticky header */}
          <div className="sticky top-0 z-10 border-b border-slate-800 bg-slate-950/95 backdrop-blur px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs text-slate-400">Wikimedia Commons</div>
                <div className="text-lg font-semibold text-slate-100">Pick an image</div>
                <div className="text-xs text-slate-400 mt-1">
                  Search, click an image to select. ESC or outside click closes.
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="rounded-2xl border border-slate-700 bg-slate-900/60 px-4 py-2 text-sm text-slate-200 hover:border-slate-600"
              >
                Close
              </button>
            </div>

            <form
              className="mt-3 flex flex-col sm:flex-row gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (canSearch) runSearch(query);
              }}
            >
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full rounded-2xl border border-slate-700 bg-slate-900/40 px-4 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                placeholder="Search images… (e.g. health, food, calm, anxiety)"
                autoFocus
              />
              <button
                type="submit"
                disabled={!canSearch || busy}
                className="rounded-2xl bg-emerald-500 px-5 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-60"
              >
                {busy ? "Searching…" : "Search"}
              </button>
            </form>

            {error ? (
              <div className="mt-3 rounded-2xl border border-red-500/40 bg-red-950/25 px-4 py-3 text-sm text-red-100">
                {error}
              </div>
            ) : null}
          </div>

          {/* scrollable body */}
          <div
            className="p-4 overflow-y-auto"
            style={{ maxHeight: "calc(100vh - 2rem - 168px)" }} // header approx height
          >
            {busy && items.length === 0 ? (
              <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6 text-slate-200">
                Searching…
              </div>
            ) : null}

            {!busy && items.length === 0 ? (
              <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6 text-slate-200">
                No results. Try a different search.
              </div>
            ) : null}

            {items.length > 0 ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((it) => (
                  <button
                    key={it.url}
                    type="button"
                    onClick={() => onPick(it.url)}
                    className="group overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/30 text-left hover:border-emerald-500/60"
                  >
                    <div className="aspect-[4/3] w-full bg-slate-950 overflow-hidden">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={it.thumb || it.url}
                        alt={it.title}
                        className="h-full w-full object-cover opacity-95 group-hover:opacity-100"
                        loading="lazy"
                      />
                    </div>
                    <div className="p-3">
                      <div className="text-xs text-slate-200 line-clamp-2">{it.title}</div>
                      <div className="mt-1 text-[11px] text-slate-400 line-clamp-1">{it.url}</div>
                    </div>
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          {/* footer */}
          <div className="border-t border-slate-800 bg-slate-950/95 px-4 py-3 text-xs text-slate-400">
            Tip: For best posting reliability, prefer JPG/PNG (not SVG). If you pick an SVG, some platforms may fail.
          </div>
        </div>
      </div>
    </div>
  );
}
