"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

type CommonsItem = {
  title: string;
  url: string;
  thumb?: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  onPick: (url: string) => void;
  initialQuery?: string;
  helpText?: string;
};

function safeStr(v: unknown) {
  return String(v || "").trim();
}

function isAllowedImageUrl(u: string) {
  const s = safeStr(u).toLowerCase();
  if (!s) return false;

  // Avoid SVG (Meta/IG/Threads often reject or “can’t read files”)
  if (s.endsWith(".svg")) return false;

  return (
    s.includes(".jpg") ||
    s.includes(".jpeg") ||
    s.includes(".png") ||
    s.includes(".webp") ||
    s.includes(".gif")
  );
}

function pickBestUrl(item: CommonsItem) {
  const url = safeStr(item?.url);
  const thumb = safeStr(item?.thumb);

  if (url && isAllowedImageUrl(url)) return url;
  if (thumb && isAllowedImageUrl(thumb)) return thumb;

  return url || thumb || "";
}

export default function CommonsImagePickerModal({
  open,
  onClose,
  onPick,
  initialQuery,
  helpText,
}: Props) {
  const [query, setQuery] = useState(initialQuery || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<CommonsItem[]>([]);
  const [selectedUrl, setSelectedUrl] = useState<string>("");

  const inputRef = useRef<HTMLInputElement | null>(null);
  const firstOpenRef = useRef(false);

  // Escape closes
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Focus search when opened
  useEffect(() => {
    if (!open) return;

    if (!firstOpenRef.current) {
      firstOpenRef.current = true;
      if (initialQuery && !safeStr(query)) setQuery(initialQuery);
    }

    setSelectedUrl("");
    setError(null);

    setTimeout(() => {
      inputRef.current?.focus();
    }, 50);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function runSearch(q: string) {
    const qTrim = safeStr(q);
    if (!qTrim) {
      setItems([]);
      setError(null);
      return;
    }

    setBusy(true);
    setError(null);

    try {
      // IMPORTANT: this must match your actual API route
      const res = await fetch(`/api/images/commons?q=${encodeURIComponent(qTrim)}`, {
        cache: "no-store",
      });

      const json: any = await res.json().catch(() => null);

      if (!res.ok) {
        setError(json?.error || `Search failed (${res.status})`);
        setItems([]);
        return;
      }

      const arr: any[] =
        (Array.isArray(json?.items) ? json.items : null) ||
        (Array.isArray(json?.results) ? json.results : null) ||
        [];

      const cleaned: CommonsItem[] = arr
        .map((x: any) => ({
          title: safeStr(x?.title),
          url: safeStr(x?.url),
          thumb: safeStr(x?.thumb),
        }))
        .filter((x: CommonsItem) => !!(x.url || x.thumb));

      setItems(cleaned);
      setError(null);
    } catch (e: any) {
      setError(e?.message || "Search failed.");
      setItems([]);
    } finally {
      setBusy(false);
    }
  }

  // Debounced search
  useEffect(() => {
    if (!open) return;

    const qTrim = safeStr(query);
    if (!qTrim) {
      setItems([]);
      setError(null);
      return;
    }

    const t = setTimeout(() => void runSearch(qTrim), 350);
    return () => clearTimeout(t);
  }, [query, open]);

  const ordered = useMemo(() => {
    const allowed: CommonsItem[] = [];
    const other: CommonsItem[] = [];
    for (const it of items) {
      const best = pickBestUrl(it);
      if (best && isAllowedImageUrl(best)) allowed.push(it);
      else other.push(it);
    }
    return [...allowed, ...other];
  }, [items]);

  function choose(item: CommonsItem) {
    setSelectedUrl(pickBestUrl(item));
  }

  function confirmPick() {
    const u = safeStr(selectedUrl);
    if (!u) return;
    onPick(u);
    onClose();
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[9999]">
      {/* Backdrop (click to close) */}
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />

      {/* FULL-SCREEN SCROLL CONTAINER */}
      <div className="absolute inset-0 overflow-y-auto">
        {/* This wrapper ensures the modal is always reachable and scrollable */}
        <div className="min-h-full flex items-start justify-center px-4 py-6">
          {/* Modal card */}
          <div
            className="w-full max-w-5xl rounded-3xl border border-slate-700 bg-slate-950 shadow-2xl"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()} // prevent backdrop close when clicking inside
          >
            {/* Header */}
            <div className="px-5 py-4 border-b border-slate-800">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-xs text-slate-400">Image Search</div>
                  <div className="mt-1 text-lg font-semibold text-slate-100">
                    Commons image picker
                  </div>
                  <div className="mt-1 text-sm text-slate-300">
                    Search → click an image → Pick.
                  </div>
                  <div className="mt-1 text-[11px] text-slate-400">
                    {helpText ||
                      "Note: Public URLs (like Wikimedia) often fail Meta/IG/Threads downloads. Best practice is: pick → import to your storage → post."}
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

              {/* Search bar */}
              <div className="mt-4 flex flex-col gap-2 md:flex-row md:items-center">
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder='Try "health", "food", "nature", "calm"...'
                  className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                />

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => void runSearch(query)}
                    disabled={busy || !safeStr(query)}
                    className="rounded-2xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-60"
                  >
                    {busy ? "Searching..." : "Search"}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setQuery("");
                      setItems([]);
                      setSelectedUrl("");
                      setError(null);
                      setTimeout(() => inputRef.current?.focus(), 50);
                    }}
                    className="rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-200 hover:border-slate-600"
                  >
                    Clear
                  </button>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                <div className="text-slate-400">
                  {busy
                    ? "Searching..."
                    : safeStr(query)
                    ? `${ordered.length} result(s)`
                    : "Type a search term to begin."}
                </div>

                <div className="text-slate-500">
                  Selected:{" "}
                  <span className="text-slate-200 break-all">
                    {selectedUrl ? selectedUrl : "—"}
                  </span>
                </div>
              </div>

              {error ? (
                <div className="mt-3 rounded-2xl border border-red-500/40 bg-red-950/30 px-4 py-3 text-sm text-red-100">
                  {error}
                </div>
              ) : null}
            </div>

            {/* Body (INTERNAL SCROLL AREA) */}
            <div className="px-5 py-5 max-h-[60vh] overflow-y-auto">
              {!safeStr(query) ? (
                <div className="rounded-2xl border border-slate-800 bg-slate-950 p-5 text-sm text-slate-400">
                  Search something like{" "}
                  <span className="text-slate-200">health</span> or{" "}
                  <span className="text-slate-200">food</span>.
                </div>
              ) : busy && ordered.length === 0 ? (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {Array.from({ length: 9 }).map((_, i) => (
                    <div
                      key={i}
                      className="h-40 rounded-2xl border border-slate-800 bg-slate-900/40 animate-pulse"
                    />
                  ))}
                </div>
              ) : ordered.length === 0 ? (
                <div className="rounded-2xl border border-slate-800 bg-slate-950 p-5 text-sm text-slate-400">
                  No results. Try a different search.
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {ordered.map((it, idx) => {
                    const best = pickBestUrl(it);
                    const thumb = safeStr(it.thumb) || best;
                    const allowed = best ? isAllowedImageUrl(best) : false;
                    const isSel = selectedUrl === best;

                    return (
                      <button
                        key={`${best}-${idx}`}
                        type="button"
                        onClick={() => choose(it)}
                        className={[
                          "group text-left rounded-2xl border p-3 transition",
                          isSel
                            ? "border-emerald-500/70 bg-emerald-500/10"
                            : "border-slate-800 bg-slate-950 hover:border-slate-700",
                        ].join(" ")}
                      >
                        <div className="relative overflow-hidden rounded-xl border border-slate-800 bg-slate-900/40">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={thumb}
                            alt={it.title || "Image"}
                            className="h-40 w-full object-cover"
                            loading="lazy"
                          />
                          {!allowed ? (
                            <div className="absolute bottom-2 left-2 rounded-full border border-amber-500/40 bg-amber-950/60 px-2 py-1 text-[10px] text-amber-200">
                              May not post (SVG/unknown)
                            </div>
                          ) : null}
                        </div>

                        <div className="mt-2 text-[12px] font-semibold text-slate-200 line-clamp-2">
                          {it.title || "Untitled"}
                        </div>
                        <div className="mt-1 text-[11px] text-slate-400 break-all line-clamp-2">
                          {best || "—"}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-4 border-t border-slate-800 flex items-center justify-between gap-3 flex-wrap">
              <div className="text-[11px] text-slate-400">
                If Meta/IG/Threads fail to upload, import the chosen image into your storage first (best reliability).
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-2xl border border-slate-700 bg-slate-950 px-4 py-2 text-sm text-slate-200 hover:border-slate-600"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  onClick={confirmPick}
                  disabled={!safeStr(selectedUrl)}
                  className="rounded-2xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-60"
                >
                  Pick image
                </button>
              </div>
            </div>
          </div>
          {/* end modal */}
        </div>
      </div>
    </div>
  );
}
