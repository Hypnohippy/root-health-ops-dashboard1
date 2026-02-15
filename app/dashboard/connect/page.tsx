// app/dashboard/connect/page.tsx
"use client";

import React, { useEffect, useState } from "react";

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

type SocialAccountRow = {
  platform: ProviderId;
  page_id: string | null;
  page_name: string | null;
  is_active?: boolean | null;
  token_expires_at?: string | null;
  updated_at?: string | null;
};

function normaliseRows(apiResponse: any): SocialAccountRow[] {
  // ✅ Accept BOTH:
  // 1) { success:true, socialAccounts:[...] }
  // 2) [ ... ]
  if (Array.isArray(apiResponse)) return apiResponse as SocialAccountRow[];
  const rows = apiResponse?.socialAccounts;
  if (Array.isArray(rows)) return rows as SocialAccountRow[];
  return [];
}

export default function DashboardConnectPage() {
  const [providers, setProviders] = useState<Provider[]>(initialProviders);
  const [busyProvider, setBusyProvider] = useState<ProviderId | null>(null);

  async function loadSocialAccounts() {
    try {
      const res = await fetch("/api/social-accounts", { cache: "no-store" });
      const data = await res.json().catch(() => null);

      const rows: SocialAccountRow[] = normaliseRows(data);

      setProviders((prev) =>
        prev.map((p) => {
          const row = rows.find((r) => String(r.platform) === p.id);

          // ✅ Connected ONLY if row exists and is_active is not false
          const isActive = row ? row.is_active !== false : false;

          if (!row || !isActive) {
            return { ...p, status: "disconnected", accountName: undefined };
          }

          return {
            ...p,
            status: "connected",
            accountName: row.page_name ?? p.accountName,
          };
        })
      );
    } catch (e) {
      console.error("[dashboard/connect] loadSocialAccounts failed", e);
    } finally {
      setBusyProvider(null);
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

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 px-4 py-10">
      <div className="mx-auto w-full max-w-6xl bg-slate-900/70 border border-slate-700 rounded-3xl shadow-xl p-6 md:p-10 backdrop-blur">
        <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl md:text-3xl font-semibold">Connect your channels</h1>
            <p className="text-sm text-slate-300 mt-1 max-w-xl">
              One-click OAuth connections. You stay in control — we only post what you approve.
            </p>
          </div>
          <div className="text-xs text-slate-400 bg-slate-900/80 border border-slate-700 rounded-2xl px-4 py-3 max-w-xs">
            <p className="font-medium text-slate-200 mb-1">Therapist-friendly</p>
            <p>No tech setup. Click connect, choose the right account, done.</p>
          </div>
        </header>

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
                    {provider.hint && <p className="mt-1 text-[11px] text-slate-500">{provider.hint}</p>}

                    {provider.accountName && connected && (
                      <p className="mt-2 text-[11px] text-emerald-300">
                        Connected as <span className="font-medium">{provider.accountName}</span>
                      </p>
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
