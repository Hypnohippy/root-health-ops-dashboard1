"use client";

import React, { useEffect, useMemo, useState } from "react";

function pickTokenFromUrl(): string {
  try {
    const url = new URL(window.location.href);

    const tokenQ = url.searchParams.get("token");
    if (tokenQ && tokenQ.trim()) return tokenQ.trim();

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

export default function LinkedInFinishPage() {
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [href, setHref] = useState("");
  const [tokenLen, setTokenLen] = useState(0);

  const canRetry = useMemo(() => !busy && !!error, [busy, error]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setBusy(true);
        setError(null);
        setHref(window.location.href);

        const token = pickTokenFromUrl();
        setTokenLen((token || "").length);

        if (!token) {
          throw new Error(
            "Missing token. If it still loops, your callback may not be passing the token into this page."
          );
        }

        // ✅ Call our own server route (no CORS)
        const res = await fetch("/api/oauth/linkedin/finish", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          body: JSON.stringify({ token }),
        });

        const json: any = await res.json().catch(() => null);

        if (!res.ok || json?.success === false) {
          throw new Error(json?.error || `Finish failed (HTTP ${res.status}).`);
        }

        if (cancelled) return;

        window.location.href = "/dashboard/connect?provider=linkedin&connected=1";
      } catch (e: any) {
        if (cancelled) return;
        setError(e?.message || "LinkedIn finish failed.");
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 px-4 py-10">
      <div className="mx-auto w-full max-w-3xl rounded-3xl border border-slate-700 bg-slate-900/70 p-6 md:p-10 shadow-xl backdrop-blur space-y-4">
        <h1 className="text-2xl md:text-3xl font-semibold">Connecting LinkedIn…</h1>

        <p className="text-sm text-slate-300">
          We’re finalising your LinkedIn connection and saving it to your workspace.
        </p>

        <div className="rounded-2xl border border-slate-700 bg-slate-950/60 p-4 text-xs text-slate-300 space-y-2">
          <div>Token resolved: {tokenLen > 0 ? `${tokenLen} chars` : "no"}</div>
          <div>Status: {busy ? "saving…" : error ? "error" : "done"}</div>
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

        {canRetry && (
          <button
            type="button"
            className="rounded-2xl bg-emerald-500 px-5 py-3 text-sm font-semibold text-slate-950 hover:bg-emerald-400"
            onClick={() => window.location.reload()}
          >
            Retry
          </button>
        )}

        <div className="text-[11px] text-slate-500 break-all">Debug: {href}</div>
      </div>
    </div>
  );
}
