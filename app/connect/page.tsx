// app/connect/page.tsx
"use client";

import React, { useState, useEffect } from "react";

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

// For now, Facebook "Connect" is not a real OAuth URL, so we show a message instead of 404.
const connectUrls: Record<ProviderId, string> = {
  facebook: "#",
  instagram: "/api/oauth/instagram/start",
  tiktok: "/api/oauth/tiktok/start",
  linkedin: "/api/oauth/linkedin/start",
  google: "/api/oauth/google/start",
  email: "/connect/email/setup",
  whatsapp: "/api/oauth/whatsapp/start",
};

type SocialAccountRow = {
  platform: ProviderId;
  page_id: string | null;
  page_name: string | null;
};

export default function ConnectPage() {
  const [providers, setProviders] = useState<Provider[]>(initialProviders);
  const [busyProvider, setBusyProvider] = useState<ProviderId | null>(null);

  // Facebook Test Post + Root Coach state
  const [testMessage, setTestMessage] = useState(
    "This is a test post from Root Health Ops Dashboard ✅"
  );
  const [testIsLoading, setTestIsLoading] = useState(false);
  const [testStatus, setTestStatus] = useState<string | null>(null);
  const [testError, setTestError] = useState<string | null>(null);
  const [coachMessage, setCoachMessage] = useState<string | null>(null);

  // 🔹 Helper: load social_accounts from the backend and sync providers
  const loadSocialAccounts = async () => {
    try {
      const res = await fetch("/api/social-accounts");
      if (!res.ok) {
        return;
      }
      const data = await res.json();
      const rows: SocialAccountRow[] = data.socialAccounts ?? [];

      setProviders((prev) =>
        prev.map((p) => {
          const row = rows.find((r) => r.platform === p.id);
          if (!row) return p;

          return {
            ...p,
            status: "connected" as ConnectionStatus,
            accountName: row.page_name ?? p.accountName,
          };
        })
      );
    } catch (err) {
      console.error("[connect] failed to load social accounts", err);
    }
  };

  // 🔹 Initial load of social_accounts
  useEffect(() => {
    void loadSocialAccounts();
  }, []);

  const saveSocialAccount = async (
    providerId: ProviderId,
    pageId?: string,
    pageName?: string
  ) => {
    try {
      await fetch("/api/social-accounts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          platform: providerId,
          pageId: pageId ?? null,
          pageName: pageName ?? null,
        }),
      });
    } catch (err) {
      console.error("[connect] failed to save social account", err);
    }
  };

  const deleteSocialAccount = async (providerId: ProviderId) => {
    try {
      await fetch("/api/social-accounts", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          platform: providerId,
        }),
      });
    } catch (err) {
      console.error("[connect] failed to delete social account", err);
    }
  };

  const handleConnectClick = (provider: Provider) => {
    const url = connectUrls[provider.id];

    if (!url || url === "#") {
      alert(
        `We’ll soon add a one-click auth flow for ${provider.label}.\n\nFor now, use the Facebook Test Post panel below to verify your connection.`
      );
      return;
    }

    setBusyProvider(provider.id);
    window.location.href = url;
  };

  const handleDisconnectClick = (provider: Provider) => {
    if (
      !confirm(
        `Disconnect ${provider.label}? Root Health will stop posting to it.`
      )
    ) {
      return;
    }

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
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: testMessage,
        }),
      });

      let data: any = null;
      try {
        data = await res.json();
      } catch (err) {
        throw new Error(
          "Server did not return valid JSON. Check the /api/facebook-test-post route."
        );
      }

      if (!res.ok) {
        throw new Error(data.error || "Failed to send test post");
      }

      setTestStatus("Test post sent successfully to Facebook via Make 🎉");

      // Mark Facebook as connected locally
      const now = new Date().toISOString();

      setProviders((prev) =>
        prev.map((p) =>
          p.id === "facebook"
            ? {
                ...p,
                status: "connected" as ConnectionStatus,
                lastSync: now,
                accountName: p.accountName ?? "Your Facebook Page",
              }
            : p
        )
      );

      // Persist to social_accounts and then reload from Supabase
      await saveSocialAccount("facebook", undefined, "Your Facebook Page");
      await loadSocialAccounts();
    } catch (err: any) {
      const message =
        err?.message || "Something went wrong sending the test post.";
      setTestError(message);

      fetch("/api/ai/root-coach", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          context: "facebook_test_post",
          errorMessage: message,
          userAction:
            "Clicked Test connection / Facebook Test Post in app/connect/page.tsx",
        }),
      })
        .then((res) => res.json())
        .then((data) => {
          if (data && data.coachMessage) {
            setCoachMessage(data.coachMessage);
          }
        })
        .catch(() => {});
    } finally {
      setTestIsLoading(false);
    }
  };

  const handleTestClick = (provider: Provider) => {
    if (provider.id === "facebook") {
      void sendFacebookTestPost();
      return;
    }

    alert(`We’ll add a real connection test for ${provider.label} here later.`);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-6xl bg-slate-900/70 border border-slate-700 rounded-3xl shadow-xl p-6 md:p-10 backdrop-blur">
        {/* Header */}
