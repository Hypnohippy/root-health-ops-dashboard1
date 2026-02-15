// app/dashboard/connect/page.tsx
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

type ConnectionStatus = "connected" | "disconnected" | "pending";

type Provider = {
  id: ProviderId;
  name: string;
  label: string;
  description: string;
  hint?: string;
  status: ConnectionStatus;
  accountName?: string;
  lastSync?: string;
};

const initialProviders: Provider[] = [
  {
    id: "facebook",
    name: "Facebook",
    label: "Facebook Page",
    description: "Post and reply via secure OAuth connection.",
    hint: "Requires a Facebook Page you manage (Full control/Admin).",
    status: "disconnected",
  },
  {
    id: "instagram",
    name: "Instagram",
    label: "Instagram",
    description: "Connect an Instagram Business account linked to a Facebook Page.",
    hint: "Instagram Business must be linked to a Facebook Page.",
    status: "disconnected",
  },
  {
    id: "linkedin",
    name: "LinkedIn",
    label: "LinkedIn",
    description: "Professional presence and referral partner content.",
    status: "disconnected",
  },
  {
    id: "threads",
    name: "Threads",
    label: "Threads",
    description: "Text-first posts (and images) via Threads OAuth.",
    hint: "Connect the Threads account you want to post as.",
    status: "disconnected",
  },
  {
    id: "tiktok",
    name: "TikTok",
    label: "TikTok",
    description: "Short-form video built from your campaigns.",
    hint: "Connect your TikTok account via Login Kit (sandbox for review).",
    status: "disconnected",
  },
  {
    id: "google",
    name: "Google Business Profile",
    label: "Google Business Profile",
    description: "Local SEO posts so clients find you when they’re searching.",
    status: "disconnected",
  },
  {
    id: "email",
    name: "Email",
    label: "Email newsletter",
    description: "Educational campaigns and gentle nurture sequences.",
    status: "disconnected",
  },
  {
    id: "whatsapp",
    name: "WhatsApp",
    label: "WhatsApp / messaging",
    description: "Automated follow-ups and check-ins, never spammy.",
    status: "disconnected",
  },
];

const connectUrls: Record<ProviderId, string> = {
  facebook: "/api/social/connect/start?provider=facebook",
  instagram: "/api/social/connect/start?provider=instagram",
  linkedin: "/api/social/connect/start?provider=linkedin",
  threads: "/api/social/connect/start?provider=threads",
  tiktok: "/api/oauth/tiktok/start",
  google: "#",
  email: "#",
  whatsapp: "#",
};

type NormalisedSocialAccountRow = {
  platform: ProviderId;
  page_id?: string | null;
  page_name?: string | null;
  is_active?: boolean | null;
  page_access_token?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  connection_type?: string | null;
};

function normStr(v: any) {
  const s = String(v ?? "").trim();
  return s || "";
}

function toBoolOrNull(v: any): boolean | null {
  if (v === true) return true;
  if (v === false) return false;
  return null;
}

function toIsoOrEmpty(v: any) {
  const s = normStr(v);
  if (!s) return "";
  const d = new Date(s);
  if (isNaN(d.getTime())) return "";
  return d.toISOString();
}

function normaliseRow(raw: any): NormalisedSocialAccountRow | null {
  const platformRaw = normStr(raw?.platform || raw?.provider);
  if (!platformRaw) return null;

  const platform = platformRaw.toLowerCase() as ProviderId;

  return {
    platform,
    page_id: raw?.page_id ?? raw?.pageId ?? null,
    page_name: raw?.page_name ?? raw?.pageName ?? null,
    is_active: toBoolOrNull(raw?.is_active ?? raw?.isActive),
    page_access_token: raw?.page_access_token ?? raw?.pageAccessToken ?? null,
    created_at: raw?.created_at ?? null,
    updated_at: raw?.updated_at ?? null,
    connection_type: raw?.connection_type ?? null,
  };
}

/**
 * Pick the “best” row for a platform:
 * 1) Active beats inactive
 * 2) Has token beats missing token (if API includes it)
 * 3) Newest updated_at/created_at wins
 */
