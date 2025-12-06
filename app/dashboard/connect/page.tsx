// app/connect/page.tsx
"use client";

import React, { useEffect, useState } from "react";

type ProviderId =
  | "facebook"
  | "instagram"
  | "tiktok"
  | "linkedin"
  | "google"
  | "email"
  | "whatsapp";

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

type SocialAccountsResponse = {
  providers: {
    id: ProviderId;
    status: ConnectionStatus;
    accountName?: string | null;
    lastSync?: string | null;
  }[];
};

const initialProviders: Provider[] = [
  {
    id: "facebook",
    name: "Facebook",
    label: "Facebook Page",
    description: "Schedule posts, run gentle ads and reply to comments.",
    hint: "Requires a Facebook Page and Business Manager access.",
    status: "disconnected",
  },
  {
    id: "instagram",
    name: "Instagram",
    label: "Instagram",
    description: "Reels, stories and feed posts from the same content.",
    hint: "Connect via your Facebook account (Meta).",
    status: "disconnected",
  },
  {
    id: "tiktok",
    name: "TikTok",
    label: "TikTok",
    description: "Short-form video built from your campaigns.",
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
    hint: "Connect your email platform or start simple with CSV export.",
    status: "disconnected",
  },
  {
    id: "whatsapp",
    name: "WhatsApp",
    label: "WhatsApp / messaging",
    description: "Automated follow-ups and check-ins, never spammy.",
    hint: "Requires a WhatsApp Business or approved messaging provider.",
    status: "disconnected",
  },
];

// 👉 TODO: update these URLs to your real OAuth / Make / API entrypoints
const connectUrls: Record<ProviderId, string> = {
  facebook: "/api/oauth/facebook/start",
  instagram: "/api/oauth/instagram/start",
  tiktok: "/api/oauth/tiktok/start",
  linkedin: "/api/oauth/linkedin/start",
  google: "/api/oauth/google/start",
  email: "/connect/email/setup",
  whatsapp: "/api/oauth/whatsapp/start",
};

export default function ConnectPage() {
  const [providers, setProviders] = useState<Provider[]>(initialProviders);
  const [busyProvider, setBusyProvider] = useState<ProviderId | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // Load real connection status from backend
  useEffect(() => {
    const loadConnections = async () => {
      try {
        const res = await fetch("/api/social-accounts", {
          method: "GET",
        });

        if (!res.ok) {
          throw new Error("Failed to fetch social accounts");
        }

        const data: SocialAccountsResponse = await res.json();

        setProviders((prev) =>
          prev.map((p) => {
            const match = data.providers.find((api) => api.id === p.id);
            if (!match) return p;
            return {
              ...p,
              status: match.status,
              accountName: match.accountName ?? undefined,
              lastSync: match.lastSync ?? undefined,
            };
          })
        );
      } catch (err) {
        console.error("[connect] Failed to load social accounts", err);
        // fallback: keep initialProviders
      } finally {
        setLoading(false);
      }
    };

    loadConnections();
  }, []);

  const handleConnectClick = (provider: Provider) => {
    const url = connectUrls[provider.id];

    if (!url || url === "#") {
      alert(
        `Connection flow for ${provider.label} is not wired yet.\n\nUpdate connectUrls["${provider.id}"] in app/connect/page.tsx to your real auth URL when ready.`
      );
      return;
    }

    setBusyProvider(provider.id);
    // Real life: send them into Meta/TikTok/LinkedIn/Google/etc.
    window.location.href = url;
  };

  const handleDisconnectClick = async (provider: Provider) => {
    if (
      !confirm(
        `Disconnect ${provider.label}? Root Health will stop posting to it.`
      )
    ) {
      return;
    }

    try {
      // 👉 TODO: implement real disconnect in backend.
      await fetch("/api/social-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "disconnect", providerId: provider.id }),
      });
    } catch (err) {
      console.error("[connect] Failed to call disconnect endpoint", err);
    }

    // Optimistic UI update
    setProviders((prev) =>
      prev.map((p) =>
        p.id === provider.id
          ? {
              ...p,
              status: "disconnected",
              accountName: undefined,
              lastSync: undefined,
            }
          : p
      )
    );
  };

  const handleTestClick = async (provider: Provider) => {
    try {
      // 👉 TODO: implement real test in backend.
      await fetch("/api/social-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "test", providerId: provider.id }),
      });
      alert(`Connection test for ${provider.label} will be added here later.`);
    } catch (err) {
      console.error("[connect] Failed to test connection", err);
      alert(`Could not test ${provider.label} right now.`);
    }
  };

  const connectedCount = providers.filter(
    (p) => p.status === "connected"
  ).length;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-6xl bg-slate-900/70 border border-slate-700 rounded-3xl shadow-xl p-6 md:p-10 backdrop-blur">
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl md:text-3xl font-semibold">
              Connect your channels
            </h1>
            <p className="text-sm text-slate-300 mt-1 max-w-xl">
              Plug your existing pages and profiles into Root Health. You stay
              in control — we only post what you approve.
            </p>
          </div>
          <div className="text-xs text-slate-400 bg-slate-900/80 border border-slate-700 rounded-2xl px-4 py-3 max-w-xs">
            <p className="font-medium text-slate-200 mb-1">
              Therapist-friendly, not techy
            </p>
            <p>
              Each connection can be removed at any time. No auto-posting until
              you explicitly approve a campaign.
            </p>
          </div>
        </header>

        {/* Quick summary row */}
        <section className="grid gap-4 md:grid-cols-3 mb-8 text-sm">
          <SummaryCard
            label="Connected channels"
            value={`${connectedCount} / ${providers.length}`}
          />
          <SummaryCard
            label="Ready for posting"
            value={
              connectedCount > 0
                ? "Yes — at least one"
                : "Not yet — connect a channel"
            }
          />
          <SummaryCard
            label="Status"
            value={
              loading
                ? "Checking your connections…"
                : connectedCount > 0
                ? "Good to go"
                : "Waiting for your first connection"
            }
          />
        </section>

        {/* Providers grid */}
        <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {providers.map((provider) => (
            <ProviderCard
              key={provider.id}
              provider={provider}
              busy={busyProvider === provider.id}
              onConnect={() => handleConnectClick(provider)}
              onDisconnect={() => handleDisconnectClick(provider)}
              onTest={() => handleTestClick(provider)}
            />
          ))}
        </section>

        {/* Footer */}
        <footer className="mt-8 flex flex-col md:flex-row md:items-center md:justify-between gap-3 text-xs text-slate-400">
          <p>
            Need help connecting something? Your Root Health Ops workspace can
            be fully guided on a call — no tech knowledge required.
          </p>
          <p className="text-slate-500">
            Tip: Start with Facebook & Instagram, then add others over time.
          </p>
        </footer>
      </div>
    </div>
  );
}

