"use client";

import React, { useEffect, useMemo, useState } from "react";

type FbPage = {
  id: string;
  name: string;
  access_token?: string; // page token (only returned by /me/accounts)
};

// ✅ Your known Page (single-tenant beta shortcut)
const KNOWN_PAGE_ID = "101868201852363";
const KNOWN_PAGE_NAME = "Fuel Geist Ltd";

export default function PickFacebookPageClient({
  token,
  state,
}: {
  token?: string;
  state?: string;
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
  const [okMsg, setOkMsg] = useState<string | null>(null);

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
      hasState: !!(state && String(state).trim()),
    };
  }, [resolvedToken, pages.length, selectedPageId, state]);

  async function loadPages() {
    setLoading(true);
    setError(null);
    setOkMsg(null);

    try {
      if (!resolvedToken) {
        // ✅ IMPORTANT CHANGE:
        // Don’t treat this as a fatal error — list mode is optional.
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
        setError("No Facebook Pages returned for list mode.");
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

  async function saveSelection(pageId: string, pageName: string) {
    setSaving(true);
    setError(null);
    setOkMsg(null);

    try {
      const res = await fetch("/api/social-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform: "facebook",
          pageId,
          pageName,
          connectionType: "facebook_oauth",
          makeWebhookUrl: null,
          isActive: true,
        }),
      });

      const data: any = await res.json().catch(() => null);

      if (!res.ok) {
        setError(data?.error || "Failed to save selected Page.");
        return;
      }

      setOkMsg(`Connected: ${pageName} ✅`);

      // Back to Connect so it shows Connected
      window.location.href = "/dashboard/connect?provider=facebook&success=1";
    } catch (e: any) {
      setError(e?.message || "Failed to save selected Page.");
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    // List mode is optional — try it once if token exists
    void loadPages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const listModeAvailable = !!resolvedToken;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-2xl rounded-3xl border border-slate-700 bg-slate-900/70 p-6 md:p-10 shadow-xl backdrop-blur">
        <h1 className="text-2xl font-semibold">Pick your Facebook Page</h1>
        <p className="mt-2 text-sm text-slate-300">
          Select which Page Root Health Ops should connect to.
        </p>

        {/* ✅ Quick connect ALWAYS available */}
        <div className="mt-6 rounded-2xl border border-emerald-500/30 bg-slate-900/80 p-4">
          <div className="text-sm font-semibold text-slate-50">Quick connect</div>
          <div className="mt-1 text-xs text-slate-300">
            This connects your known Page directly (no page list required).
          </div>

          <button
            type="button"
            onClick={() => saveSelection(KNOWN_PAGE_ID, KNOWN_PAGE_NAME)}
            disabled={saving}
            className="mt-3 inline-flex items-center rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-60"
          >
            {saving ? "Connecting…" : `Connect ${KNOWN_PAGE_NAME}`}
          </button>

          <div className="mt-2 text-[11px] text-slate-400">Page ID: {KNOWN_PAGE_ID}</div>
        </div>

        {/* ✅ List mode explanation (no scary red error) */}
        {!listModeAvailable && (
          <div className="mt-4 rounded-xl border border-slate-700 bg-slate-950/40 px-4 py-3 text-sm text-slate-200">
            List mode isn’t available on this load (no user token present). That’s fine — Quick
            connect above will still connect your Page.
          </div>
        )}

        {error && (
          <div className="mt-4 rounded-xl border border-red-500/40 bg-red-950/30 px-4 py-3 text-sm text-red-100">
            {error}
          </div>
        )}

        {okMsg && (
          <div className="mt-4 rounded-xl border border-emerald-500/40 bg-emerald-950/20 px-4 py-3 text-sm text-emerald-100">
            {okMsg}
          </div>
        )}

        {/* List mode UI (only if token exists) */}
        {listModeAvailable && (
          <div className="mt-6 space-y-2">
            <label className="block text-xs font-medium text-slate-300">Your Pages (list mode)</label>

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
                onClick={() => {
                  const page = pages.find((p) => p.id === selectedPageId);
                  if (page) void saveSelection(page.id, page.name);
                  else setError("Please pick a Page first.");
                }}
                disabled={saving || !selectedPageId}
                className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-60"
              >
                {saving ? "Saving…" : "Use this Page"}
              </button>
            </div>
          </div>
        )}

        <button
          type="button"
          className="mt-6 text-xs text-slate-400 hover:text-slate-300"
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
  );
}
