"use client";

import { useEffect, useState } from "react";

type ConnKey = "linkedin" | "instagram" | "facebook" | "google" | "stripe";

type Conn = {
  key: ConnKey;
  name: string;
  description: string;
  docs?: string;
  comingSoon?: boolean;
};

const PROVIDERS: Conn[] = [
  {
    key: "linkedin",
    name: "LinkedIn",
    description:
      "Post updates, read comments on your posts, pull basic analytics.",
  },
  {
    key: "instagram",
    name: "Instagram",
    description:
      "Schedule posts via Instagram Business (through Meta). Analytics coming soon.",
    comingSoon: true,
  },
  {
    key: "facebook",
    name: "Facebook",
    description:
      "Post to your Page and fetch comments for reply tracking (Meta Graph).",
    comingSoon: true,
  },
  {
    key: "google",
    name: "Google",
    description:
      "Google Ads & Calendar (for discovery calls). Use budget + goal to auto-plan ads.",
    comingSoon: true,
  },
  {
    key: "stripe",
    name: "Stripe",
    description:
      "Billing & plans. Track MRR and take payments for your coaching programs.",
    comingSoon: true,
  },
];

export default function ConnectAccountsPage() {
  const [status, setStatus] = useState<Record<ConnKey, boolean>>({
    linkedin: false,
    instagram: false,
    facebook: false,
    google: false,
    stripe: false,
  });
  const [modalOpen, setModalOpen] = useState<ConnKey | null>(null);
  const [busy, setBusy] = useState<ConnKey | null>(null);

  // hydrate from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem("rootops_connections");
      if (raw) setStatus(JSON.parse(raw));
    } catch {}
  }, []);

  function persist(next: Record<ConnKey, boolean>) {
    setStatus(next);
    try {
      localStorage.setItem("rootops_connections", JSON.stringify(next));
    } catch {}
  }

  function connect(key: ConnKey) {
    // For now, simulate OAuth → later we’ll redirect to /api/auth/{provider}
    setBusy(key);
    setTimeout(() => {
      const next = { ...status, [key]: true };
      persist(next);
      setBusy(null);
      setModalOpen(null);
    }, 900);
  }

  function disconnect(key: ConnKey) {
    const next = { ...status, [key]: false };
    persist(next);
  }

  // pretty helpers
  function badge(connected: boolean) {
    return connected ? (
      <span className="text-[10px] px-2 py-1 rounded-full uppercase tracking-wide bg-emerald-500/20 text-emerald-100 border border-emerald-500/30">
        Connected
      </span>
    ) : (
      <span className="text-[10px] px-2 py-1 rounded-full uppercase tracking-wide bg-slate-500/20 text-slate-100 border border-slate-500/30">
        Not connected
      </span>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-900 text-slate-50 p-6">
      <header className="flex items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Connect Accounts</h1>
          <p className="text-slate-300 text-sm mt-1">
            Hook up the services you use. We’ll automate posting, listening, and analytics.
          </p>
        </div>
        <a
          href="/dashboard"
          className="px-3 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-sm border border-white/10"
        >
          ← Back to Dashboard
        </a>
      </header>

      {/* summary strip */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        <div className="backdrop-blur-lg bg-white/5 border border-white/10 rounded-2xl p-4 shadow-xl">
          <p className="text-xs uppercase text-slate-300 mb-1">Status</p>
          <p className="text-lg">
            {Object.values(status).filter(Boolean).length} / {Object.keys(status).length} connected
          </p>
        </div>
        <div className="backdrop-blur-lg bg-white/5 border border-white/10 rounded-2xl p-4 shadow-xl">
          <p className="text-xs uppercase text-slate-300 mb-1">Recommended</p>
          <p className="text-lg">Start with LinkedIn → posting & replies</p>
        </div>
        <div className="backdrop-blur-lg bg-white/5 border border-white/10 rounded-2xl p-4 shadow-xl">
          <p className="text-xs uppercase text-slate-300 mb-1">Next</p>
          <p className="text-lg">Enable Google (ads) & Stripe (billing)</p>
        </div>
      </section>

      {/* provider cards */}
      <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {PROVIDERS.map((p) => {
          const connected = status[p.key];
          return (
            <div
              key={p.key}
              className="backdrop-blur-lg bg-white/5 border border-white/10 rounded-2xl p-5 shadow-xl flex flex-col gap-3"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-base font-semibold">{p.name}</span>
                  {badge(connected)}
                </div>
                {p.comingSoon ? (
                  <span className="text-[10px] px-2 py-1 rounded-full uppercase tracking-wide bg-indigo-500/20 text-indigo-100 border border-indigo-500/30">
                    Coming soon
                  </span>
                ) : null}
              </div>

              <p className="text-sm text-slate-300">{p.description}</p>

              <div className="flex gap-2 mt-1">
                {!connected ? (
                  <button
                    disabled={!!p.comingSoon}
                    onClick={() => setModalOpen(p.key)}
                    className={`text-sm px-3 py-2 rounded-lg ${
                      p.comingSoon
                        ? "bg-white/10 text-slate-400 cursor-not-allowed"
                        : "bg-fuchsia-500 text-slate-50 hover:bg-fuchsia-400"
                    }`}
                  >
                    {p.comingSoon ? "Unavailable" : `Connect ${p.name}`}
                  </button>
                ) : (
                  <>
                    <button
                      onClick={() => disconnect(p.key)}
                      className="text-sm px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20"
                    >
                      Disconnect
                    </button>
                    {/* Example quick test: log a test item to Airtable via your existing /api/reply */}
                    {p.key === "linkedin" ? (
                      <button
                        onClick={async () => {
                          try {
                            const res = await fetch("/api/reply", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                "message body":
                                  "✅ LinkedIn connection test from Connect Wizard",
                                Platform: "LinkedIn",
                                direction: "outbound",
                                status: "to_post",
                              }),
                            });
                            if (res.ok) alert("Test logged to Airtable.");
                            else alert("Failed to log test.");
                          } catch {
                            alert("Network error.");
                          }
                        }}
                        className="text-sm px-3 py-2 rounded-lg bg-emerald-500 text-slate-950 hover:bg-emerald-400"
                      >
                        Post a test to queue
                      </button>
                    ) : null}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </section>

      {/* modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setModalOpen(null)}
          />
          <div className="relative w-full max-w-lg backdrop-blur-xl bg-white/10 border border-white/20 rounded-2xl p-5 shadow-2xl space-y-4">
            <h3 className="text-xl font-semibold">Connect {PROVIDERS.find((p) => p.key === modalOpen)?.name}</h3>
            <p className="text-sm text-slate-200">
              This is the quick setup. Click “Continue” to simulate a connection now. Later, this button
              will redirect to a secure OAuth flow (e.g. LinkedIn → grant permission → back here).
            </p>

            {modalOpen === "linkedin" ? (
              <ul className="list-disc list-inside text-sm text-slate-200 space-y-1">
                <li>Allows posting from your dashboard</li>
                <li>Lets us fetch comments on your posts for reply tracking</li>
                <li>Stores only tokens needed for posting & analytics (never your password)</li>
              </ul>
            ) : null}

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setModalOpen(null)}
                className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-sm"
              >
                Cancel
              </button>
              <button
                onClick={() => connect(modalOpen)}
                disabled={busy === modalOpen}
                className="px-3 py-2 rounded-lg bg-fuchsia-500 text-slate-50 hover:bg-fuchsia-400 text-sm"
              >
                {busy === modalOpen ? "Connecting…" : "Continue"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
