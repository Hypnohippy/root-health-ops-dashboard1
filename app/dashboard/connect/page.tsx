// app/dashboard/connect/page.tsx
"use client";

import React, { useEffect, useState } from "react";

type ProviderId =
  | "facebook"
  | "instagram"
  | "tiktok"
  | "linkedin"
  | "threads"
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

type SocialAccountRow = {
  platform: ProviderId;
  page_id: string | null;
  page_name: string | null;
};

const STORAGE_KEY = "rh_connect_providers_v2";

const initialProviders: Provider[] = [
  {
    id: "facebook",
    name: "Facebook",
    label: "Facebook Page",
    description: "Post and reply from Root Health Ops (your page stays yours).",
    hint: "OAuth connect (recommended). Make webhook test still available below.",
    status: "disconnected",
  },
  {
    id: "linkedin",
    name: "LinkedIn",
    label: "LinkedIn",
    description: "Post to your personal LinkedIn (hero channel).",
    hint: "OAuth connect (recommended). Company pages later.",
    status: "disconnected",
  },
  {
    id: "instagram",
    name: "Instagram",
    label: "Instagram",
    description: "Reels, stories and feed posts.",
    hint: "Coming soon (after Facebook + LinkedIn).",
    status: "disconnected",
  },
  {
    id: "threads",
    name: "Threads",
    label: "Threads",
    description: "Short thought-leadership updates.",
    hint: "Coming soon.",
    status: "disconnected",
  },
  {
    id: "tiktok",
    name: "TikTok",
    label: "TikTok",
    description: "Short-form video built from your campaigns.",
    hint: "Coming soon.",
    status: "disconnected",
  },
  {
    id: "google",
    name: "Google Business Profile",
    label: "Google Business Profile",
    description: "Local SEO posts so clients find you.",
    hint: "Coming soon.",
    status: "disconnected",
  },
  {
    id: "email",
    name: "Email",
    label: "Email newsletter",
    description: "Educational campaigns and gentle nurture sequences.",
    hint: "Setup wizard (simple).",
    status: "disconnected",
  },
  {
    id: "whatsapp",
    name: "WhatsApp",
    label: "WhatsApp / messaging",
    description: "Automated follow-ups and check-ins, never spammy.",
    hint: "Coming soon.",
    status: "disconnected",
  },
];

// OAuth starts (we’ll add these routes next)
const connectUrls: Record<ProviderId, string> = {
  facebook: "/api/oauth/facebook/start",
  linkedin: "/api/oauth/linkedin/start",
  instagram: "#",
  tiktok: "#",
  threads: "#",
  google: "#",
  email: "/dashboard/connect/email/setup",
  whatsapp: "#",
};

