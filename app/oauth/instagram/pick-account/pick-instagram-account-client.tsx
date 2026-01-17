// app/oauth/instagram/pick-account/pick-instagram-account-client.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";

type IgOption = {
  pageId: string;
  pageName: string;
  igId: string;
  igName: string;
};

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
      const t = u.searchParams.get("token") || "";
      return t.trim();
    } catch {
      return "";
    }
  }, [token]);

  const [loading, setLoading] = useState(false);
  const [options, setOptions] = useState<IgOption[]>([]);
  const [selectedIgId, setSelectedIgId] = useState<string>("");
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

  async function loadInstagramAccounts() {
    setLoading(true);
    setError(null);

    try {
      if (!resolvedToken) {
        setError("Missing token. Please go back and click Connect again.");
        setOptions([]);
        return;
      }

      // Strategy:
      // 1) List Pages the user manages: /me/accounts
      // 2) For each Page, request instagram_business_account
      // 3) Keep only Pages that have an IG business account attached

      const listPagesUrl =
        "https://graph.facebook.com/v24.0/me/accounts?" +
        new URLSearchParams({
          fields: "id,name,access_token",
          limit: "100",
          access_token: resolvedToken,
        }).toString();

      const pageRes = await fetch(listPagesUrl, { cache: "no-store" });
      const pageJson: any = await pageRes.json().catch(() => null);

      if (!pageRes.ok) {
        const msg =
          pageJson?.error?.message ||
          `Facebook Graph error (${pageRes.status}). Check permissions/scopes.`;
        setError(msg);
        setOptions([]);
        return;
      }

      const pages: Array<{ id: string; name: string; access_token?: string }> = Array.isArray(
        pageJson?.data
      )
        ? pageJson.data
        : [];

      if (pages.length === 0) {
        setError("No Facebook Pages found for this account.");
        setOptions([]);
        return;
      }

      const found: IgOption[] = [];

      // Query IG account per page
      for (const p of pages) {
        const pageToken = p.access_token || resolvedToken;

        const pageInfoUrl =
          `https://graph.facebook.com/v24.0/${encodeURIComponent(p.id)}?` +
          new URLSearchParams({
            fields: "instagram_business_account{name,username,id}",
            access_token: pageToken,
          }).toString();

        const infoRes = await fetch(pageInfoUrl, { cache: "no-store" });
        const infoJson: any = await infoRes.json().catch(() => null);

        if (!infoRes.ok) {
          // skip silently; user may not have rights on some pages
          continue;
        }

        const ig = infoJson?.instagram_business_account;
        if (ig?.id) {
          found.push({
            pageId: p.id,
            pageName: p.name,
            igId: String(ig.id),
            igName: String(ig.name || ig.username || "Instagram Account"),
          });
        }
      }

      setOptions(found);

      if (found.length === 0) {
        setError(
          "No Instagram Business account found. Make sure your Instagram is a Business/Creator account and is linked to a Facebook Page."
        );
        return;
      }

      if (!selectedIgId) setSelectedIgId(found[0].igId);
    } catch (e: any) {
      setError(e?.message || "Failed to load Instagram accounts.");
      setOptions([]);
    } finally {
      setLoading(false);
    }
  }

  async function saveSelection() {
    setSaving(true);
    setError(null);

    try {
      const chosen = options.find((o) => o.igId === selectedIgId);
      if (!chosen) {
        setError("Please pick an Instagram account first.");
        return;
      }

      // Save into your DB via API:
      // We'll store ig account id in page_id for instagram rows (simple + works)
      const res = await fetch("/api/social-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform: "instagram",
          pageId: chosen.igId,
          pageName: chosen.igName,
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

      // Back to connect page
      window.location.href = "/dashboard/connect?provider=instagram&success=1";
    } catch (e: any) {
      setError(e?.message || "Failed to save Instagram connection.");
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    void loadInstagramAccounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-2xl rounded-3xl border border-slate-700 bg-slate-900/70 p-6 md:p-10 shadow-xl backdrop-blur">
        <h1 className="text-2xl font-semibold">Pick your Instagram account</h1>
        <p className="mt-2 text-sm text-slate-300">
          We’ll connect the Instagram Business account linked to your Facebook Page.
        </p>

        <div className="mt-6 space-y-3">
          {error && (
            <div className="rounded-xl border border-red-500/40 bg-red-950/30 px-4 py-3 text-sm text-red-100">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <label className="block text-xs font-medium text-slate-300">Instagram accounts</label>

            <select
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
              value={selectedIgId}
              onChange={(e) => setSelectedIgId(e.target.value)}
              disabled={loading || options.length === 0}
            >
              {options.length === 0 ? (
                <option value="">No Instagram accounts loaded</option>
              ) : (
                options.map((o) => (
                  <option key={o.igId} value={o.igId}>
                    {o.igName} (via {o.pageName})
                  </option>
                ))
              )}
            </select>

            <div className="flex flex-wrap gap-3 pt-3">
              <button
                type="button"
                onClick={loadInstagramAccounts}
                disabled={loading}
                className="rounded-xl border border-slate-600 bg-slate-900/80 px-4 py-2 text-sm text-slate-100 hover:border-slate-500 disabled:opacity-60"
              >
                {loading ? "Loading…" : "Reload"}
              </button>

              <button
                type="button"
                onClick={saveSelection}
                disabled={saving || !selectedIgId}
                className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-60"
              >
                {saving ? "Saving…" : "Use this Instagram"}
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
