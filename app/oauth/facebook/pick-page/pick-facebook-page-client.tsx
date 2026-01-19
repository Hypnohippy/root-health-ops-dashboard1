"use client";

import React, { useEffect, useMemo, useState } from "react";

type FbPage = {
  id: string;
  name: string;
  access_token?: string;
};

export default function PickFacebookPageClient({
  state,
}: {
  state?: string;
}) {
  const [loading, setLoading] = useState(false);
  const [pages, setPages] = useState<FbPage[]>([]);
  const [selectedPageId, setSelectedPageId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [debugOpen, setDebugOpen] = useState(false);

  const [manualPageId, setManualPageId] = useState<string>("");

  const debug = useMemo(() => {
    let href = "";
    try {
      href = window.location.href;
    } catch {}
    return {
      href,
      pagesCount: pages.length,
      selectedPageId,
      hasState: Boolean(state && state.trim()),
    };
  }, [pages.length, selectedPageId, state]);

  async function loadPages() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/oauth/facebook/pages", { cache: "no-store" });
      const json: any = await res.json().catch(() => null);

      if (!res.ok) {
        setError(json?.error || "Failed to load pages.");
        setPages([]);
        return;
      }

      const list: FbPage[] = Array.isArray(json?.pages) ? json.pages : [];
      setPages(list);

      if (list.length === 0) {
        setError(
          "No Facebook Pages returned. This usually means Facebook did not grant Page access in this login."
        );
        return;
      }

      if (!selectedPageId) setSelectedPageId(list[0].id);
    } catch (e: any) {
      setError(e?.message || "Failed to load pages.");
      setPages([]);
    } finally {
      setLoading(false);
    }
  }

  async function saveFromList() {
    setSaving(true);
    setError(null);

    try {
      const page = pages.find((p) => p.id === selectedPageId);
      if (!page) {
        setError("Please pick a Page first.");
        return;
      }

      const res = await fetch("/api/oauth/facebook/save-page", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pageId: page.id,
          pageName: page.name,
          pageAccessToken: page.access_token || "",
        }),
      });

      const data: any = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error || "Failed to save selected Page.");
        return;
      }

      window.location.href = "/dashboard/connect?provider=facebook&success=1";
    } catch (e: any) {
      setError(e?.message || "Failed to save selected Page.");
    } finally {
      setSaving(false);
    }
  }

  async function saveByPageId(pageId: string) {
    const cleaned = (pageId || "").trim();
    if (!cleaned) {
      setError("Enter a Page ID first.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/oauth/facebook/save-page", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pageId: cleaned }),
      });

      const data: any = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error || "Failed to connect Page by ID.");
        return;
      }

      window.location.href = "/dashboard/connect?provider=facebook&success=1";
    } catch (e: any) {
      setError(e?.message || "Failed to connect Page by ID.");
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    void loadPages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-2xl rounded-3xl border border-slate-700 bg-slate-900/70 p-6 md:p-10 shadow-xl backdrop-blur">
        <h1 className="text-2xl font-semibold">Pick your Facebook Page</h1>
        <p className="mt-2 text-sm text-slate-300">
          Select which Page Root Health Ops should connect to.
        </p>

        <div className="mt-6 space-y-4">
          {error && (
            <div className="rounded-xl border border-red-500/40 bg-red-950/30 px-4 py-3 text-sm text-red-100">
              {error}
            </div>
          )}

          {/* Normal path (if Facebook returns pages) */}
          <div className="space-y-2">
            <label className="block text-xs font-medium text-slate-300">
              Your Pages
            </label>

            <select
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
              value={selectedPageId}
              onChange={(e) => setSelectedPageId(e.target.value)}
              disabled={loading || pages.length === 0}
            >
              {pages.length === 0 ? (
                <option value="">No pages loaded</option>
              ) : (
                pages.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.id})
                  </option>
                ))
              )}
            </select>

            <div className="flex flex-wrap gap-3 pt-3">
              <button
                type="button"
                onClick={loadPages}
                disabled={loading}
                className="rounded-xl border border-slate-600 bg-slate-900/80 px-4 py-2 text-sm text-slate-100 hover:border-slate-500 disabled:opacity-60"
              >
                {loading ? "Loading…" : "Reload Pages"}
              </button>

              <button
                type="button"
                onClick={() => window.location.reload()}
                className="rounded-xl border border-slate-600 bg-slate-900/80 px-4 py-2 text-sm text-slate-100 hover:border-slate-500"
              >
                Refresh page
              </button>

              <button
                type="button"
                onClick={saveFromList}
                disabled={saving || !selectedPageId || pages.length === 0}
                className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-60"
              >
                {saving ? "Saving…" : "Use this Page"}
              </button>
            </div>
          </div>

          {/* Fallback path (when pages list is empty) */}
          <div className="rounded-2xl border border-slate-700 bg-slate-950/40 p-4">
            <div className="text-sm font-semibold">Quick connect</div>
            <div className="mt-1 text-xs text-slate-300">
              If Facebook returns no pages, connect by Page ID (works for customers later too).
            </div>

            <div className="mt-4 space-y-3">
              <button
                type="button"
                onClick={() => saveByPageId("101868201852363")}
                disabled={saving}
                className="w-full rounded-xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-60"
              >
                {saving ? "Connecting…" : "Connect Fuel Geist Ltd (101868201852363)"}
              </button>

              <div className="text-xs text-slate-400">Manual Page ID</div>
              <div className="flex gap-2">
                <input
                  className="flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                  placeholder="Enter Page ID…"
                  value={manualPageId}
                  onChange={(e) => setManualPageId(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => saveByPageId(manualPageId)}
                  disabled={saving || !manualPageId.trim()}
                  className="rounded-xl border border-slate-600 bg-slate-900/80 px-4 py-2 text-sm text-slate-100 hover:border-slate-500 disabled:opacity-60"
                >
                  Connect
                </button>
              </div>
            </div>
          </div>

          <button
            type="button"
            className="text-xs text-slate-400 hover:text-slate-300"
            onClick={() => setDebugOpen((s) => !s)}
          >
            Debug (click to expand)
          </button>

          {debugOpen && (
            <pre className="mt-2 max-h-64 overflow-auto rounded-xl border border-slate-700 bg-slate-950 p-3 text-[11px] text-slate-200">
              {JSON.stringify(debug, null, 2)}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}
