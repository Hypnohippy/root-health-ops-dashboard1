// app/dashboard/connect/threads-manual/page.tsx
"use client";

import React, { useMemo, useState } from "react";

export default function ThreadsManualConnectPage() {
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const tokenLooksValid = useMemo(() => token.trim().length > 40, [token]);

  async function onSave() {
    try {
      setBusy(true);
      setMsg(null);

      const res = await fetch("/api/oauth/threads/manual-save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessToken: token.trim() }),
      });

      const data: any = await res.json().catch(() => null);

      if (!res.ok || !data?.ok) {
        throw new Error(
          data?.error || `Save failed (HTTP ${res.status})`
        );
      }

      setMsg(`Saved Threads as @${data?.username || data?.threadsUserId}. Redirecting…`);
      setTimeout(() => {
        window.location.href = "/dashboard/connect?connected=threads";
      }, 800);
    } catch (e: any) {
      setMsg(e?.message || "Could not save token.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 px-4 py-10">
      <div className="mx-auto w-full max-w-3xl rounded-3xl border border-white/10 bg-white/5 p-6 md:p-10 shadow-[0_20px_60px_rgba(0,0,0,0.35)] backdrop-blur space-y-4">
        <h1 className="text-2xl md:text-3xl font-semibold">Connect Threads (manual token)</h1>

        <p className="text-sm text-slate-300">
          Threads OAuth is currently looping on “Something went wrong”. This is a safe workaround:
          generate a long-lived tester token in your Threads app console, paste it here, and we’ll save it.
        </p>

        <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-slate-300 space-y-2">
          <div className="font-semibold text-slate-100">Where to get the token</div>
          <ol className="list-decimal pl-5 space-y-1">
            <li>Meta Developers → your Threads app</li>
            <li>Use cases → <b>Access the Threads API</b></li>
            <li><b>User Token Generator</b> → generate token for <b>fuelgeist1</b></li>
            <li>Copy the access token and paste below</li>
          </ol>
        </div>

        <textarea
          className="w-full min-h-[180px] rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:border-emerald-400/50 focus:ring-1 focus:ring-emerald-400/30"
          placeholder="Paste Threads access token here…"
          value={token}
          onChange={(e) => setToken(e.target.value)}
        />

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onSave}
            disabled={!tokenLooksValid || busy}
            className="rounded-2xl bg-emerald-500 px-5 py-3 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-60 disabled:cursor-not-allowed transition"
          >
            {busy ? "Saving…" : "Save Threads token"}
          </button>

          <button
            type="button"
            onClick={() => (window.location.href = "/dashboard/connect")}
            className="rounded-2xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-slate-100 hover:bg-white/10 transition"
          >
            Back
          </button>
        </div>

        {msg && (
          <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-slate-200 whitespace-pre-wrap">
            {msg}
          </div>
        )}
      </div>
    </div>
  );
}
