// app/oauth/facebook/pick-page/pick-facebook-page-client.tsx
"use client";

import React, { useMemo, useState } from "react";

type FbPage = { id: string; name: string };

const KNOWN_FUEL_GEIST_PAGE: FbPage = {
  id: "101868201852363",
  name: "Fuel Geist Ltd",
};

export default function PickFacebookPageClient({
  token,
  state,
}: {
  token: string;
  state: string;
}) {
  const resolvedUserToken = useMemo(() => {
    if (token && token.trim()) return token.trim();
    try {
      const u = new URL(window.location.href);
      return (u.searchParams.get("token") || "").trim();
    } catch {
      return "";
    }
  }, [token]);

  const [manualPageId, setManualPageId] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [debugOpen, setDebugOpen] = useState(false);

  const debug = useMemo(() => {
    let href = "";
    try {
      href = window.location.href;
    } catch {}
    return {
      href,
      tokenResolvedLength: (resolvedUserToken || "").length,
      hasState: Boolean(state && state.trim()),
    };
  }, [resolvedUserToken, state]);

  async function connectPage(pageId: string, pageNameHint?: string) {
    setBusy(true);
    setErr(null);
    setOkMsg(null);

    try {
      if (!resolvedUserToken) {
        setErr("Missing token. Please go back and click Connect again.");
        return;
      }

      // 1) Ask server to fetch Page access token (never do this directly from client)
      const tokenRes = await fetch("/api/oauth/facebook/page-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userToken: resolvedUserToken,
          pageId,
        }),
      });

      const tokenJson: any = await tokenRes.json().catch(() => null);

      if (!tokenRes.ok) {
        setErr(tokenJson?.error || "Failed to fetch Facebook Page token.");
        return;
      }

      const pageAccessToken = String(tokenJson?.pageAccessToken || "").trim();
      const pageName =
        String(tokenJson?.page?.name || "").trim() ||
        String(pageNameHint || "").trim() ||
        "Facebook Page";

      if (!pageAccessToken) {
        setErr("No Page access token returned.");
        return;
      }

      // 2) Save into DB (social_accounts)
      // Store tokens in meta so we can post later without Make/Ayrshare
      const saveRes = await fetch("/api/social-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform: "facebook",
          pageId,
          pageName,
          connectionType: "oauth",
          makeWebhookUrl: null,
          isActive: true,
          meta: {
            fb_user_token_present: true, // we do NOT store user token
            fb_page_access_token: pageAccessToken, // ✅ store page token
          },
        }),
      });

      const saveJson: any = await saveRes.json().catch(() => null);

      if (!saveRes.ok) {
        setErr(saveJson?.error || "Failed to save social account.");
        return;
      }

      setOkMsg(`Connected: ${pageName}`);

      // 3) Back to Connect page
      window.location.href = "/dashboard/connect?provider=facebook&success=1";
    } catch (e: any) {
      setErr(e?.message || "Connect failed.");
    } finally {
      setBusy(false);
    }
  }

  function onQuickConnect() {
    void connectPage(KNOWN_FUEL_GEIST_PAGE.id, KNOWN_FUEL_GEIST_PAGE.name);
  }

  function onManualConnect() {
    const id = manualPageId.trim();
    if (!id) return;
    void connectPage(id, "Facebook Page");
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-2xl rounded-3xl border border-slate-700 bg-slate-900/70 p-6 md:p-10 shadow-xl backdrop-blur">
        <h1 className="text-2xl font-semibold">Pick your Facebook Page</h1>
        <p className="mt-2 text-sm text-slate-300">
          Select which Page Root Health Ops should connect to.
        </p>

        <div className="mt-6 space-y-4">
          {err && (
            <div className="rounded-xl border border-red-500/40 bg-red-950/30 px-4 py-3 text-sm text-red-100">
              {err}
            </div>
          )}

          {okMsg && (
            <div className="rounded-xl border border-emerald-500/40 bg-emerald-950/20 px-4 py-3 text-sm text-emerald-100">
              {okMsg}
            </div>
          )}

          <div className="rounded-2xl border border-slate-700 bg-slate-950/60 p-4">
            <div className="text-sm font-semibold">Quick connect</div>
            <div className="mt-1 text-xs text-slate-400">
              This connects your known Page directly (no page list required).
            </div>

            <button
              type="button"
              onClick={onQuickConnect}
              disabled={busy}
              className="mt-3 w-full rounded-xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-60"
            >
              {busy ? "Connecting…" : `Connect ${KNOWN_FUEL_GEIST_PAGE.name}`}
            </button>

            <div className="mt-2 text-[11px] text-slate-400">
              Page ID: {KNOWN_FUEL_GEIST_PAGE.id}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-700 bg-slate-950/60 p-4">
            <div className="text-sm font-semibold">Manual Page ID</div>
            <div className="mt-1 text-xs text-slate-400">
              Use this when connecting other customers later.
            </div>

            <div className="mt-3 flex gap-2">
              <input
                value={manualPageId}
                onChange={(e) => setManualPageId(e.target.value)}
                placeholder="Enter Page ID…"
                className="flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                disabled={busy}
              />
              <button
                type="button"
                onClick={onManualConnect}
                disabled={busy || !manualPageId.trim()}
                className="rounded-xl border border-slate-600 bg-slate-900/80 px-4 py-2 text-sm text-slate-100 hover:border-slate-500 disabled:opacity-60"
              >
                Connect
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
            <pre className="max-h-64 overflow-auto rounded-xl border border-slate-700 bg-slate-950 p-3 text-[11px] text-slate-200">
              {JSON.stringify(debug, null, 2)}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}
