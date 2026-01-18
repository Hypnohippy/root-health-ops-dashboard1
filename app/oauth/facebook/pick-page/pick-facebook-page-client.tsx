// app/oauth/facebook/pick-page/pick-facebook-page-client.tsx
"use client";

import React, { useMemo, useState } from "react";

type FbPage = {
  id: string;
  name: string;
  access_token?: string; // page token (returned by /me/accounts)
};

const QUICK_PAGE_ID = "101868201852363";
const QUICK_PAGE_NAME = "Fuel Geist Ltd";

function getQueryToken() {
  try {
    const u = new URL(window.location.href);
    return (u.searchParams.get("token") || "").trim();
  } catch {
    return "";
  }
}

function getQueryState() {
  try {
    const u = new URL(window.location.href);
    return (u.searchParams.get("state") || "").trim();
  } catch {
    return "";
  }
}

export default function PickFacebookPageClient({
  token,
  state,
}: {
  token?: string;
  state?: string;
}) {
  const resolvedToken = useMemo(() => {
    const t = (token || "").trim();
    return t || getQueryToken();
  }, [token]);

  const resolvedState = useMemo(() => {
    const s = (state || "").trim();
    return s || getQueryState();
  }, [state]);

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const [manualPageId, setManualPageId] = useState("");
  const [debugOpen, setDebugOpen] = useState(false);

  const debug = useMemo(() => {
    let href = "";
    try {
      href = window.location.href;
    } catch {}
    return {
      href,
      tokenResolvedLength: (resolvedToken || "").length,
      hasState: !!resolvedState,
    };
  }, [resolvedToken, resolvedState]);

  async function saveToDb(args: {
    pageId: string;
    pageName: string;
    pageAccessToken: string | null;
  }) {
    const res = await fetch("/api/social-accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        platform: "facebook",
        pageId: args.pageId,
        pageName: args.pageName,
        connectionType: "facebook_oauth",
        makeWebhookUrl: null,
        isActive: true,

        // ✅ NEW
        pageAccessToken: args.pageAccessToken,
        tokenExpiresAt: null, // we can add expiry later if we want
      }),
    });

    const data: any = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.error || "Failed to save Facebook connection");
  }

  async function fetchPageAccessTokenForPage(pageId: string) {
    // We prefer to store a PAGE access token, not just the user token.
    // /me/accounts returns access_token per page if permissions are correct.
    if (!resolvedToken) return null;

    const url =
      "https://graph.facebook.com/v24.0/me/accounts?" +
      new URLSearchParams({
        fields: "id,name,access_token",
        limit: "100",
        access_token: resolvedToken,
      }).toString();

    const res = await fetch(url, { cache: "no-store" });
    const json: any = await res.json().catch(() => null);

    if (!res.ok) return null;

    const list: FbPage[] = Array.isArray(json?.data) ? json.data : [];
    const match = list.find((p) => String(p.id) === String(pageId));
    return match?.access_token ? String(match.access_token) : null;
  }

  async function quickConnect() {
    setBusy(true);
    setErr(null);
    setOkMsg(null);

    try {
      if (!resolvedToken) {
        throw new Error("Missing token. Please go back and click Connect again.");
      }

      // try to grab page access token for Fuel Geist Ltd (best case)
      const pageTok = await fetchPageAccessTokenForPage(QUICK_PAGE_ID);

      await saveToDb({
        pageId: QUICK_PAGE_ID,
        pageName: QUICK_PAGE_NAME,
        pageAccessToken: pageTok,
      });

      setOkMsg("Saved. Returning to Connect…");
      window.location.href = "/dashboard/connect?provider=facebook&success=1";
    } catch (e: any) {
      setErr(e?.message || "Quick connect failed.");
    } finally {
      setBusy(false);
    }
  }

  async function connectManual() {
    setBusy(true);
    setErr(null);
    setOkMsg(null);

    try {
      if (!resolvedToken) {
        throw new Error("Missing token. Please go back and click Connect again.");
      }

      const id = manualPageId.trim();
      if (!id) throw new Error("Enter a Page ID first.");

      const pageTok = await fetchPageAccessTokenForPage(id);

      await saveToDb({
        pageId: id,
        pageName: `Facebook Page (${id})`,
        pageAccessToken: pageTok,
      });

      setOkMsg("Saved. Returning to Connect…");
      window.location.href = "/dashboard/connect?provider=facebook&success=1";
    } catch (e: any) {
      setErr(e?.message || "Manual connect failed.");
    } finally {
      setBusy(false);
    }
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

          <div className="rounded-2xl border border-slate-700 bg-slate-950/40 p-4">
            <div className="text-sm font-semibold">Quick connect</div>
            <div className="mt-1 text-xs text-slate-400">
              This connects your known Page directly (no page list required).
            </div>

            <button
              type="button"
              onClick={quickConnect}
              disabled={busy}
              className="mt-3 w-full rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-60"
            >
              {busy ? "Connecting…" : `Connect ${QUICK_PAGE_NAME}`}
            </button>
            <div className="mt-2 text-[11px] text-slate-400">
              Page ID: {QUICK_PAGE_ID}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-700 bg-slate-950/40 p-4">
            <div className="text-sm font-semibold">Manual Page ID</div>
            <div className="mt-1 text-xs text-slate-400">
              Use this when connecting other customers later.
            </div>

            <input
              value={manualPageId}
              onChange={(e) => setManualPageId(e.target.value)}
              placeholder="Enter Page ID…"
              className="mt-3 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
            />

            <button
              type="button"
              onClick={connectManual}
              disabled={busy || !manualPageId.trim()}
              className="mt-3 w-full rounded-xl border border-slate-600 bg-slate-900/80 px-4 py-2 text-sm text-slate-100 hover:border-slate-500 disabled:opacity-60"
            >
              {busy ? "Connecting…" : "Connect"}
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
            <pre className="max-h-64 overflow-auto rounded-xl border border-slate-700 bg-slate-950 p-3 text-[11px] text-slate-200">
{JSON.stringify(debug, null, 2)}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}
