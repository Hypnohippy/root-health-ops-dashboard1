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

  // ✅ TikTok Login Kit start
  tiktok: "/api/oauth/tiktok/start",

  // Coming soon / placeholders
  google: "#",
  email: "#",
  whatsapp: "#",
};

type SocialAccountRow = {
  platform: ProviderId;
  page_id: string | null;
  page_name: string | null;
};

type StatusApiResponse = {
  success: boolean;
  organisationId?: string;
  platforms?: Record<
    string,
    {
      connected: boolean;
      page_name: string | null;
      page_id: string | null;
      token_expires_at: string | null;
      updated_at: string | null;
    }
  >;
};

export default function DashboardConnectPage() {
  const [providers, setProviders] = useState<Provider[]>(initialProviders);
  const [busyProvider, setBusyProvider] = useState<ProviderId | null>(null);

  // Keep this for fallback only (does not break other pages)
  async function loadSocialAccountsFallback() {
    try {
      const res = await fetch("/api/social-accounts", { cache: "no-store" });
      const data = await res.json().catch(() => null);
      const rows: SocialAccountRow[] = data?.socialAccounts ?? [];

      setProviders((prev) =>
        prev.map((p) => {
          const row = rows.find((r) => r.platform === p.id);
          if (!row) return { ...p, status: "disconnected", accountName: undefined };
          return {
            ...p,
            status: "connected",
            accountName: row.page_name ?? p.accountName,
          };
        })
      );
    } catch (e) {
      console.error("[dashboard/connect] loadSocialAccounts fallback failed", e);
    }
  }

  // Preferred loader: server-side status endpoint (works even if browser reads are blocked by RLS)
  async function loadConnectionStatuses() {
    try {
      const res = await fetch("/api/social-accounts/status", { cache: "no-store" });
      const data: StatusApiResponse | null = await res.json().catch(() => null);

      if (!data?.success || !data.platforms) {
        // If anything odd happens, fall back to old endpoint
        await loadSocialAccountsFallback();
        return;
      }

      setProviders((prev) =>
        prev.map((p) => {
          // Only social providers are returned by this endpoint
          const platformData = data.platforms?.[p.id];

          // If this provider isn't managed (google/email/whatsapp), keep as-is
          if (!platformData) {
            return p;
          }

          if (!platformData.connected) {
            return { ...p, status: "disconnected", accountName: undefined };
          }

          return {
            ...p,
            status: "connected",
            accountName: platformData.page_name ?? p.accountName,
          };
        })
      );
    } catch (e) {
      console.error("[dashboard/connect] loadConnectionStatuses failed", e);
      // fallback so we never break the page
      await loadSocialAccountsFallback();
    }
  }

  useEffect(() => {
    // 1) Instant UI update after OAuth redirect (so user sees success immediately)
    try {
      const params = new URLSearchParams(window.location.search);
      const tiktok = params.get("tiktok");
      if (tiktok === "connected") {
        setProviders((prev) =>
          prev.map((p) => (p.id === "tiktok" ? { ...p, status: "connected" } : p))
        );
      }
    } catch {}

    // 2) Then load real truth from server
    void loadConnectionStatuses();
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
      // refresh truth after disconnect
      void loadConnectionStatuses();
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
                    {provider.hint && (
                      <p className="mt-1 text-[11px] text-slate-500">{provider.hint}</p>
                    )}

                    {provider.accountName && (
                      <p className="mt-2 text-[11px] text-emerald-300">
                        Connected as{" "}
                        <span className="font-medium">{provider.accountName}</span>
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
                    onClick={() => void loadConnectionStatuses()}
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
