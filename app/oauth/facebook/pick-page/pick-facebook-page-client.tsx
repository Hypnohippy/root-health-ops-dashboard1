// app/oauth/facebook/pick-page/pick-facebook-page-client.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";

type FbPage = {
  id: string;
  name: string;
  access_token?: string; // page token
};

export default function PickFacebookPageClient({
  token,
  state,
}: {
  token: string;
  state: string;
}) {
  const resolvedToken = useMemo(() => {
    // Prefer prop; fallback to URL query (some deployments strip props)
    if (token && token.trim()) return token.trim();
    try {
      const u = new URL(window.location.href);
      const t = u.searchParams.get("token") || "";
      return t.trim();
    } catch {
      return "";
    }
  }, [token]);

  const [loading, setLoading] = useState(false);
  const [pages, setPages] = useState<FbPage[]>([]);
  const [selectedPageId, setSelectedPageId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [debugOpen, setDebugOpen] = useState(false);

  const debug = useMemo(() => {
    let href = "";
    let search = "";
    let hash = "";
    try {
      href = window.location.href;
      search = window.location.search;
      hash = window.location.hash;
    } catch {}

    return {
      href,
      search,
      hash,
      tokenPropLength: (token || "").length,
      tokenResolvedLength: (resolvedToken || "").length,
      hasOrganisationId: false,
    };
  }, [token, resolvedToken]);

  async function loadPages() {
    setLoading(true);
    setError(null);

    try {
      if (!resolvedToken) {
        setError("Missing token. Please go back and click Connect again.");
        setPages([]);
        return;
      }

      // ✅ This endpoint should return pages you manage for THIS logged-in user
      // Needs scopes: pages_show_list + pages_read_engagement (already requested)
      const url =
        "https://graph.facebook.com/v24.0/me/accounts?" +
        new URLSearchParams({
          fields: "id,name,access_token",
          limit: "100",
          access_token: resolvedToken,
        }).toString();

      const res = await fetch(url, { cache: "no-store" });
      const json: any = await res.json().catch(() => null);

      if (!res.ok) {
        const msg =
          json?.error?.message ||
          `Facebook Graph error (${res.status}). Check permissions/scopes.`;
        setError(msg);
        setPages([]);
        return;
      }

      const list: FbPage[] = Array.isArray(json?.data) ? json.data : [];
      setPages(list);

      if (list.length === 0) {
        setError("No Pages returned.");
        return;
      }

      // Auto-select the first one if none selected
      if (!selectedPageId) setSelectedPageId(list[0].id);
    } catch (e: any) {
      setError(e?.message || "Failed to load pages.");
      setPages([]);
    } finally {
      setLoading(false);
    }
  }

  async function saveSelection() {
    setSaving(true);
    setError(null);

    try {
      const page = pages.find((p) => p.id === selectedPageId);
      if (!page) {
        setError("Please pick a Page first.");
        return;
      }

      // Save into your DB via API:
      // - platform: facebook
      // - pageId: the Page ID
      // - pageName: human name
      // - connectionType: oauth
      // - isActive: true
      const res = await fetch("/api/social-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform: "facebook",
          pageId: page.id,
          pageName: page.name,
          connectionType: "oauth",
          makeWebhookUrl: null,
          isActive: true,
        }),
      });

      const data: any = await res.json().catch(() => null);

      if (!res.ok) {
        setError(data?.error || "Failed to save selected Page.");
        return;
      }

      // ✅ Done — send them back to Connect so they can see it as connected
      window.location.href = "/dashboard/connect?provider=facebook&success=1";
    } catch (e: any) {
      setError(e?.message || "Failed to save selected Page.");
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

        <div className="mt-6 space-y-3">
          {error && (
            <div className="rounded-xl border border-red-500/40 bg-red-950/30 px-4 py-3 text-sm text-red-100">
              {error}
            </div>
          )}

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
                onClick={saveSelection}
                disabled={saving || !selectedPageId}
                className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-60"
              >
                {saving ? "Saving…" : "Use this Page"}
              </button>
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
{JSON.stringify({ ...debug, decodedState: state ? "(present)" : null }, null, 2)}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}
