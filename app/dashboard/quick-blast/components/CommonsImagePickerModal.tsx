"use client";

import React, { useEffect, useMemo, useState } from "react";

type CommonsApiItem = {
  title?: string;
  url?: string;
  imageUrl?: string;
  thumb?: string;
  thumbnail?: string;
  source?: string;
};

type CleanItem = {
  title: string;
  url: string;
  thumb: string;
};

function safeStr(v: any) {
  return typeof v === "string" ? v.trim() : "";
}

function pickUrl(x: CommonsApiItem) {
  return safeStr(x.url) || safeStr(x.imageUrl);
}

function pickThumb(x: CommonsApiItem) {
  return safeStr(x.thumb) || safeStr(x.thumbnail) || pickUrl(x);
}

export default function CommonsImagePickerModal(props: {
  open: boolean;
  onClose: () => void;
  organisationId?: string;
  onPick: (pickedUrl: string) => void; // returns the FINAL URL to use (ideally imported into your storage)
}) {
  const { open, onClose, organisationId, onPick } = props;

  const [query, setQuery] = useState("health");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<CleanItem[]>([]);

  // ✅ lock background scroll + ESC to close
  useEffect(() => {
    if (!open) return;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);

    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  async function runSearch(q: string) {
    const qTrim = (q || "").trim();
    if (!qTrim) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/media/commons-images?q=${encodeURIComponent(qTrim)}`, {
        cache: "no-store",
      });

      const json = await res.json().catch(() => null);

      const rawItems = Array.isArray(json?.items) ? (json.items as CommonsApiItem[]) : [];
      const cleaned = rawItems
        .map((x: CommonsApiItem) => ({
          title: safeStr(x?.title) || "Untitled",
          url: pickUrl(x),
          thumb: pickThumb(x),
        }))
        .filter((x: CleanItem) => !!x.url); // ✅ fixed "implicit any" + safe filter

      setItems(cleaned);
      setError(null);

      if (cleaned.length === 0) {
        setError("No results. Try a different search.");
      }
    } catch (e: any) {
      setError(e?.message || "Search failed.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  // When opening, do one search so user sees something immediately
  useEffect(() => {
    if (!open) return;
    void runSearch(query);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function importIntoStorageOrUseDirect(url: string) {
    // ✅ We WANT to import into your own storage so Meta/IG/Threads can fetch reliably.
    // If you don't have an import route yet, we fallback to direct.
    try {
      const res = await fetch("/api/media/import-remote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ organisationId: organisationId || null, url }),
      });

      if (res.ok) {
        const json = await res.json().catch(() => null);
        const imported = safeStr(json?.url || json?.publicUrl || json?.signedUrl);
        if (imported) return imported;
      }
    } catch {
      // ignore
    }
    return url; // fallback: direct URL
  }

  const title = useMemo(() => {
    if (loading) return "Searching…";
    return "Search images (Commons)";
  }, [loading]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center px-4">
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/70"
      />

      {/* Panel */}
      <div className="relative w-full max-w-3xl rounded-3xl border border-slate-700 bg-slate-950 shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-slate-800 p-4">
          <div>
            <div className="text-xs text-slate-400">Root Health Ops</div>
            <div className="mt-1 text-lg font-semibold text-slate-100">{title}</div>
            <div className="mt-1 text-[12px] text-slate-400">
              Tip: pick an image → we try to import it into your storage so Meta can read it.
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
        <div className="max-h-[80vh] overflow-y-auto p-4">
          {/* Search row */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
              placeholder='Search e.g. "food", "therapy", "calm ocean"'
            />
            <button
              type="button"
              onClick={() => void runSearch(query)}
              disabled={loading || !query.trim()}
              className="rounded-2xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-60"
            >
              Search
            </button>
          </div>

          {error ? (
            <div className="mt-4 rounded-2xl border border-amber-500/40 bg-amber-950/30 px-4 py-3 text-sm text-amber-100">
              {error}
            </div>
          ) : null}

          {/* Results */}
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((it) => (
              <button
                key={it.url}
                type="button"
                onClick={async () => {
                  const finalUrl = await importIntoStorageOrUseDirect(it.url);
                  onPick(finalUrl);
                  onClose();
                }}
                className="group overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 text-left hover:border-slate-600"
                title="Click to select"
              >
                <div className="aspect-video w-full overflow-hidden bg-black/40">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={it.thumb || it.url}
                    alt={it.title}
                    className="h-full w-full object-cover transition group-hover:scale-[1.02]"
                  />
                </div>
                <div className="p-3">
                  <div className="text-[12px] font-semibold text-slate-200 line-clamp-2">
                    {it.title}
                  </div>
                  <div className="mt-1 text-[11px] text-slate-500 line-clamp-2 break-all">
                    {it.url}
                  </div>
                </div>
              </button>
            ))}
          </div>

          {loading ? (
            <div className="mt-4 text-sm text-slate-400">Loading…</div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
