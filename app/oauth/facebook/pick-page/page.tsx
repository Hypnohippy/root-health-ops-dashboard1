"use client";

import React, { useMemo, useState } from "react";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function safeDecodeState(state?: string) {
  if (!state) return null;
  try {
    // try base64 JSON
    const decoded = atob(state);
    return JSON.parse(decoded);
  } catch {
    try {
      // try raw JSON
      return JSON.parse(state);
    } catch {
      return null;
    }
  }
}

export default function PickFacebookPagePage() {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [manualPageId, setManualPageId] = useState("");

  const href = typeof window !== "undefined" ? window.location.href : "";
  const url = useMemo(() => {
    if (typeof window === "undefined") return null;
    try {
      return new URL(window.location.href);
    } catch {
      return null;
    }
  }, [href]);

  const tokenResolved = (url?.searchParams.get("token") || "").trim();
  const state = (url?.searchParams.get("state") || "").trim();
  const decodedState = useMemo(() => safeDecodeState(state), [state]);
  const organisationId =
    (decodedState && (decodedState.organisationId || decodedState.organisation_id)) || null;

  // ✅ Your known FB Page
  const FUELGEIST_PAGE_ID = "101868201852363";

  const connectPage = async (pageId: string) => {
    setErr(null);
    setOkMsg(null);

    const pid = (pageId || "").trim();
    if (!pid) {
      setErr("Missing Page ID.");
      return;
    }
    if (!tokenResolved) {
      setErr("Missing token. Please go back and click Connect again.");
      return;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/oauth/facebook/connect-page", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: tokenResolved,
          pageId: pid,
          organisationId,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.success === false) {
        throw new Error(data?.error || "Failed to connect page");
      }

      setOkMsg(`Connected: ${data?.pageName || "Facebook Page"} ✅`);

      setTimeout(() => {
        window.location.href = "/dashboard/connect?provider=facebook&success=1";
      }, 700);
    } catch (e: any) {
      setErr(e?.message || "Failed to connect page");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-2xl rounded-3xl border border-white/10 bg-black/30 backdrop-blur-xl p-6 shadow-xl">
        <h1 className="text-2xl font-semibold">Pick your Facebook Page</h1>
        <p className="mt-2 text-sm text-slate-300">
          Select which Page Root Health Ops should connect to.
        </p>

        <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4">
          <div className="text-sm font-medium">Quick connect</div>
          <p className="mt-1 text-xs text-slate-400">
            This connects your known Page directly (no page list required).
          </p>

          <button
            type="button"
            disabled={busy}
            onClick={() => connectPage(FUELGEIST_PAGE_ID)}
            className="mt-3 inline-flex items-center rounded-xl bg-emerald-400 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-300 disabled:opacity-60"
          >
            {busy ? "Connecting…" : "Connect Fuel Geist Ltd"}
          </button>

          <div className="mt-2 text-[11px] text-slate-500">
            Page ID: <span className="font-mono">{FUELGEIST_PAGE_ID}</span>
          </div>
        </div>

        <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4">
          <div className="text-sm font-medium">Manual Page ID</div>
          <p className="mt-1 text-xs text-slate-400">
            Use this when connecting other customers later.
          </p>

          <div className="mt-3 flex gap-2">
            <input
              value={manualPageId}
              onChange={(e) => setManualPageId(e.target.value)}
              placeholder="Enter Page ID…"
              className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none focus:border-emerald-400"
            />
            <button
              type="button"
              disabled={busy || !manualPageId.trim()}
              onClick={() => connectPage(manualPageId)}
              className="rounded-xl border border-emerald-400/40 bg-emerald-400/10 px-4 py-2 text-sm font-semibold text-emerald-100 hover:bg-emerald-400/20 disabled:opacity-60"
            >
              Connect
            </button>
          </div>
        </div>

        {okMsg && (
          <div className="mt-4 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-200">
            {okMsg}
          </div>
        )}

        {err && (
          <div className="mt-4 rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">
            {err}
          </div>
        )}

        <details className="mt-6 rounded-2xl border border-white/10 bg-black/10 p-4">
          <summary className="cursor-pointer text-sm text-slate-300">
            Debug (click to expand)
          </summary>
          <pre className="mt-3 text-[11px] text-slate-400 whitespace-pre-wrap">
{JSON.stringify(
  {
    href,
    tokenResolvedLength: tokenResolved.length,
    hasOrganisationId: !!organisationId,
  },
  null,
  2
)}
          </pre>
        </details>
      </div>
    </div>
  );
}
