// app/oauth/instagram/pick-account/pick-instagram-account-client.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";

type FbPage = { id: string; name: string; access_token?: string };
type IgAccount = { id: string; username?: string; name?: string };

function getQueryToken() {
  try {
    const u = new URL(window.location.href);
    return (u.searchParams.get("token") || "").trim();
  } catch {
    return "";
  }
}

export default function PickInstagramAccountClient({
  token,
}: {
  token?: string;
}) {
  const resolvedToken = useMemo(() => {
    const t = (token || "").trim();
    return t || getQueryToken();
  }, [token]);

  const [loadingPages, setLoadingPages] = useState(false);
  const [pages, setPages] = useState<FbPage[]>([]);
  const [selectedPageId, setSelectedPageId] = useState<string>("");
  const [ig, setIg] = useState<IgAccount | null>(null);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [debugOpen, setDebugOpen] = useState(false);

  const debug = useMemo(() => {
    let href = "";
    try {
      href = window.location.href;
    } catch {}
    return {
      href,
      tokenResolvedLength: (resolvedToken || "").length,
      pagesCount: pages.length,
      selectedPageId,
      ig,
    };
  }, [resolvedToken, pages.length, selectedPageId, ig]);

  async function loadPages() {
    setLoadingPages(true);
    setError(null);
    setPages([]);
    setIg(null);

    try {
      if (!resolvedToken) {
        setError("Missing token. Please go back and click Connect again.");
        return;
      }

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
        return;
      }

      const list: FbPage[] = Array.isArray(json?.data) ? json.data : [];
      setPages(list);

      if (list.length === 0) {
        setError(
          "No Facebook Pages returned. Instagram Business must be linked to a Facebook Page you manage."
        );
        return;
      }

      setSelectedPageId(list[0].id);
    } catch (e: any) {
      setError(e?.message || "Failed to load Facebook Pages.");
    } finally {
      setLoadingPages(false);
    }
  }

  async function detectIgForPage(page: FbPage) {
    setError(null);
    setIg(null);

    try {
      if (!page?.access_token) {
        setError("Missing Page access token for this Page. Try reconnecting and re-approving permissions.");
        return;
      }

      // Ask the Page for its connected Instagram business account
      const url =
        `https://graph.facebook.com/v24.0/${encodeURIComponent(page.id)}?` +
        new URLSearchParams({
          fields: "connected_instagram_account{username,name,id}",
          access_token: page.access_token,
        }).toString();

      const res = await fetch(url, { cache: "no-store" });
      const json: any = await res.json().catch(() => null);

      if (!res.ok) {
        const msg =
          json?.error?.message ||
          `Graph error (${res.status}) when checking connected_instagram_account`;
        setError(msg);
        return;
      }

      const acct: IgAccount | null = json?.connected_instagram_account || null;

      if (!acct?.id) {
        setIg(null);
        return;
      }

      setIg(acct);
    } catch (e: any) {
      setError(e?.message || "Failed to detect Instagram account.");
    }
  }

  async function saveSelection() {
    setSaving(true);
    setError(null);

    try {
      const page = pages.find((p) => p.id === selectedPageId);
      if (!page) throw new Error("Please pick a Facebook Page first.");
      if (!ig?.id) throw new Error("No Instagram account detected for this Page yet.");

      // Save IG connection (store the IG business account id as page_id)
      const res = await fetch("/api/social-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform: "instagram",
          pageId: ig.id,
          pageName: ig.username || ig.name || "Instagram",
          connectionType: "oauth",
          makeWebhookUrl: null,
          isActive: true,

          // ✅ Save token too (we keep the Page token; that's what IG Graph calls use)
          pageAccessToken: page.access_token || null,
          tokenExpiresAt: null,
        }),
      });

      const data: any = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Failed to save Instagram connection");

      window.location.href = "/dashboard/connect?provider=instagram&success=1";
    } catch (e: any) {
      setError(e?.message || "Failed to save Instagram connection.");
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    void loadPages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const page = pages.find((p) => p.id === selectedPageId);
    if (!page) return;
    void detectIgForPage(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPageId, pages.length]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-2xl rounded-3xl border border-slate-700 bg-slate-900/70 p-6 md:p-10 shadow-xl backdrop-blur">
        <h1 className="text-2xl font-semibold">Pick your Instagram account</h1>
        <p className="mt-2 text-sm text-slate-300">
          Instagram Business accounts are linked to a Facebook Page. Choose the Page, then we’ll detect the linked Instagram account.
        </p>

        <div className="mt-6 space-y-3">
          {error && (
            <div className="rounded-xl border border-red-500/40 bg-red-950/30 px-4 py-3 text-sm text-red-100">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <div className="text-xs font-medium text-slate-300">
              Facebook Page (used to locate the linked Instagram Business account)
            </div>

            <select
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
              value={selectedPageId}
              onChange={(e) => setSelectedPageId(e.target.value)}
              disabled={loadingPages || pages.length === 0}
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

            <div className="mt-3 rounded-xl border border-slate-700 bg-slate-950/40 px-4 py-3">
              <div className="text-xs font-medium text-slate-300">Detected Instagram account</div>
              <div className="mt-1 text-sm text-slate-100">
                {ig?.id ? (
                  <>
                    {ig.username ? <span className="font-semibold">@{ig.username}</span> : <span className="font-semibold">{ig.name || "Instagram"}</span>}
                    <span className="ml-2 text-xs text-slate-400">({ig.id})</span>
                  </>
                ) : (
                  <span className="text-slate-400">None found for this Page yet.</span>
                )}
              </div>
            </div>

            <div className="flex flex-wrap gap-3 pt-3">
              <button
                type="button"
                onClick={loadPages}
                disabled={loadingPages}
                className="rounded-xl border border-slate-600 bg-slate-900/80 px-4 py-2 text-sm text-slate-100 hover:border-slate-500 disabled:opacity-60"
              >
                {loadingPages ? "Loading…" : "Reload Pages"}
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
                disabled={saving || !ig?.id}
                className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-60"
              >
                {saving ? "Saving…" : "Use this Instagram account"}
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
{JSON.stringify(debug, null, 2)}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}
