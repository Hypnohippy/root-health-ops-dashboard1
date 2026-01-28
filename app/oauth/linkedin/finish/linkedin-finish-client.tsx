// app/oauth/linkedin/finish/linkedin-finish-client.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";

type LinkedInUserInfo = {
  sub?: string;
  name?: string;
  given_name?: string;
  family_name?: string;
  email?: string;
};

function pickToken(tokenProp?: string) {
  try {
    if (tokenProp && tokenProp.trim()) return tokenProp.trim();
    const url = new URL(window.location.href);

    const q = url.searchParams.get("token");
    if (q && q.trim()) return q.trim();

    const hash = (url.hash || "").replace(/^#/, "");
    if (hash) {
      const hp = new URLSearchParams(hash);
      const h = hp.get("token");
      if (h && h.trim()) return h.trim();
    }
  } catch {}
  return "";
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

export default function LinkedInFinishClient({
  token: tokenProp,
  state,
}: {
  token: string;
  state?: string;
}) {
  const [busy, setBusy] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [tokenLen, setTokenLen] = useState(0);
  const [userInfo, setUserInfo] = useState<LinkedInUserInfo | null>(null);

  const canRetry = useMemo(() => tokenLen > 20 && !busy && !saving, [tokenLen, busy, saving]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setBusy(true);
        setSaving(false);
        setSaved(false);
        setError(null);

        const token = pickToken(tokenProp);
        setTokenLen((token || "").length);

        if (!token) {
          throw new Error("Missing LinkedIn token. Please go back to Dashboard → Connect and try again.");
        }

        // Optional: fetch LinkedIn OpenID userinfo (helps us store a friendly name/id)
        const ui = await fetchJson("https://api.linkedin.com/v2/userinfo", token);
        const info: LinkedInUserInfo | null = ui.ok ? (ui.json as any) : null;
        if (!cancelled) setUserInfo(info);

        const pageId =
          (info?.sub && String(info.sub)) || null;

        const pageName =
          (info?.name && String(info.name)) ||
          [info?.given_name, info?.family_name].filter(Boolean).join(" ").trim() ||
          "LinkedIn";

        // Save token into Supabase using your existing endpoint
        setSaving(true);
        const saveRes = await fetch("/api/social-accounts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            platform: "linkedin",
            page_id: pageId,
            page_name: pageName,
            page_access_token: token,
            is_active: true,
            connection_type: "linkedin_openid",
            meta: {
              state: state || null,
              userinfo_ok: Boolean(ui.ok),
            },
          }),
        });

        const saveJson: any = await saveRes.json().catch(() => null);

        if (!saveRes.ok || saveJson?.success === false) {
          throw new Error(saveJson?.error || `Failed to save LinkedIn connection (HTTP ${saveRes.status}).`);
        }

        if (cancelled) return;

        setSaved(true);

        // Back to Connect, now it should show "Connected"
        window.location.href = "/dashboard/connect?connected=linkedin";
      } catch (e: any) {
        if (cancelled) return;
        setError(e?.message || "LinkedIn connect failed.");
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
  }, [tokenProp, state]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 px-4 py-10">
      <div className="mx-auto w-full max-w-3xl rounded-3xl border border-slate-700 bg-slate-900/70 p-6 md:p-10 shadow-xl backdrop-blur space-y-4">
        <h1 className="text-2xl md:text-3xl font-semibold">Connecting LinkedIn…</h1>

        <p className="text-sm text-slate-300">
          Finishing your LinkedIn connection, then saving it to your workspace.
        </p>

        <div className="rounded-2xl border border-slate-700 bg-slate-950/60 p-4 text-xs text-slate-300 space-y-2">
          <div>Token resolved: {tokenLen > 0 ? `${tokenLen} chars` : "no"}</div>
          <div>User detected: {userInfo?.name || userInfo?.sub || (busy ? "…" : "unknown")}</div>
          <div>Saving: {saving ? "yes" : saved ? "done" : "no"}</div>
        </div>

        {error && (
          <div className="rounded-2xl border border-red-500/40 bg-red-950/30 p-4 text-sm text-red-100 whitespace-pre-wrap">
            {error}
            <div className="mt-3 text-xs text-slate-300">
              Fix checklist:
              <ul className="list-disc pl-5 mt-1 space-y-1">
                <li>Reconnect LinkedIn from Dashboard → Connect.</li>
                <li>Make sure you are signed into the dashboard in the same browser tab.</li>
                <li>If it still loops, your callback may not be passing the token into this page.</li>
              </ul>
            </div>
          </div>
        )}

        {!busy && !saved && canRetry && (
          <button
            type="button"
            className="rounded-2xl bg-emerald-500 px-5 py-3 text-sm font-semibold text-slate-950 hover:bg-emerald-400"
            onClick={() => window.location.reload()}
          >
            Retry
          </button>
        )}
      </div>
    </div>
  );
}
