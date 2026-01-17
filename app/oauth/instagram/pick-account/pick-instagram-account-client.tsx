// app/oauth/instagram/pick-account/pick-instagram-account-client.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";

type IgAccount = {
  id: string;
  username?: string;
  name?: string;
};

const KNOWN_FB_PAGE_ID = "101868201852363";
const KNOWN_FB_PAGE_NAME = "Fuel Geist Ltd";

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
  const [detecting, setDetecting] = useState(false);
  const [saving, setSaving] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [ig, setIg] = useState<IgAccount | null>(null);

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

  async function detectInstagramFromKnownPage() {
    setDetecting(true);
    setError(null);
    setIg(null);

    try {
      if (!resolvedToken) {
        setError("Missing token. Please go back and click Connect again.");
        return;
      }

      // Ask Facebook Page for linked Instagram Business account.
      // Requires: pages_read_engagement + instagram_basic (you already granted)
      const url =
        `https://graph.facebook.com/v24.0/${KNOWN_FB_PAGE_ID}?` +
        new URLSearchParams({
          fields: "instagram_business_account{id,username,name}",
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

      const acct: IgAccount | null = json?.instagram_business_account || null;

      if (!acct?.id) {
        setError(
          "No Instagram Business account detected for this Page.\n\n" +
            "Fix: Ensure your Instagram is a Professional (Business/Creator) account and is linked to this Facebook Page in Meta Business Suite."
        );
        return;
      }

      setIg(acct);
    } catch (e: any) {
      setError(e?.message || "Failed to detect Instagram account.");
    } finally {
      setDetecting(false);
    }
  }

  async function saveInstagram() {
    setSaving(true);
    setError(null);

    try {
      if (!ig?.id) {
        setError("No Instagram account detected yet.");
        return;
      }

      const res = await fetch("/api/social-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform: "instagram",
          // pageId must be NOT NULL in your table, so store the IG account id here:
          pageId: ig.id,
          pageName: ig.username || ig.name || "Instagram Account",
          connectionType: "oauth",
          makeWebhookUrl: null,
          isActive: true,
        }),
      });

      const data: any = await res.json().catch(() => null);

      if (!res.ok) {
        setError(data?.error || "Failed to save Instagram account.");
        return;
      }

      // Done
      window.location.href = "/dashboard/connect?provider=instagram&success=1";
    } catch (e: any) {
      setError(e?.message || "Failed to save Instagram account.");
    } finally {
      setSaving(false);
    }
  }

  // Auto-run detect on first load (so it feels “one click”)
  useEffect(() => {
    void detectInstagramFromKnownPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-2xl rounded-3xl border border-slate-700 bg-slate-900/70 p-6 md:p-10 shadow-xl backdrop-blur">
        <h1 className="text-2xl font-semibold">Pick your Instagram account</h1>
        <p className="mt-2 text-sm text-slate-300">
          Instagram Business accounts are linked to a Facebook Page. We’ll detect the linked Instagram
          account from your Page.
        </p>

        <div className="mt-6 space-y-3">
          {error && (
            <div className="whitespace-pre-wrap rounded-xl border border-red-500/40 bg-red-950/30 px-4 py-3 text-sm text-red-100">
              {error}
            </div>
          )}

          <div className="rounded-2xl border border-slate-700 bg-slate-900/60 p-4">
            <div className="text-sm font-semibold">Quick connect</div>
            <div className="mt-1 text-xs text-slate-300">
              Detect Instagram from your known Facebook Page (no page list required).
            </div>

            <div className="mt-3 flex flex-col gap-2">
              <button
                type="button"
                onClick={detectInstagramFromKnownPage}
                disabled={detecting || loading}
                className="rounded-xl bg-blue-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-blue-400 disabled:opacity-60"
              >
                {detecting ? "Detecting…" : `Detect from ${KNOWN_FB_PAGE_NAME}`}
              </button>

              <div className="text-[11px] text-slate-400">
                Page ID: {KNOWN_FB_PAGE_ID}
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-700 bg-slate-900/60 p-4">
            <div className="text-sm font-semibold">Detected Instagram account</div>
            <div className="mt-2 text-sm text-slate-200">
              {ig?.id ? (
                <>
                  <div>
                    <span className="text-slate-400 text-xs">ID:</span>{" "}
                    <span className="font-mono text-xs">{ig.id}</span>
                  </div>
                  <div className="mt-1">
                    <span className="text-slate-400 text-xs">Username:</span>{" "}
                    {ig.username || "(none returned)"}
                  </div>
                  {ig.name && (
                    <div className="mt-1">
                      <span className="text-slate-400 text-xs">Name:</span> {ig.name}
                    </div>
                  )}
                </>
              ) : (
                <div className="text-slate-400 text-sm">None found yet.</div>
              )}
            </div>

            <div className="mt-4 flex gap-3 flex-wrap">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="rounded-xl border border-slate-600 bg-slate-900/80 px-4 py-2 text-sm text-slate-100 hover:border-slate-500"
              >
                Refresh page
              </button>

              <button
                type="button"
                onClick={saveInstagram}
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
