"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

type CommonsItem = {
  title: string;
  url: string;   // full image URL
  thumb?: string; // thumbnail URL
};

type Props = {
  open: boolean;
  onClose: () => void;

  // Called when user picks an image URL
  onPick: (url: string) => void;

  // Optional: seed query the first time it opens
  initialQuery?: string;

  // Optional: show helper text
  helpText?: string;
};

function safeStr(v: any) {
  return String(v || "").trim();
}

function isAllowedImageUrl(u: string) {
  const s = u.toLowerCase();
  // Avoid SVG for posting (Meta/Threads often choke on SVG, and some systems treat it as non-photo)
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
  // Prefer the direct URL if it's not svg; otherwise thumb if allowed
  const url = safeStr(item?.url);
  const thumb = safeStr(item?.thumb);

  if (url && isAllowedImageUrl(url)) return url;
  if (thumb && isAllowedImageUrl(thumb)) return thumb;

  // If both are svg or unknown, return url anyway (user can still pick, but we warn)
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

  const firstOpenRef = useRef(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Close on Escape
  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Lock body scroll while open
  useEffect(() => {
    if (!open) return;

    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Seed query + focus when opened
  useEffect(() => {
    if (!open) return;

    // only seed on the first open, so user edits persist during this open session
    if (!firstOpenRef.current) {
      firstOpenRef.current = true;
      if (initialQuery && !query) setQuery(initialQuery);
    }

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
      // IMPORTANT:
      // Your API (based on your JSON) returns: { success: true, items: [...] }
      // Some older code expects { results: [...] } — we support BOTH here.
      const res = await fetch(`/api/images/commons?q=${encodeURIComponent(qTrim)}`, {
        cache: "no-store",
      });

      const json: any = await res.json().catch(() => null);

      if (!res.ok) {
        setError(json?.error || `Search failed (${res.status})`);
        setItems([]);
        return;
      }

      const arr =
        (Array.isArray(json?.items) ? json.items : null) ||
        (Array.isArray(json?.results) ? json.results : null) ||
        [];

      // Normalize + filter out junk
      const cleaned: CommonsItem[] = arr
        .map((x: any) => ({
          title: safeStr(x?.title),
          url: safeStr(x?.url),
          thumb: safeStr(x?.thumb),
        }))
        .filter((x) => x.url || x.thumb);

      setItems(cleaned);
      setError(null);
    } catch (e: any) {
      setError(e?.message || "Search failed.");
      setItems([]);
    } finally {
      setBusy(false);
    }
  }

  // Debounced search while typing (so it feels like Brainstorm)
  useEffect(() => {
    if (!open) return;

    const qTrim = safeStr(query);
    if (!qTrim) {
      setItems([]);
      setError(null);
      return;
    }

    const t = setTimeout(() => {
      void runSearch(qTrim);
    }, 350);

    return () => clearTimeout(t);
  }, [query, open]);

  const filtered = useMemo(() => {
    // Prefer actual photos; still allow weird types but push them down
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
    const best = pickBestUrl(item);
    setSelectedUrl(best);
  }

  function confirmPick() {
    const u = safeStr(selectedUrl);
    if (!u) return;
    onPick(u);
    onClose();
  }

  // Reset selection when opening
  useEffect(() => {
    if (!open) return;
    setSelectedUrl("");
    setError(null);
    // don't wipe query on open; user expects it to stay
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center px-4">
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close image picker"
        onClick={onClose}
        className="absolute inset-0 bg-black/70"
      />

      {/* Modal */}
      <div
        className="relative w-full max-w-5xl rounded-3xl border border-slate-700 bg-slate-950 shadow-2xl"
        role="dialog"
        aria-modal="true"
      >
        {/* Header (sticky) */}
        <div className="sticky top-0 z-10 rounded-t-3xl border-b border-slate-800 bg-slate-950/95 backdrop-blur px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-xs text-slate-400">Image Search</div>
              <div className="mt-1 text-lg font-semibold text-slate-100">
                Commons image picker
              </div>
              <div className="mt-1 text-sm text-slate-300">
                Search → click an image → Pick.
              </div>
              {helpText ? (
                <div className="mt-1 text-[11px] text-slate-400">{helpText}</div>
              ) : (
                <div className="mt-1 text-[11px] text-slate-400">
                  Tip: For reliable posting (Meta/IG/Threads), use the uploader when possible.
                </div>
              )}
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
              placeholder='Try "health", "food", "nature", "calm"…'
              className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
            />

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void runSearch(query)}
                disabled={busy || !safeStr(query)}
                className="rounded-2xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-60"
              >
                {busy ? "Searching…" : "Search"}
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

          {/* Status row */}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px]">
            <div className="text-slate-400">
              {busy
                ? "Searching…"
                : safeStr(query)
                ? `${filtered.length} result(s)`
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

        {/* Body (scrollable) */}
        <div className="max-h-[70vh] overflow-y-auto px-5 py-5">
          {!safeStr(query) ? (
            <div className="rounded-2xl border border-slate-800 bg-slate-950 p-5 text-sm text-slate-400">
              Search something like <span className="text-slate-200">health</span> or{" "}
              <span className="text-slate-200">food</span>.
            </div>
          ) : busy && filtered.length === 0 ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 9 }).map((_, i) => (
                <div
                  key={i}
                  className="h-40 rounded-2xl border border-slate-800 bg-slate-900/40 animate-pulse"
                />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-2xl border border-slate-800 bg-slate-950 p-5 text-sm text-slate-400">
              No results. Try a different search.
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((it, idx) => {
                const best = pickBestUrl(it);
                const thumb = safeStr(it.thumb) || best;
                const isSelected = selectedUrl === best;

                const allowed = best ? isAllowedImageUrl(best) : false;

                return (
                  <button
                    key={`${best}-${idx}`}
                    type="button"
                    onClick={() => choose(it)}
                    className={[
                      "group text-left rounded-2xl border p-3 transition",
                      isSelected
                        ? "border-emerald-500/70 bg-emerald-500/10"
                        : "border-slate-800 bg-slate-950 hover:border-slate-700",
                    ].join(" ")}
                    title={it.title || "Image"}
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

                    <div className="mt-2 text-[11px] text-slate-500">
                      Click to select
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="rounded-b-3xl border-t border-slate-800 bg-slate-950 px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-[11px] text-slate-400">
              Note: Many “public” image hosts fail Meta/IG/Threads download checks. If posting fails, use the uploader.
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
      </div>
    </div>
  );
}
