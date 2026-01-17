// app/oauth/instagram/pick-account/pick-instagram-account-client.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";

type FbPage = { id: string; name: string; access_token?: string };
type IgAccount = { id: string; username?: string; name?: string };

export default function PickInstagramAccountClient({
  token,
  state,
}: {
  token: string;
  state: string;
}) {
  const resolvedToken = useMemo(() => {
    if (token && token.trim()) return token.trim();
    try {
      const u = new URL(window.location.href);
      return (u.searchParams.get("token") || "").trim();
    } catch {
      return "";
    }
  }, [token]);

  const [loadingPages, setLoadingPages] = useState(false);
  const [pages, setPages] = useState<FbPage[]>([]);
  const [selectedPageId, setSelectedPageId] = useState<string>("");

  const [loadingIg, setLoadingIg] = useState(false);
  const [igAccount, setIgAccount] = useState<IgAccount | null>(null);

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
      hasState: !!state,
    };
  }, [token, resolvedToken, state]);

  async function loadPages() {
    setLoadingPages(true);
    setError(null);
    setIgAccount(null);

    try {
      if (!resolvedToken) {
        setError("Missing token. Please go back and click Connect again.");
        setPages([]);
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
        setPages([]);
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

      if (!selectedPageId) setSelectedPageId(list[0].id);
    } catch (e: any) {
      setError(e?.message || "Failed to load pages.");
      setPages([]);
    } finally {
      setLoadingPages(false);
    }
  }

  async function loadInstagramForSelectedPage(pageId: string) {
    setLoadingIg(true);
    setError(null);
    setIgAccount(null);

    try {
      const page = pages.find((p) => p.id === pageId);
      if (!page) {
        setError("Pick a Facebook Page first.");
        return;
      }

      // Use the PAGE access token to query linked IG business account
      const pageToken = page.access_token || "";
      if (!pageToken) {
        setError("Missing Page access token from /me/accounts. Reconnect and approve permissions.");
        return;
      }

      // The key field for IG Business is instagram_business_account
      const url =
        `https://graph.facebook.com/v24.0/${encodeURIComponent(pageId)}?` +
        new URLSearchParams({
          fields: "instagram_business_account{id,username,name}",
          access_token: pageToken,
        }).toString();

      const res = await fetch(url, { cache: "no-store" });
      const json: any = await res.json().catch(() => null);

      if (!res.ok) {
        const msg =
          json?.error?.message ||
          `Facebook Graph error (${res.status}). Could not fetch IG account for this Page.`;
        setError(msg);
        return;
      }

      const ig = json?.instagram_business_account as IgAccount | undefined;

      if (!ig?.id) {
        setError(
          "No Instagram Business account is linked to this Facebook Page.\n\nFix: In Meta Business Suite, ensure your Instagram professional account is connected to this Page."
        );
        return;
      }

      setIgAccount(ig);
    } catch (e: any) {
      setError(e?.message || "Failed to load Instagram account.");
    } finally {
      setLoadingIg(false);
    }
  }

  async function saveInstagramConnection() {
    setSaving(true);
    setError(null);

    try {
      if (!igAccount?.id) {
        setError("No Instagram account found. Choose a Page that has an IG business account linked.");
        return;
      }

      const displayName = igAccount.username || igAccount.name || "Instagram Account";

      const res = await fetch("/api/social-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform: "instagram",
          pageId: igAccount.id, // store IG account id in page_id for now
          pageName: displayName,
          connectionType: "oauth",
          makeWebhookUrl: null,
          isActive: true,
        }),
      });

      const data: any = await res.json().catch(() => null);

      if (!res.ok) {
        setError(data?.error || "Failed to save Instagram connection.");
        return;
      }

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

  // When selected page changes and we have pages loaded, look up IG account
  useEffect(() => {
    if (!selectedPageId || pages.length === 0) return;
    void loadInstagramForSelectedPage(selectedPageId);
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
            <div className="rounded-xl border border-red-500/40 bg-red-950/30 px-4 py-3 text-sm text-red-100 whitespace-pre-wrap">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <label className="block text-xs font-medium text-slate-300">
              Facebook Page (used to locate the linked Instagram Business account)
            </label>

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

            <div className="mt-3 rounded-xl border border-slate-700 bg-slate-950 p-3 text-sm">
              <div className="text-xs uppercase tracking-wide text-slate-400 mb-1">
                Detected Instagram account
              </div>

              {loadingIg ? (
                <div className="text-slate-300">Checking…</div>
              ) : igAccount?.id ? (
                <div className="text-slate-100">
                  <div>
                    <span className="text-slate-400">Account:</span>{" "}
                    <span className="font-medium">
                      {igAccount.username || igAccount.name || igAccount.id}
                    </span>
                  </div>
                  <div className="text-xs text-slate-400 mt-1">IG ID: {igAccount.id}</div>
                </div>
              ) : (
                <div className="text-slate-300">
                  None found for this Page yet.
                </div>
              )}
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
                onClick={saveInstagramConnection}
                disabled={saving || !igAccount?.id}
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
{JSON.stringify({ ...debug }, null, 2)}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}
