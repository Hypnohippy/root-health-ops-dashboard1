// app/oauth/instagram/pick-account/pick-instagram-account-client.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";

type SocialAccountRow = {
  platform: string;
  page_id: string | null;
  page_name: string | null;
  page_access_token: string | null;
};

type FbPage = { id: string; name: string; access_token?: string };
type IgAccount = { id: string; username?: string; name?: string };

export default function PickInstagramAccountClient({ token }: { token?: string }) {
  // Token may still be useful as a fallback path, but we will prefer DB-based FB connection.
  const resolvedToken = useMemo(() => {
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
  const [saving, setSaving] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [debugOpen, setDebugOpen] = useState(false);

  // Preferred path: use already-connected Facebook Page from DB
  const [fbFromDb, setFbFromDb] = useState<{
    pageId: string;
    pageName: string;
    pageToken: string;
  } | null>(null);

  // Fallback path: load pages from /me/accounts (if DB token missing)
  const [pages, setPages] = useState<FbPage[]>([]);
  const [selectedPageId, setSelectedPageId] = useState<string>("");

  const [detectedIg, setDetectedIg] = useState<IgAccount | null>(null);

  const debug = useMemo(() => {
    let href = "";
    try {
      href = window.location.href;
    } catch {}
    return {
      href,
      tokenResolvedLength: (resolvedToken || "").length,
      fbFromDb,
      pagesCount: pages.length,
      selectedPageId,
      detectedIg,
    };
  }, [resolvedToken, fbFromDb, pages.length, selectedPageId, detectedIg]);

  async function loadFacebookFromDb() {
    try {
      const res = await fetch("/api/social-accounts", { cache: "no-store" });
      const json: any = await res.json().catch(() => null);

      const list: SocialAccountRow[] = Array.isArray(json?.socialAccounts)
        ? json.socialAccounts
        : [];

      const fb = list.find((r) => String(r.platform).toLowerCase() === "facebook");

      if (!fb?.page_id || !fb?.page_access_token) {
        setFbFromDb(null);
        return;
      }

      setFbFromDb({
        pageId: fb.page_id,
        pageName: fb.page_name || "Facebook Page",
        pageToken: fb.page_access_token,
      });
    } catch {
      setFbFromDb(null);
    }
  }

  async function loadPagesFallback() {
    // Only used if DB method isn't available
    setLoading(true);
    setError(null);

    try {
      if (!resolvedToken) {
        setPages([]);
        setError(
          "No token available for fallback page load. Please click Connect again."
        );
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
        setPages([]);
        setError(json?.error?.message || `Facebook Graph error (${res.status}).`);
        return;
      }

      const list: FbPage[] = Array.isArray(json?.data) ? json.data : [];
      setPages(list);

      if (list.length === 0) {
        setError(
          "No Facebook Pages returned. This usually means Facebook didn't grant Page access to this token. Use the DB method (connect Facebook first) or reconnect and choose the Page in the permissions dialog."
        );
        return;
      }

      if (!selectedPageId) setSelectedPageId(list[0].id);
    } catch (e: any) {
      setPages([]);
      setError(e?.message || "Failed to load Facebook Pages.");
    } finally {
      setLoading(false);
    }
  }

  async function detectInstagramUsingPage(pageId: string, pageToken: string) {
    setError(null);
    setDetectedIg(null);

    try {
      // 1) Get instagram_business_account linked to this Page
      const pageInfoUrl =
        `https://graph.facebook.com/v24.0/${encodeURIComponent(pageId)}?` +
        new URLSearchParams({
          fields: "instagram_business_account",
          access_token: pageToken,
        }).toString();

      const pageRes = await fetch(pageInfoUrl, { cache: "no-store" });
      const pageJson: any = await pageRes.json().catch(() => null);

      const igId = pageJson?.instagram_business_account?.id;

      if (!pageRes.ok || !igId) {
        setError(
          pageJson?.error?.message ||
            "No Instagram Business account detected for this Facebook Page. Make sure the Instagram account is linked to the Page in Meta Business Suite."
        );
        return;
      }

      // 2) Fetch IG profile info (username)
      const igInfoUrl =
        `https://graph.facebook.com/v24.0/${encodeURIComponent(igId)}?` +
        new URLSearchParams({
          fields: "username,name",
          access_token: pageToken,
        }).toString();

      const igRes = await fetch(igInfoUrl, { cache: "no-store" });
      const igJson: any = await igRes.json().catch(() => null);

      if (!igRes.ok) {
        setError(igJson?.error?.message || "Failed to fetch Instagram profile info.");
        return;
      }

      setDetectedIg({
        id: String(igId),
        username: igJson?.username,
        name: igJson?.name,
      });
    } catch (e: any) {
      setError(e?.message || "Failed to detect Instagram account.");
    }
  }

  async function saveInstagram(pageToken: string) {
    setSaving(true);
    setError(null);

    try {
      if (!detectedIg?.id) {
        setError("No Instagram account detected yet.");
        return;
      }

      const igName =
        detectedIg.username || detectedIg.name || `Instagram ${detectedIg.id}`;

      const res = await fetch("/api/social-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform: "instagram",
          pageId: detectedIg.id, // IG business account id
          pageName: igName,
          connectionType: "oauth",
          makeWebhookUrl: null,
          isActive: true,
          pageAccessToken: pageToken, // ✅ store Page token for IG Graph calls
          tokenExpiresAt: null,
        }),
      });

      const data: any = await res.json().catch(() => null);

      if (!res.ok) {
        setError(data?.error || "Failed to save Instagram account.");
        return;
      }

      window.location.href = "/dashboard/connect?provider=instagram&success=1";
    } catch (e: any) {
      setError(e?.message || "Failed to save Instagram account.");
    } finally {
      setSaving(false);
    }
  }

  // Boot: try DB route first
  useEffect(() => {
    void loadFacebookFromDb();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When FB from DB is present, auto-detect IG immediately
  useEffect(() => {
    if (fbFromDb?.pageId && fbFromDb?.pageToken) {
      void detectInstagramUsingPage(fbFromDb.pageId, fbFromDb.pageToken);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fbFromDb?.pageId, fbFromDb?.pageToken]);

  // If DB not available, attempt fallback list load (optional)
  useEffect(() => {
    if (!fbFromDb) {
      void loadPagesFallback();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fbFromDb]);

  // If fallback page selection changes, detect IG via selected page token
  useEffect(() => {
    if (!fbFromDb && selectedPageId) {
      const page = pages.find((p) => p.id === selectedPageId);
      if (page?.access_token) {
        void detectInstagramUsingPage(page.id, page.access_token);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPageId, pages.length, fbFromDb]);

  const activePageToken =
    fbFromDb?.pageToken ||
    pages.find((p) => p.id === selectedPageId)?.access_token ||
    "";

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-2xl rounded-3xl border border-slate-700 bg-slate-900/70 p-6 md:p-10 shadow-xl backdrop-blur">
        <h1 className="text-2xl font-semibold">Pick your Instagram account</h1>
        <p className="mt-2 text-sm text-slate-300">
          Instagram Business accounts are linked to a Facebook Page. We’ll use your
          connected Facebook Page (recommended), or fall back to Facebook’s page list.
        </p>

        <div className="mt-6 space-y-3">
          {error && (
            <div className="rounded-xl border border-red-500/40 bg-red-950/30 px-4 py-3 text-sm text-red-100">
              {error}
            </div>
          )}

          {/* Preferred: DB Facebook connection */}
          <div className="rounded-2xl border border-slate-700 bg-slate-950/40 p-4">
            <div className="text-sm font-semibold">Recommended: Use your connected Facebook Page</div>
            <div className="mt-1 text-xs text-slate-300">
              This avoids fragile user tokens and makes onboarding easier for customers.
            </div>

            {fbFromDb ? (
              <div className="mt-3 rounded-xl border border-slate-700 bg-slate-950 p-3 text-sm">
                <div className="text-xs text-slate-400">Connected Facebook Page</div>
                <div className="mt-1">
                  {fbFromDb.pageName} ({fbFromDb.pageId})
                </div>
              </div>
            ) : (
              <div className="mt-3 text-sm text-slate-300">
                No connected Facebook Page with a saved Page token was found.
                <div className="mt-2 text-xs text-slate-400">
                  Fix: connect Facebook again so we can store <code className="bg-slate-900 px-1 py-0.5 rounded">page_access_token</code>.
                </div>
              </div>
            )}
          </div>

          {/* Fallback: /me/accounts list */}
          {!fbFromDb && (
            <div className="rounded-2xl border border-slate-700 bg-slate-950/40 p-4">
              <div className="text-sm font-semibold">Fallback: load Pages from Facebook</div>
              <div className="mt-1 text-xs text-slate-300">
                Uses <code className="bg-slate-900 px-1 py-0.5 rounded">/me/accounts</code>. This often fails if Facebook didn’t grant page access.
              </div>

              <div className="mt-3 space-y-2">
                <label className="block text-xs font-medium text-slate-300">
                  Facebook Page
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
                    onClick={loadPagesFallback}
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
                </div>
              </div>
            </div>
          )}

          {/* Detected IG */}
          <div className="rounded-2xl border border-slate-700 bg-slate-950/40 p-4">
            <div className="text-xs text-slate-400">Detected Instagram account</div>
            <div className="mt-1 text-sm">
              {detectedIg
                ? `${detectedIg.username || detectedIg.name || "(unknown)"} (${detectedIg.id})`
                : "None found yet."}
            </div>

            <button
              type="button"
              onClick={() => void saveInstagram(activePageToken)}
              disabled={saving || !detectedIg || !activePageToken}
              className="mt-3 w-full rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-60"
            >
              {saving ? "Saving…" : "Use this Instagram account"}
            </button>
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
