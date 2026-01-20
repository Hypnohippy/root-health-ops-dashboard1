// app/oauth/threads/finish/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";

export default function ThreadsFinishPage({
  searchParams,
}: {
  searchParams: { token?: string; state?: string };
}) {
  const token = typeof searchParams.token === "string" ? searchParams.token : "";
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(true);

  const debug = useMemo(() => {
    let href = "";
    try {
      href = window.location.href;
    } catch {}
    return {
      href,
      tokenLength: token.length,
      hasState: typeof searchParams.state === "string" && !!searchParams.state,
    };
  }, [token, searchParams.state]);

  useEffect(() => {
    async function run() {
      try {
        if (!token) {
          setErr("Missing token — please go back and click Connect Threads again.");
          setSaving(false);
          return;
        }

        // Save into your DB
        const res = await fetch("/api/social-accounts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            platform: "threads",
            pageId: "threads_user",
            pageName: "Threads",
            connectionType: "threads_oauth",
            makeWebhookUrl: null,
            isActive: true,
            pageAccessToken: token,
            tokenExpiresAt: null,
          }),
        });

        const data: any = await res.json().catch(() => null);

        if (!res.ok) {
          setErr(data?.error || "Failed to save Threads connection.");
          setSaving(false);
          return;
        }

        // Done
        window.location.href = "/dashboard/connect?provider=threads&success=1";
      } catch (e: any) {
        setErr(e?.message || "Threads finish failed.");
        setSaving(false);
      }
    }

    void run();
  }, [token]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-xl rounded-3xl border border-slate-700 bg-slate-900/70 p-6 md:p-10 shadow-xl backdrop-blur">
        <h1 className="text-2xl font-semibold">Connecting Threads…</h1>
        <p className="mt-2 text-sm text-slate-300">
          Saving your connection securely. You’ll be sent back automatically.
        </p>

        <div className="mt-6">
          {err ? (
            <div className="rounded-xl border border-red-500/40 bg-red-950/30 px-4 py-3 text-sm text-red-100">
              {err}
            </div>
          ) : (
            <div className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-200">
              {saving ? "Working…" : "Done."}
            </div>
          )}
        </div>

        <details className="mt-6">
          <summary className="cursor-pointer text-xs text-slate-400 hover:text-slate-300">
            Debug (click to expand)
          </summary>
          <pre className="mt-2 max-h-64 overflow-auto rounded-xl border border-slate-700 bg-slate-950 p-3 text-[11px] text-slate-200">
{JSON.stringify(debug, null, 2)}
          </pre>
        </details>

        <div className="mt-6">
          <button
            type="button"
            onClick={() => (window.location.href = "/dashboard/connect")}
            className="rounded-xl border border-slate-600 bg-slate-900/80 px-4 py-2 text-sm text-slate-100 hover:border-slate-500"
          >
            Back to Connect
          </button>
        </div>
      </div>
    </div>
  );
}
