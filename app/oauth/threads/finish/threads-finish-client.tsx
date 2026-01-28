// app/oauth/threads/finish/threads-finish-client.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";

type ThreadsMe = {
  id?: string;
  username?: string;
  name?: string;
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

async function fetchJson(url: string) {
  const res = await fetch(url, { method: "GET", cache: "no-store" });
  const json: any = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, json };
}

export default function ThreadsFinishClient({
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
  const [me, setMe] = useState<ThreadsMe | null>(null);

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
          throw new Error("Missing Threads token. Please go back to Dashboard → Connect and try again.");
        }

        // Best-effort “who am I?” (if this endpoint is unavailable, we still save the token)
        // Many Meta APIs accept access_token as a query param.
        const meRes = await fetchJson(
          `https://graph.threads.net/me?fields=id,username,name&access_token=${encodeURIComponent(token)}`
        );

        if (!cancelled && meRes.ok) {
          setMe(meRes.json as any);
        }

        const pageId = meRes.ok && meRes.json?.id ? String(meRes.json.id) : null;
        const pageName =
          (meRes.ok && (meRes.json?.username || meRes.json?.name))
            ? String(meRes.json.username || meRes.json.name)
            : "Threads";

        setSaving(true);
        const saveRes = await fetch("/api/social-accounts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            platform: "threads",
            page_id: pageId,
            page_name: pageName,
            page_access_token: token,
            is_active: true,
            connection_type: "threads_oauth",
            meta: {
              state: state || null,
              me_lookup_ok: Boolean(meRes.ok),
            },
          }),
        });

        const saveJson: any = await saveRes.json().catch(() => null);

        if (!saveRes.ok || saveJson?.success === false) {
          throw new Error(saveJson?.error || `Failed to save Threads connection (HTTP ${saveRes.status}).`);
        }

        if (cancelled) return;

        setSaved(true);
        window.location.href = "/dashboard/connect?connected=threads";
      } catch (e: any) {
        if (cancelled) return;
        setError(e?.message || "Threads connect failed.");
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
        <h1 className="text-2xl md:text-3xl font-semibold">Connecting Threads…</h1>

        <p className="text-sm text-slate-300">
          Finishing your Threads connection, then saving it to your workspace.
        </p>

        <div className="rounded-2xl border border-slate-700 bg-slate-950/60 p-4 text-xs text-slate-300 space-y-2">
          <div>Token resolved: {tokenLen > 0 ? `${tokenLen} chars` : "no"}</div>
          <div>User detected: {me?.username || me?.name || me?.id || (busy ? "…" : "unknown")}</div>
          <div>Saving: {saving ? "yes" : saved ? "done" : "no"}</div>
        </div>

        {error && (
          <div className="rounded-2xl border border-red-500/40 bg-red-950/30 p-4 text-sm text-red-100 whitespace-pre-wrap">
            {error}
            <div className="mt-3 text-xs text-slate-300">
              Fix checklist:
              <ul className="list-disc pl-5 mt-1 space-y-1">
                <li>Reconnect Threads from Dashboard → Connect.</li>
                <li>Make sure NEXT_PUBLIC_APP_URL matches your deployed domain.</li>
                <li>If it returns but still shows “Connect”, the token isn’t being saved — this page fixes that.</li>
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