function pickBestRow(rows: NormalisedSocialAccountRow[], platform: ProviderId) {
  const candidates = rows.filter((r) => r.platform === platform);
  if (candidates.length === 0) return null;

  const score = (r: NormalisedSocialAccountRow) => {
    const activeScore = r.is_active === true ? 1000 : r.is_active === false ? 0 : 500;
    const tokenScore = r.page_access_token ? 100 : 0;

    const updated = toIsoOrEmpty(r.updated_at);
    const created = toIsoOrEmpty(r.created_at);
    const time = updated || created || "";
    const timeScore = time ? new Date(time).getTime() / 1_000_000_000 : 0;

    return activeScore + tokenScore + timeScore;
  };

  return candidates.sort((a, b) => score(b) - score(a))[0];
}

export default function DashboardConnectPage() {
  const [providers, setProviders] = useState<Provider[]>(initialProviders);
  const [busyProvider, setBusyProvider] = useState<ProviderId | null>(null);

  // ✅ Debug panel so you can SEE what the API actually returned (no guessing)
  const [rawRows, setRawRows] = useState<any[]>([]);
  const [debugOpen, setDebugOpen] = useState(false);

  const normalisedRows = useMemo(() => {
    return (Array.isArray(rawRows) ? rawRows : [])
      .map((r) => normaliseRow(r))
      .filter(Boolean) as NormalisedSocialAccountRow[];
  }, [rawRows]);

  async function loadSocialAccounts() {
    try {
      const res = await fetch("/api/social-accounts", { cache: "no-store" });
      const data = await res.json().catch(() => null);

      // We accept either:
      // - { socialAccounts: [...] }
      // - { rows: [...] }
      // - { data: [...] }
      // - direct array
      const rows =
        (Array.isArray(data?.socialAccounts) && data.socialAccounts) ||
        (Array.isArray(data?.rows) && data.rows) ||
        (Array.isArray(data?.data) && data.data) ||
        (Array.isArray(data) && data) ||
        [];

      setRawRows(rows);

      setProviders((prev) =>
        prev.map((p) => {
          const best = pickBestRow(
            (rows as any[]).map((r) => normaliseRow(r)).filter(Boolean) as NormalisedSocialAccountRow[],
            p.id
          );

          // Treat as connected only if we found a row AND it is not explicitly inactive.
          const isActive = best ? best.is_active !== false : false;

          if (!best || !isActive) {
            return {
              ...p,
              status: "disconnected",
              accountName: undefined,
              lastSync: undefined,
            };
          }

          return {
            ...p,
            status: "connected",
            accountName: best.page_name ?? undefined,
            lastSync: best.updated_at ?? best.created_at ?? undefined,
          };
        })
      );
    } catch (e) {
      console.error("[dashboard/connect] loadSocialAccounts failed", e);
    }
  }

  useEffect(() => {
    void loadSocialAccounts();
  }, []);

  const handleConnectClick = (provider: Provider) => {
    const url = connectUrls[provider.id];

    if (!url || url === "#") {
      alert(`Connect flow for ${provider.name} is coming soon.`);
      return;
    }

    setBusyProvider(provider.id);
    setProviders((prev) =>
      prev.map((p) => (p.id === provider.id ? { ...p, status: "pending" } : p))
    );

    window.location.href = url;
  };

  const handleDisconnectClick = async (provider: Provider) => {
    if (!confirm(`Disconnect ${provider.label}?`)) return;

    setProviders((prev) =>
      prev.map((p) =>
        p.id === provider.id
          ? { ...p, status: "disconnected", accountName: undefined, lastSync: undefined }
          : p
      )
    );

    try {
      await fetch("/api/social-accounts", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform: provider.id }),
      });
    } catch (e) {
      console.error("[dashboard/connect] disconnect failed", e);
    } finally {
      await loadSocialAccounts();
    }
  };

  const threadsBest = useMemo(() => pickBestRow(normalisedRows, "threads"), [normalisedRows]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 px-4 py-10">
      <div className="mx-auto w-full max-w-6xl bg-slate-900/70 border border-slate-700 rounded-3xl shadow-xl p-6 md:p-10 backdrop-blur">
        <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl md:text-3xl font-semibold">Connect your channels</h1>
            <p className="text-sm text-slate-300 mt-1 max-w-xl">
              One-click OAuth connections. You stay in control — we only post what you approve.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setDebugOpen((v) => !v)}
              className="rounded-full border border-slate-600 bg-slate-900/80 px-3 py-1.5 text-xs text-slate-200 hover:border-slate-500"
              title="Shows what /api/social-accounts returned"
            >
              {debugOpen ? "Hide debug" : "Show debug"}
            </button>

            <div className="text-xs text-slate-400 bg-slate-900/80 border border-slate-700 rounded-2xl px-4 py-3 max-w-xs">
              <p className="font-medium text-slate-200 mb-1">Therapist-friendly</p>
              <p>No tech setup. Click connect, choose the right account, done.</p>
            </div>
          </div>
        </header>

        {debugOpen && (
          <div className="mb-6 rounded-2xl border border-slate-700 bg-slate-950/60 p-4 text-sm">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
              <div className="font-semibold text-slate-100">Debug (safe): what the app can see</div>
              <button
                type="button"
                onClick={() => void loadSocialAccounts()}
                className="rounded-full border border-slate-600 bg-slate-900/80 px-3 py-1.5 text-xs text-slate-200 hover:border-slate-500"
              >
                Refresh debug
              </button>
            </div>

            <div className="mt-3 text-xs text-slate-400">
              Threads “best row” chosen:
              <span className="ml-2 text-slate-200">
                {threadsBest
                  ? `is_active=${String(threadsBest.is_active)} · page_name=${threadsBest.page_name || "—"} · updated_at=${threadsBest.updated_at || threadsBest.created_at || "—"}`
                  : "None"}
              </span>
            </div>

            <pre className="mt-3 overflow-auto rounded-xl border border-slate-800 bg-black/40 p-3 text-[11px] text-slate-200">
{JSON.stringify(rawRows, null, 2)}
            </pre>
          </div>
        )}

        <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {providers.map((provider) => {
            const busy = busyProvider === provider.id;
            const connected = provider.status === "connected";

            return (
              <div
                key={provider.id}
                className="flex flex-col rounded-2xl border border-slate-700 bg-slate-900/80 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold">{provider.label}</span>
                      <span
                        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                          provider.status === "connected"
                            ? "bg-emerald-500/20 text-emerald-200 border-emerald-500/60"
                            : provider.status === "pending"
                            ? "bg-amber-500/15 text-amber-200 border-amber-500/60"
                            : "bg-slate-800 text-slate-300 border-slate-600"
                        }`}
                      >
                        {provider.status === "connected"
                          ? "Connected"
                          : provider.status === "pending"
                          ? "Pending"
                          : "Not connected"}
                      </span>
                    </div>

                    <p className="mt-1 text-xs text-slate-300">{provider.description}</p>
                    {provider.hint && (
                      <p className="mt-1 text-[11px] text-slate-500">{provider.hint}</p>
                    )}

                    {provider.accountName && connected && (
                      <p className="mt-2 text-[11px] text-emerald-300">
                        Connected as <span className="font-medium">{provider.accountName}</span>
                      </p>
                    )}

                    {provider.lastSync && connected && (
                      <p className="mt-1 text-[11px] text-slate-400">Last updated: {provider.lastSync}</p>
                    )}
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {!connected && (
                    <button
                      type="button"
                      onClick={() => handleConnectClick(provider)}
                      disabled={busy}
                      className="rounded-full bg-blue-500 px-3 py-1.5 text-xs font-medium text-slate-50 hover:bg-blue-400 disabled:opacity-60"
                    >
                      {busy ? `Opening ${provider.name}…` : `Connect ${provider.name}`}
                    </button>
                  )}

                  {connected && (
                    <button
                      type="button"
                      onClick={() => handleDisconnectClick(provider)}
                      className="rounded-full border border-slate-600 bg-slate-900/80 px-3 py-1.5 text-xs text-slate-200 hover:border-red-500 hover:text-red-200"
                    >
                      Disconnect
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => void loadSocialAccounts()}
                    className="rounded-full border border-slate-600 bg-slate-900/80 px-3 py-1.5 text-xs text-slate-200 hover:border-slate-500"
                  >
                    Refresh
                  </button>
                </div>
              </div>
            );
          })}
        </section>

        <footer className="mt-8 text-xs text-slate-400">
          Tip: Always click Connect from this page. Don’t bookmark callback URLs — they need live OAuth state.
        </footer>
      </div>
    </div>
  );
}
