"use client";

import React, { useEffect, useMemo, useState } from "react";

type ProviderId =
  | "facebook"
  | "instagram"
  | "tiktok"
  | "linkedin"
  | "google"
  | "email"
  | "whatsapp"
  | "threads";

type SocialAccountRow = {
  platform: ProviderId;
  page_id: string | null;
  page_name: string | null;
  is_active?: boolean | null;
};

const LABELS: Record<ProviderId, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  linkedin: "LinkedIn",
  threads: "Threads",
  tiktok: "TikTok",
  google: "Google",
  email: "Email",
  whatsapp: "WhatsApp",
};

const ORDER: ProviderId[] = [
  "facebook",
  "instagram",
  "linkedin",
  "threads",
  "tiktok",
  "google",
  "email",
  "whatsapp",
];

export default function ConnectedChannelsBar(props: {
  title?: string;
  showConnectLink?: boolean;
}) {
  const { title = "Connections", showConnectLink = true } = props;

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<SocialAccountRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const connected = useMemo(() => {
    const active = (rows || []).filter((r) => r.is_active !== false);
    return new Set(active.map((r) => r.platform));
  }, [rows]);

  const connectedCount = connected.size;

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/social-accounts", { cache: "no-store" });
      const data = await res.json().catch(() => null);
      const list: SocialAccountRow[] = data?.socialAccounts ?? [];
      setRows(Array.isArray(list) ? list : []);
    } catch (e: any) {
      setError(e?.message || "Failed to load connections");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  return (
    <div className="rounded-3xl border border-slate-700 bg-slate-900/70 p-4 md:p-5 shadow-xl backdrop-blur">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <div className="text-xs text-slate-400">{title}</div>
          <div className="mt-1 flex items-center gap-3">
            <div className="text-sm text-slate-200">
              {loading ? "Loading…" : `${connectedCount} connected`}
            </div>
            {error ? (
              <div className="text-xs text-red-300">{error}</div>
            ) : null}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={refresh}
            className="rounded-xl border border-slate-600 bg-slate-950 px-3 py-2 text-xs text-slate-200 hover:border-slate-500"
          >
            Refresh
          </button>

          {showConnectLink ? (
            <a
              href="/dashboard/connect"
              className="rounded-xl bg-emerald-500 px-3 py-2 text-xs font-semibold text-slate-950 hover:bg-emerald-400"
            >
              Manage connections
            </a>
          ) : null}
        </div>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {ORDER.map((p) => {
          const isConnected = connected.has(p);
          return (
            <div
              key={p}
              className={`rounded-2xl border px-3 py-3 ${
                isConnected
                  ? "border-emerald-500/50 bg-emerald-500/10"
                  : "border-slate-700 bg-slate-950/40"
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium text-slate-100">
                  {LABELS[p]}
                </div>
                <div
                  className={`text-[11px] px-2 py-1 rounded-full border ${
                    isConnected
                      ? "border-emerald-500/60 text-emerald-200"
                      : "border-slate-700 text-slate-400"
                  }`}
                >
                  {isConnected ? "Connected" : "Not connected"}
                </div>
              </div>

              <div className="mt-1 text-[11px] text-slate-400">
                {isConnected
                  ? rows.find((r) => r.platform === p)?.page_name ||
                    rows.find((r) => r.platform === p)?.page_id ||
                    "OK"
                  : "—"}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-3 text-[11px] text-slate-500">
        This bar reads the same connection state your Quick Blast uses (via{" "}
        <span className="text-slate-300">/api/social-accounts</span>).
      </div>
    </div>
  );
}
