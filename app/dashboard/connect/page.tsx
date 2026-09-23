// app/dashboard/connect/page.tsx
"use client";

import BrandGrowthProfileEditor from "../components/BrandGrowthProfileEditor";
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
    name: "Google",
    label: "Google Business Profile",
    description: "Local SEO posts so clients find you when they’re searching.",
    hint: "Connect your Google account for Business Profile posting.",
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

// ✅ Updated: Google now uses the real OAuth start route
type ConnectHelperCard = {
  provider: ProviderId | "facebook" | "instagram";
  tone: "info" | "success" | "warning";
  title: string;
  body: string;
  steps: string[];
  primaryLabel?: string;
  primaryHref?: string;
  secondaryLabel?: string;
  secondaryHref?: string;
};

function buildConnectHelperFromUrl(): ConnectHelperCard | null {
  if (typeof window === "undefined") return null;

  const params = new URLSearchParams(window.location.search);

  const provider = (String(params.get("provider") || "facebook").trim().toLowerCase() ||
    "facebook") as ProviderId;

  const connected = String(params.get("connected") || "").trim();
  const instagramState = String(params.get("instagram") || "").trim();
  const error = String(params.get("error") || "").trim().toLowerCase();
  const errorDescription = String(params.get("error_description") || "").trim();

  if (connected === "1") {
    return {
      provider,
      tone: "success",
      title:
        instagramState === "connected"
          ? "You’re connected 🎉"
          : "Facebook connected 🎉",
      body:
        instagramState === "connected"
          ? "Your Facebook Page and linked Instagram account are now connected."
          : "Your Facebook Page is now connected and ready to use.",
      steps: [
        "Go back to the dashboard when you’re ready.",
        "Use Quick Blast to send a simple test post.",
        "If you also want Instagram, make sure your Instagram is a Professional account linked to that Facebook Page.",
      ],
    };
  }

  if (error === "facebook_no_pages") {
    return {
      provider,
      tone: "warning",
      title:
        provider === "instagram"
          ? "Instagram needs a Facebook Page first"
          : "You’re nearly there — you just need a Facebook Page",
      body:
        "We could not find any Facebook Pages on this account. That usually means you are using a personal Facebook profile only, or you are signed into the wrong Facebook account.",
      steps: [
        "Make sure you are signed into the Facebook account you use for your business.",
        "If you only have a personal profile, create a Facebook Page first.",
        "If you already have a Page, make sure you have Full control / Admin access to it.",
        "If you want Instagram too, switch Instagram to a Professional account and link it to that Facebook Page.",
        "Then come back here and press Connect again.",
      ],
      primaryLabel: "Create a Facebook Page",
      primaryHref: "https://www.facebook.com/pages/create",
      secondaryLabel: "Try connect again",
      secondaryHref:
        provider === "instagram"
          ? "/api/social/connect/start?provider=instagram"
          : "/api/social/connect/start?provider=facebook",
    };
  }

  if (error === "facebook_missing_page_token") {
    return {
      provider,
      tone: "warning",
      title: "We found your Page, but Facebook did not give us permission yet",
      body:
        "This usually means the Page access is incomplete or the wrong Facebook account was used during login.",
      steps: [
        "Open your Facebook Page settings.",
        "Check that your Facebook profile has Full control / Admin access.",
        "Then come back here and try the connection again.",
      ],
      secondaryLabel: "Try connect again",
      secondaryHref:
        provider === "instagram"
          ? "/api/social/connect/start?provider=instagram"
          : "/api/social/connect/start?provider=facebook",
    };
  }

  if (error === "no_organisation") {
    return {
      provider,
      tone: "warning",
      title: "Your workspace is still getting ready",
      body:
        "We could not find your workspace during connect. This is usually fixed by signing out and back in once.",
      steps: [
        "Sign out of Root Health Ops.",
        "Close the browser tab.",
        "Sign back in.",
        "Come back to Connect and try again.",
      ],
    };
  }

  if (error === "facebook_token_exchange_failed") {
    return {
      provider,
      tone: "warning",
      title: "Facebook login started, but didn’t finish properly",
      body:
        errorDescription ||
        "This usually clears on a second attempt once the correct Facebook account is selected.",
      steps: [
        "Make sure you are using the Facebook account that manages your business Page.",
        "Close the Facebook login popup or tab.",
        "Come back here and try again.",
      ],
      secondaryLabel: "Try connect again",
      secondaryHref:
        provider === "instagram"
          ? "/api/social/connect/start?provider=instagram"
          : "/api/social/connect/start?provider=facebook",
    };
  }

  if (!error) return null;

  return {
    provider,
    tone: "info",
    title: "Let’s fix this together",
    body:
      errorDescription ||
      "Something interrupted the connection. We’ll keep this simple and get you back on track.",
    steps: [
      "Make sure you are signed into the correct social account.",
      "Try the connection again.",
      "If it still fails, we can guide you step by step.",
    ],
    secondaryLabel: "Try connect again",
    secondaryHref:
      provider === "instagram"
        ? "/api/social/connect/start?provider=instagram"
        : provider === "facebook"
        ? "/api/social/connect/start?provider=facebook"
        : undefined,
  };
}
const connectUrls: Record<ProviderId, string> = {
  facebook: "/api/social/connect/start?provider=facebook",
  instagram: "/api/social/connect/start?provider=instagram",
  linkedin: "/api/oauth/linkedin/start",
  threads: "/api/social/connect/start?provider=threads",
  tiktok: "/api/oauth/tiktok/start",
  google: "/api/oauth/google/start",
  email: "#",
  whatsapp: "#",
};