/* Helper components */

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-700 bg-slate-900/80 px-4 py-3">
      <p className="text-[11px] uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-1 text-sm font-medium text-slate-100">{value}</p>
    </div>
  );
}

function ProviderCard({
  provider,
  busy,
  onConnect,
  onDisconnect,
  onTest,
}: {
  provider: Provider;
  busy: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  onTest: () => void;
}) {
  const isConnected = provider.status === "connected";
  const isPending = provider.status === "pending";

  return (
    <div className="flex flex-col rounded-2xl border border-slate-700 bg-slate-900/80 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">{provider.label}</span>
            <StatusPill status={provider.status} />
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
          {provider.lastSync && (
            <p className="mt-0.5 text-[11px] text-slate-500">
              Last sync: {provider.lastSync}
            </p>
          )}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {!isConnected && (
          <button
            type="button"
            onClick={onConnect}
            disabled={busy}
            className="rounded-full bg-blue-500 px-3 py-1.5 text-xs font-medium text-slate-50 hover:bg-blue-400 disabled:opacity-60"
          >
            {busy
              ? `Opening ${provider.name}…`
              : `Connect ${provider.name}`}
          </button>
        )}

        {isConnected && (
          <>
            <button
              type="button"
              onClick={onTest}
              className="rounded-full border border-emerald-500/70 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-100 hover:bg-emerald-500/20"
            >
              Test connection
            </button>
            <button
              type="button"
              onClick={onDisconnect}
              className="rounded-full border border-slate-600 bg-slate-900/80 px-3 py-1.5 text-xs text-slate-200 hover:border-red-500 hover:text-red-200"
            >
              Disconnect
            </button>
          </>
        )}

        {isPending && !isConnected && (
          <button
            type="button"
            onClick={onTest}
            className="rounded-full border border-amber-500/70 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-100 hover:bg-amber-500/20"
          >
            Refresh status
          </button>
        )}
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: ConnectionStatus }) {
  let text = "";
  let color = "";

  switch (status) {
    case "connected":
      text = "Connected";
      color = "bg-emerald-500/20 text-emerald-200 border-emerald-500/60";
      break;
    case "pending":
      text = "Pending";
      color = "bg-amber-500/15 text-amber-200 border-amber-500/60";
      break;
    case "disconnected":
    default:
      text = "Not connected";
      color = "bg-slate-800 text-slate-300 border-slate-600";
      break;
  }

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${color}`}
    >
      {text}
    </span>
  );
}
