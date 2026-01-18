// app/oauth/facebook/pick-page/pick-facebook-page-client.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";

type FbPage = {
  id: string;
  name: string;
  access_token?: string; // Page access token returned by /me/accounts
};

export default function PickFacebookPageClient({
  token,
}: {
  token?: string;
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
  const [pages, setPages] = useState<FbPage[]>([]);
  const [selectedPageId, setSelectedPageId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [debugOpen, setDebugOpen] = useState(false);

  const KNOWN_FUELGEIST_PAGE_ID = "101868201852363";
  const KNOWN_FUELGEIST_PAGE_NAME = "Fuel Geist Ltd";

  const debug = useMemo(() => {
    let href = "";
    try {
      href = window.location.href;
    } catch {}
    return {
      href,
      tokenResolvedLength: (resolvedToken || "").length,
    };
  }, [resolvedToken]);

  async function loadPages() {
    setLoading(true);
    setError(null);

    try {
      if (!resolvedToken) {
        setPages([]);
        setError(
          "No token in URL. Click Connect again so Facebook sends us a fresh token."
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
        const msg =
          json?.error?.message ||
          `Facebook Graph error (${res.status}).`;
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

      if (!selectedPageId) setSelectedPageId(list[0].id);
    } catch (e: any) {
      setError(e?.message || "Failed to load pages.");
      setPages([]);
    } finally {
      setLoading(false);
    }
  }

  async function savePage(page: { id: string; name: string; access_token?: string | null }) {
    setSaving(true);
    setError(null);

    try {
      const pageAccessToken =
        typeof page.access_token === "string" && page.access_token.trim()
          ? page.access_token.trim()
          : null;

      const res = await fetch("/api/social-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform: "facebook",
          pageId: page.id,
          pageName: page.name,
          connectionType: "facebook_oauth",
          makeWebhookUrl: null,
          isActive: true,
          pageAccessToken, // ✅ store it
          tokenExpiresAt: null, // we can add expiry later if you want
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

  async function saveQuickFuelGeist() {
    // If we have the list loaded, use the real page token from the list (best case)
    const found = pages.find((p) => p.id === KNOWN_FUELGEIST_PAGE_ID);
    if (found) return savePage(found);

    // Otherwise save without page token (still okay, but you’ll want to reconnect once to populate token)
    return savePage({ id: KNOWN_FUELGEIST_PAGE_ID, name: KNOWN_FUELGEIST_PAGE_NAME, access_token: null });
  }

  async function saveManual(pageId: string) {
    const clean = String(pageId || "").trim();
    if (!clean) {
      setError("Enter a Page ID.");
      return;
    }
    const found = pages.find((p) => p.id === clean);
    if (found) return savePage(found);

    return savePage({ id: clean, name: `Facebook Page ${clean}`, access_token: null });
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

          {/* Quick connect */}
          <div className="rounded-2xl border border-slate-700 bg-slate-950/40 p-4">
            <div className="text-sm font-semibold">Quick connect</div>
            <div className="mt-1 text-xs text-slate-300">
              This connects your known Page directly (no page list required).
            </div>

            <button
              type="button"
              onClick={saveQuickFuelGeist}
              disabled={saving}
              className="mt-3 w-full rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-60"
            >
              {saving ? "Saving…" : `Connect ${KNOWN_FUELGEIST_PAGE_NAME}`}
            </button>
            <div className="mt-2 text-[11px] text-slate-400">
              Page ID: {KNOWN_FUELGEIST_PAGE_ID}
            </div>
          </div>

          {/* Standard list (if token works) */}
          <div className="rounded-2xl border border-slate-700 bg-slate-950/40 p-4">
            <div className="text-sm font-semibold">Page list (from Facebook)</div>
            <div className="mt-1 text-xs text-slate-300">
              Uses Facebook’s <code className="bg-slate-900 px-1 py-0.5 rounded">/me/accounts</code>.
            </div>

            <div className="mt-3 space-y-2">
              <label className="block text-xs font-medium text-slate-300">Your Pages</label>
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
                  onClick={() => {
                    const page = pages.find((p) => p.id === selectedPageId);
                    if (!page) {
                      setError("Please select a page first.");
                      return;
                    }
                    void savePage(page);
                  }}
                  disabled={saving || !selectedPageId}
                  className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-60"
                >
                  {saving ? "Saving…" : "Use this Page"}
                </button>
              </div>
            </div>
          </div>

          {/* Manual */}
          <ManualConnect onConnect={saveManual} saving={saving} />

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

function ManualConnect({
  onConnect,
  saving,
}: {
  onConnect: (pageId: string) => void;
  saving: boolean;
}) {
  const [manualId, setManualId] = useState("");

  return (
    <div className="rounded-2xl border border-slate-700 bg-slate-950/40 p-4">
      <div className="text-sm font-semibold">Manual Page ID</div>
      <div className="mt-1 text-xs text-slate-300">
        Use this when connecting other customers later.
      </div>

      <div className="mt-3 flex gap-2">
        <input
          className="flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
          placeholder="Enter Page ID…"
          value={manualId}
          onChange={(e) => setManualId(e.target.value)}
        />
        <button
          type="button"
          onClick={() => onConnect(manualId)}
          disabled={saving}
          className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-60"
        >
          {saving ? "Saving…" : "Connect"}
        </button>
      </div>
    </div>
  );
}