export default function DashboardConnectPage() {
  const [providers, setProviders] = useState<Provider[]>(initialProviders);
  const [busyProvider, setBusyProvider] = useState<ProviderId | null>(null);

  // Workspace
  const [organisationId, setOrganisationId] = useState<string | null>(null);

  // Facebook Test Post + Root Coach state
  const [testMessage, setTestMessage] = useState(
    "This is a test post from Root Health Ops Dashboard ✅"
  );
  const [testIsLoading, setTestIsLoading] = useState(false);
  const [testStatus, setTestStatus] = useState<string | null>(null);
  const [testError, setTestError] = useState<string | null>(null);
  const [coachMessage, setCoachMessage] = useState<string | null>(null);

  const resolveOrg = async () => {
    const res = await fetch("/api/social-accounts", { method: "GET" });
    const data: any = await res.json().catch(() => null);

    const org =
      typeof data?.organisationId === "string"
        ? data.organisationId
        : typeof data?.organisation_id === "string"
        ? data.organisation_id
        : null;

    if (!org) throw new Error("Workspace not loaded yet. Please refresh.");
    setOrganisationId(org);
    return org;
  };

  const loadSocialAccounts = async (orgMaybe?: string) => {
    try {
      const org = orgMaybe || organisationId || (await resolveOrg());

      const res = await fetch(
        `/api/social-accounts?organisationId=${encodeURIComponent(org)}`
      );

      if (!res.ok) {
        console.warn("[dashboard/connect] /api/social-accounts not ok", res.status);
        return;
      }

      const data = await res.json();
      const rows: SocialAccountRow[] = data.socialAccounts ?? [];

      setProviders((prev) =>
        prev.map((p) => {
          const row = rows.find((r) => r.platform === p.id);
          if (!row) return p;

          // If row exists, treat as connected (page_name helps display)
          return {
            ...p,
            status: "connected",
            accountName: row.page_name ?? p.accountName,
          };
        })
      );
    } catch (err) {
      console.error("[dashboard/connect] failed to load social accounts", err);
    }
  };

  useEffect(() => {
    // restore UI state (purely cosmetic)
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as Provider[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          setProviders((prev) => {
            // keep the new copy as the source of truth, but merge statuses
            const map = new Map(parsed.map((x) => [x.id, x]));
            return prev.map((p) => {
              const old = map.get(p.id);
              return old ? { ...p, status: old.status, accountName: old.accountName } : p;
            });
          });
        }
      }
    } catch {
      // ignore
    }

    void loadSocialAccounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(providers));
    } catch {
      // ignore
    }
  }, [providers]);

  const deleteSocialAccount = async (providerId: ProviderId) => {
    try {
      const res = await fetch("/api/social-accounts", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform: providerId }),
      });

      if (!res.ok) {
        let body: any = null;
        try {
          body = await res.json();
        } catch {}
        console.error("[dashboard/connect] deleteSocialAccount failed", res.status, body);
      }
    } catch (err) {
      console.error("[dashboard/connect] failed to delete social account", err);
    }
  };

  const handleConnectClick = async (provider: Provider) => {
    const url = connectUrls[provider.id];

    if (!url || url === "#") {
      alert(
        `${provider.label} is coming soon.\n\n` +
          `For now: Facebook + LinkedIn are the hero channels.\n` +
          `We’ll roll the rest in once those are rock-solid.`
      );
      return;
    }

    setBusyProvider(provider.id);

    // Ensure org is resolved so OAuth start can attach it (query param)
    let org: string | null = organisationId;
    try {
      org = org || (await resolveOrg());
    } catch {
      // ignore, OAuth route can also resolve single-tenant if needed
    }

    const finalUrl = org ? `${url}?organisationId=${encodeURIComponent(org)}` : url;
    window.location.href = finalUrl;
  };

  const handleDisconnectClick = (provider: Provider) => {
    if (!confirm(`Disconnect ${provider.label}? Root Health will stop posting to it.`)) return;

    setProviders((prev) =>
      prev.map((p) =>
        p.id === provider.id
          ? { ...p, status: "disconnected", accountName: undefined, lastSync: undefined }
          : p
      )
    );

    void deleteSocialAccount(provider.id);
  };

  const sendFacebookTestPost = async () => {
    setTestIsLoading(true);
    setTestStatus(null);
    setTestError(null);
    setCoachMessage(null);

    try {
      const res = await fetch("/api/facebook-test-post", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: testMessage }),
      });

      let data: any = null;
      try {
        data = await res.json();
      } catch {
        throw new Error("Server did not return valid JSON. Check /api/facebook-test-post.");
      }

      if (!res.ok) throw new Error(data.error || "Failed to send test post");

      setTestStatus("Test post sent successfully 🎉");

      const now = new Date().toISOString();
      setProviders((prev) =>
        prev.map((p) =>
          p.id === "facebook"
            ? {
                ...p,
                status: "connected",
                lastSync: now,
                accountName: p.accountName ?? "Your Facebook Page",
              }
            : p
        )
      );

      await loadSocialAccounts();
    } catch (err: any) {
      const message = err?.message || "Something went wrong sending the test post.";
      setTestError(message);

      fetch("/api/ai/root-coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          context: "facebook_test_post",
          errorMessage: message,
          userAction: "Clicked Facebook Test Post in Connect page",
        }),
      })
        .then((r) => r.json())
        .then((d) => d?.coachMessage && setCoachMessage(d.coachMessage))
        .catch(() => {});
    } finally {
      setTestIsLoading(false);
    }
  };

  const handleTestClick = (provider: Provider) => {
    setBusyProvider(provider.id);
    void loadSocialAccounts().finally(() => setBusyProvider(null));
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-6xl bg-slate-900/70 border border-slate-700 rounded-3xl shadow-xl p-6 md:p-10 backdrop-blur">
        <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl md:text-3xl font-semibold">Connect your channels</h1>
            <p className="text-sm text-slate-300 mt-1 max-w-xl">
              Plug your existing pages and profiles into Root Health. You stay in control —
              we only post what you approve.
            </p>
            <div className="mt-2 text-[11px] text-slate-400">
              Workspace:{" "}
              <span className="text-slate-200 font-semibold">
                {organisationId ? "loaded" : "loading…"}
              </span>
            </div>
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-3 mb-8 text-sm">
          <SummaryCard
            label="Connected channels"
            value={`${providers.filter((p) => p.status === "connected").length} / ${providers.length}`}
          />
          <SummaryCard
            label="Hero channels"
            value="Facebook + LinkedIn"
          />
          <SummaryCard label="Next step" value="Connect heroes → Quick Blast → Scheduled → Responses." />
        </section>

        <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 mb-8">
          {providers.map((provider) => (
            <ProviderCard
              key={provider.id}
              provider={provider}
              busy={busyProvider === provider.id}
              onConnect={() => void handleConnectClick(provider)}
              onDisconnect={() => handleDisconnectClick(provider)}
              onTest={() => handleTestClick(provider)}
            />
          ))}
        </section>

        <section className="rounded-2xl border border-emerald-500/30 bg-slate-900/80 p-6 space-y-4">
          <div>
            <h2 className="text-base md:text-lg font-semibold text-slate-50">Facebook Test Post</h2>
            <p className="text-[11px] md:text-xs text-slate-400">
              Sends a live test payload to your Make webhook (legacy bridge).
            </p>
          </div>

          <div className="space-y-2">
            <label className="block text-[11px] font-medium text-slate-300">
              Test message content
            </label>
            <textarea
              className="w-full min-h-[100px] rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
              value={testMessage}
              onChange={(e) => setTestMessage(e.target.value)}
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={sendFacebookTestPost}
              disabled={testIsLoading || !testMessage.trim()}
              className="inline-flex items-center rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-60 disabled:cursor-not-allowed hover:bg-emerald-400 transition"
            >
              {testIsLoading ? "Sending…" : "Send Facebook Test Post"}
            </button>
          </div>

          {testStatus && <div className="mt-2 text-[11px] text-emerald-400">{testStatus}</div>}
          {testError && <div className="mt-2 text-[11px] text-red-400">{testError}</div>}

          {coachMessage && (
            <div className="mt-3 rounded-lg border border-sky-500/40 bg-sky-950/40 p-3">
              <div className="text-[10px] uppercase tracking-wide text-sky-300 mb-1">
                Root Coach
              </div>
              <div className="text-[11px] text-sky-50 whitespace-pre-wrap">{coachMessage}</div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

/* Helper components */

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-700 bg-slate-900/80 px-4 py-3">
      <p className="text-[11px] uppercase tracking-wide text-slate-500">{label}</p>
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
      <div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">{provider.label}</span>
          <StatusPill status={provider.status} />
        </div>
        <p className="mt-1 text-xs text-slate-300">{provider.description}</p>
        {provider.hint && <p className="mt-1 text-[11px] text-slate-500">{provider.hint}</p>}
        {provider.accountName && (
          <p className="mt-2 text-[11px] text-emerald-300">
            Connected as <span className="font-medium">{provider.accountName}</span>
          </p>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {!isConnected && (
          <button
            type="button"
            onClick={onConnect}
            disabled={busy}
            className="rounded-full bg-blue-500 px-3 py-1.5 text-xs font-medium text-slate-50 hover:bg-blue-400 disabled:opacity-60"
          >
            {busy ? `Opening ${provider.name}…` : `Connect ${provider.name}`}
          </button>
        )}

        {isConnected && (
          <>
            <button
              type="button"
              onClick={onTest}
              className="rounded-full border border-emerald-500/70 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-100 hover:bg-emerald-500/20"
            >
              Refresh status
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
    default:
      text = "Not connected";
      color = "bg-slate-800 text-slate-300 border-slate-600";
  }

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${color}`}
    >
      {text}
    </span>
  );
}
