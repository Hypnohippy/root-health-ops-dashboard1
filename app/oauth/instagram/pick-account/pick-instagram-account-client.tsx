"use client";

import React, { useEffect, useMemo, useState } from "react";

type FbPage = {
  id: string;
  name?: string;
  access_token?: string;
};

type DetectedIg = {
  id: string;
  username?: string;
  name?: string;
};

function pickTokenFromUrl(): string {
  try {
    const url = new URL(window.location.href);

    // token can be passed as query param
    const tokenQ = url.searchParams.get("token");
    if (tokenQ && tokenQ.trim()) return tokenQ.trim();

    // sometimes providers stick it in the hash
    const hash = (url.hash || "").replace(/^#/, "");
    if (hash) {
      const hashParams = new URLSearchParams(hash);
      const tokenH = hashParams.get("token");
      if (tokenH && tokenH.trim()) return tokenH.trim();
    }

    return "";
  } catch {
    return "";
  }
}

async function fetchJson(url: string, token?: string) {
  const res = await fetch(url, {
    method: "GET",
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    cache: "no-store",
  });
  const json: any = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, json };
}

export default function PickInstagramAccountClient() {
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [href, setHref] = useState<string>("");
  const [tokenResolvedLength, setTokenResolvedLength] = useState<number>(0);

  const [pagesCount, setPagesCount] = useState<number>(0);
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);

  const [detectedIg, setDetectedIg] = useState<DetectedIg | null>(null);

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const canSave = useMemo(() => {
    return Boolean(detectedIg?.id) && Boolean(selectedPageId) && tokenResolvedLength > 20 && !saving;
  }, [detectedIg?.id, selectedPageId, tokenResolvedLength, saving]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setBusy(true);
        setError(null);
        setHref(window.location.href);

        const resolvedToken = pickTokenFromUrl();
        setTokenResolvedLength((resolvedToken || "").length);

        if (!resolvedToken) {
          throw new Error("Missing token. Please go back to Dashboard → Connect and try again.");
        }

        // 1) Get managed pages (and their page access tokens)
        const pagesRes = await fetchJson(
          "https://graph.facebook.com/v24.0/me/accounts?fields=id,name,access_token&limit=50",
          resolvedToken
        );

        const pages: FbPage[] = Array.isArray(pagesRes.json?.data) ? pagesRes.json.data : [];
        if (!pagesRes.ok || pages.length === 0) {
          throw new Error(
            pagesRes.json?.error?.message ||
              "Could not load your Facebook Pages. Make sure you granted Pages permissions."
          );
        }

        if (cancelled) return;

        setPagesCount(pages.length);

        // Root Health Ops: simplest path = pick first page (you usually have 1 anyway)
        const page = pages[0];
        const pageId = String(page?.id || "").trim();
        const pageToken = String(page?.access_token || "").trim();

        if (!pageId || !pageToken) {
          throw new Error("Could not resolve Page ID/token. Please reconnect Instagram in Dashboard → Connect.");
        }

        setSelectedPageId(pageId);

        // 2) Detect Instagram Business account attached to the Page
        const igRes = await fetchJson(
          `https://graph.facebook.com/v24.0/${encodeURIComponent(pageId)}?fields=instagram_business_account{id,username,name}`,
          pageToken
        );

        const ig = igRes.json?.instagram_business_account;
        const igId = String(ig?.id || "").trim();

        if (!igRes.ok || !igId) {
          throw new Error(
            igRes.json?.error?.message ||
              "No Instagram Business account detected on this Page. Ensure IG is a Business/Creator account linked to the Page."
          );
        }

        const igObj: DetectedIg = {
          id: igId,
          username: typeof ig?.username === "string" ? ig.username : undefined,
          name: typeof ig?.name === "string" ? ig.name : undefined,
        };

        setDetectedIg(igObj);

        // 3) SAVE using the correct API route:
        //    ✅ /api/oauth/facebook/save-page
        //    This avoids the /api/social-accounts POST 405 problem.
        setSaving(true);

        const saveRes = await fetch("/api/oauth/facebook/save-page", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            platform: "instagram",
            pageId: igObj.id, // store IG user id here (used for posting)
            pageName: igObj.username || igObj.name || "Instagram",
            token: pageToken, // IMPORTANT: page token is what IG publishing uses
            // organisationId intentionally omitted (single-tenant fallback handles it)
          }),
        });

        const saveJson: any = await saveRes.json().catch(() => null);

        if (!saveRes.ok || saveJson?.success === false) {
          throw new Error(saveJson?.error || `Failed to save Instagram connection (HTTP ${saveRes.status}).`);
        }

        if (cancelled) return;

        setSaved(true);

        // 4) Return to Connect page so UI can refresh and show Connected
        window.location.href = "/dashboard/connect?instagram=connected";
      } catch (e: any) {
        if (cancelled) return;
        setError(e?.message || "Instagram connect failed.");
      } finally {
        if (!cancelled) {
          setSaving(false);
          setBusy(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 px-4 py-10">
      <div className="mx-auto w-full max-w-3xl rounded-3xl border border-slate-700 bg-slate-900/70 p-6 md:p-10 shadow-xl backdrop-blur space-y-4">
        <h1 className="text-2xl md:text-3xl font-semibold">Connecting Instagram…</h1>

        <p className="text-sm text-slate-300">
          We’re verifying your Facebook Page + linked Instagram Business account, then saving the connection.
        </p>

        <div className="rounded-2xl border border-slate-700 bg-slate-950/60 p-4 text-xs text-slate-300 space-y-2">
          <div>Token resolved: {tokenResolvedLength > 0 ? `${tokenResolvedLength} chars` : "no"}</div>
          <div>Pages found: {pagesCount || (busy ? "…" : 0)}</div>
          <div>Selected Page ID: {selectedPageId || (busy ? "…" : "none")}</div>
          <div>
            Detected IG:{" "}
            {detectedIg ? (
              <span className="text-emerald-200">
                {detectedIg.username || detectedIg.name || detectedIg.id}
              </span>
            ) : busy ? (
              "…"
            ) : (
              "none"
            )}
          </div>
          <div>Saving: {saving ? "yes" : saved ? "done" : "no"}</div>
        </div>

        {error && (
          <div className="rounded-2xl border border-red-500/40 bg-red-950/30 p-4 text-sm text-red-100 whitespace-pre-wrap">
            {error}
            <div className="mt-3 text-xs text-slate-300">
              Fix checklist:
              <ul className="list-disc pl-5 mt-1 space-y-1">
                <li>IG must be Business/Creator and linked to a Facebook Page.</li>
                <li>Disconnect + reconnect Instagram from Dashboard → Connect (to refresh permissions).</li>
                <li>Start connect flow from inside the Dashboard (don’t bookmark OAuth URLs).</li>
              </ul>
            </div>
          </div>
        )}

        {!busy && !error && !saved && canSave && (
          <button
            type="button"
            className="rounded-2xl bg-emerald-500 px-5 py-3 text-sm font-semibold text-slate-950 hover:bg-emerald-400"
            onClick={() => window.location.reload()}
          >
            Retry save
          </button>
        )}

        <div className="text-[11px] text-slate-500 break-all">Debug: {href}</div>
      </div>
    </div>
  );
}