type SocialAccountRow = {
  platform: ProviderId;
  page_id: string | null;
  page_name: string | null;
  is_active?: boolean | null;
};

function scopedUrl(path: string) {
  const url = new URL(path, window.location.origin);
  const organisationId = new URLSearchParams(window.location.search).get("organisationId");
  if (organisationId) url.searchParams.set("organisationId", organisationId);
  return url.pathname + url.search;
}

export default function DashboardConnectPage() {
  const [providers, setProviders] = useState<Provider[]>(initialProviders);
  const [busyProvider, setBusyProvider] = useState<ProviderId | null>(null);
  const [connectHelper, setConnectHelper] = useState<ConnectHelperCard | null>(null);

  async function loadSocialAccounts() {
    try {
      const res = await fetch(scopedUrl("/api/social-accounts"), { cache: "no-store" });
      const data = await res.json().catch(() => null);
      const rows: SocialAccountRow[] = data?.socialAccounts ?? [];

      setProviders((prev) =>
        prev.map((p) => {
          const row = rows.find((r) => r.platform === p.id);
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
  useEffect(() => {
  const helper = buildConnectHelperFromUrl();
  setConnectHelper(helper);
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

    window.location.href = scopedUrl(url);
  };

  const handleDisconnectClick = async (provider: Provider) => {
    if (!confirm(`Disconnect ${provider.label}?`)) return;

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

    try {
      await fetch(scopedUrl("/api/social-accounts"), {
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
            <h1 className="text-2xl md:text-3xl font-semibold">
              Connect your business
            </h1>
            <p className="text-sm text-slate-300 mt-1 max-w-xl">
              One-click OAuth connections. You stay in control — we only post
              what you approve.
            </p>
          </div>
          <div className="text-xs text-slate-400 bg-slate-900/80 border border-slate-700 rounded-2xl px-4 py-3 max-w-xs">
            <p className="font-medium text-slate-200 mb-1">Simple setup</p>
            <p>No tech setup. Click connect, choose the right account, done.</p>
          </div>
        </header>

        <BrandGrowthProfileEditor />

        <h2 className="mb-4 text-lg font-semibold">Your channels</h2>
        <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {connectHelper ? (
  <div
    className={[
      "mb-6 rounded-3xl border p-5",
      connectHelper.tone === "success"
        ? "border-emerald-500/30 bg-emerald-500/10"
        : connectHelper.tone === "warning"
        ? "border-amber-500/30 bg-amber-500/10"
        : "border-sky-500/30 bg-sky-500/10",
    ].join(" ")}
  >
    <div
      className={[
        "text-base font-semibold",
        connectHelper.tone === "success"
          ? "text-emerald-200"
          : connectHelper.tone === "warning"
          ? "text-amber-200"
          : "text-sky-200",
      ].join(" ")}
    >
      {connectHelper.title}
    </div>

    <div className="mt-2 text-sm text-slate-200">
      {connectHelper.body}
    </div>

    <div className="mt-4 rounded-2xl border border-white/10 bg-slate-950/40 p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
        Step by step
      </div>

      <div className="mt-3 space-y-2">
        {connectHelper.steps.map((step, index) => (
          <div key={`${step}-${index}`} className="flex items-start gap-3 text-sm text-slate-200">
            <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-800 text-[11px] font-semibold text-slate-100">
              {index + 1}
            </div>
            <div>{step}</div>
          </div>
        ))}
      </div>
    </div>

    <div className="mt-4 flex flex-wrap gap-3">
      {connectHelper.primaryHref && connectHelper.primaryLabel ? (
        <a
          href={connectHelper.primaryHref}
          target="_blank"
          rel="noreferrer"
          className="rounded-2xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400"
        >
          {connectHelper.primaryLabel}
        </a>
      ) : null}

      {connectHelper.secondaryHref && connectHelper.secondaryLabel ? (
        <a
          href={connectHelper.secondaryHref}
          className="rounded-2xl border border-slate-600 bg-slate-900 px-4 py-2 text-sm text-slate-100 hover:bg-white/10"
        >
          {connectHelper.secondaryLabel}
        </a>
      ) : null}
    </div>
  </div>
) : null}
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
                      <span className="text-sm font-semibold">
                        {provider.label}
                      </span>
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

                    <p className="mt-1 text-xs text-slate-300">
                      {provider.description}
                    </p>

                    {provider.hint && (
                      <p className="mt-1 text-[11px] text-slate-500">
                        {provider.hint}
                      </p>
                    )}

                    {provider.accountName && connected && (
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
                      {busy
                        ? `Opening ${provider.name}…`
                        : `Connect ${provider.name}`}
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
          Tip: Always click Connect from this page. Don’t bookmark callback URLs
          — they need live OAuth state.
        </footer>
      </div>
    </div>
  );
}
