// app/dashboard/page.tsx
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
  connection_type?: string | null;
};

type QuickBlastResult = {
  success: boolean;
  organisationId?: string;
  results?: any[];
  summary?: {
    attempted: number;
    ok: number;
    failed: number;
  };
  error?: string;
};

const PROVIDER_LABELS: Record<ProviderId, string> = {
  facebook: "Facebook Page",
  instagram: "Instagram",
  linkedin: "LinkedIn",
  threads: "Threads",
  tiktok: "TikTok",
  google: "Google Business Profile",
  email: "Email",
  whatsapp: "WhatsApp",
};

const DRAFTS_KEY = "rootops_quickblast_drafts_v1";

type Draft = {
  id: string;
  savedAt: number;
  message: string;
  imageUrl: string;
  selectedPlatforms: ProviderId[];
};

function loadDrafts(): Draft[] {
  try {
    const raw = localStorage.getItem(DRAFTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

function saveDrafts(drafts: Draft[]) {
  try {
    localStorage.setItem(DRAFTS_KEY, JSON.stringify(drafts.slice(0, 50)));
  } catch {}
}

export default function DashboardHomePage() {
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [socialAccounts, setSocialAccounts] = useState<SocialAccountRow[]>([]);

  const [message, setMessage] = useState(
    "Quick check-in from Root Health Ops Dashboard ✅"
  );
  const [imageUrl, setImageUrl] = useState("");
  const [selected, setSelected] = useState<ProviderId[]>([]);

  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<QuickBlastResult | null>(null);

  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [adminOpen, setAdminOpen] = useState(false);

  const connectedPlatforms = useMemo(() => {
    const active = (socialAccounts || []).filter((r) => {
      // treat missing is_active as active (older rows)
      return r.is_active !== false;
    });
    return new Set(active.map((r) => r.platform));
  }, [socialAccounts]);

  const connectedCount = useMemo(() => connectedPlatforms.size, [connectedPlatforms]);

  const charCount = message.length;

  const lengthHint = useMemo(() => {
    if (charCount === 0) return "Write something";
    if (charCount <= 120) return "Great length";
    if (charCount <= 240) return "A bit long (still OK)";
    return "Very long — consider shortening";
  }, [charCount]);

  function togglePlatform(p: ProviderId) {
    setSelected((prev) => {
      if (prev.includes(p)) return prev.filter((x) => x !== p);
      return [...prev, p];
    });
  }

  async function loadSocialAccounts() {
    setLoadingAccounts(true);
    try {
      const res = await fetch("/api/social-accounts", { cache: "no-store" });
      const data = await res.json().catch(() => null);
      const rows: SocialAccountRow[] = data?.socialAccounts ?? [];
      setSocialAccounts(rows);
    } catch (e) {
      console.error("[dashboard] loadSocialAccounts failed", e);
      setSocialAccounts([]);
    } finally {
      setLoadingAccounts(false);
    }
  }

  function refreshChannels() {
    void loadSocialAccounts();
  }

  function saveForLater() {
    const d: Draft = {
      id: crypto.randomUUID(),
      savedAt: Date.now(),
      message: message,
      imageUrl: imageUrl,
      selectedPlatforms: selected,
    };
    const next = [d, ...drafts];
    setDrafts(next);
    saveDrafts(next);
  }

  function restoreDraft(d: Draft) {
    setMessage(d.message || "");
    setImageUrl(d.imageUrl || "");
    setSelected(Array.isArray(d.selectedPlatforms) ? d.selectedPlatforms : []);
  }

  function deleteDraft(id: string) {
    const next = drafts.filter((d) => d.id !== id);
    setDrafts(next);
    saveDrafts(next);
  }

  async function sendQuickBlast() {
    setSending(true);
    setResult(null);

    try {
      const res = await fetch("/api/social/quick-blast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          imageUrl,
          platforms: selected,
        }),
      });

      const json = await res.json().catch(() => null);

      if (!res.ok) {
        setResult({
          success: false,
          error: json?.error || `Request failed (${res.status})`,
        });
        return;
      }

      setResult(json);
    } catch (e: any) {
      setResult({ success: false, error: e?.message || "Send failed" });
    } finally {
      setSending(false);
    }
  }

  useEffect(() => {
    void loadSocialAccounts();
    setDrafts(loadDrafts());
  }, []);

  // Auto-select connected channels if none selected yet
  useEffect(() => {
    if (selected.length > 0) return;
    const defaults = socialAccounts
      .map((r) => r.platform)
      .filter((p) => connectedPlatforms.has(p));
    if (defaults.length > 0) setSelected(defaults);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingAccounts, socialAccounts]);

  const channelCards: ProviderId[] = [
    "facebook",
    "linkedin",
    "instagram",
    "threads",
    "tiktok",
    "google",
    "email",
    "whatsapp",
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 px-4 py-10">
      <div className="mx-auto w-full max-w-6xl">
        <div className="rounded-3xl border border-slate-700 bg-slate-900/70 p-6 md:p-10 shadow-xl backdrop-blur">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
            <div>
              <div className="text-xs text-slate-400">Root Health Ops</div>
              <h1 className="mt-1 text-2xl md:text-3xl font-semibold">
                Enterprise Beta
              </h1>
              <p className="mt-2 text-sm text-slate-300 max-w-2xl">
                A calm, premium cockpit for social momentum. Send fast. Recover cleanly. Keep going.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-700 bg-slate-900/80 px-4 py-3 text-xs text-slate-300">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-slate-400">Connected:</div>
                  <div className="text-lg font-semibold text-slate-100">
                    {loadingAccounts ? "…" : connectedCount}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={refreshChannels}
                  className="rounded-xl border border-slate-600 bg-slate-950 px-3 py-2 text-xs text-slate-200 hover:border-slate-500"
                >
                  Refresh
                </button>
              </div>
              <div className="mt-2 text-slate-500">
                Loaded from connections
              </div>
            </div>
          </div>

          <div className="mt-8 grid gap-6 lg:grid-cols-3">
            {/* Quick Blast Card */}
            <div className="lg:col-span-2 rounded-3xl border border-slate-700 bg-slate-900/80 p-5 md:p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold">Quick Blast</h2>
                  <p className="mt-1 text-sm text-slate-300">
                    Write once, choose channels, send.
                  </p>
                </div>
                <div className="text-right text-xs text-slate-400">
                  <div>{charCount} chars</div>
                  <div className="mt-1 text-slate-300">{lengthHint}</div>
                </div>
              </div>

              <div className="mt-5 space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300">
                    Message
                  </label>
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    rows={4}
                    className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                    placeholder="Write a quick update…"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300">
                    Image (optional)
                  </label>
                  <input
                    value={imageUrl}
                    onChange={(e) => setImageUrl(e.target.value)}
                    className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                    placeholder="Paste a direct image URL (JPG/PNG)…"
                  />
                  <div className="mt-1 text-[11px] text-slate-500">
                    (We’ll add upload later — URL is fine for now.)
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-medium text-slate-300">
                      Channels
                    </label>
                    <button
                      type="button"
                      onClick={refreshChannels}
                      className="text-[11px] text-slate-400 hover:text-slate-300"
                    >
                      Refresh
                    </button>
                  </div>

                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {channelCards.map((p) => {
                      const isConnected = connectedPlatforms.has(p);
                      const isSelected = selected.includes(p);

                      return (
                        <button
                          key={p}
                          type="button"
                          onClick={() => togglePlatform(p)}
                          disabled={!isConnected}
                          className={`flex items-center justify-between rounded-2xl border px-3 py-3 text-left text-sm transition ${
                            !isConnected
                              ? "border-slate-800 bg-slate-950/40 text-slate-600 cursor-not-allowed"
                              : isSelected
                                ? "border-emerald-500/60 bg-emerald-500/10 text-slate-100"
                                : "border-slate-700 bg-slate-950 text-slate-200 hover:border-slate-600"
                          }`}
                        >
                          <div>
                            <div className="font-medium">{PROVIDER_LABELS[p]}</div>
                            <div className="text-[11px] text-slate-500">
                              {isConnected ? "connected" : "not connected"}
                            </div>
                          </div>
                          <div
                            className={`text-[11px] px-2 py-1 rounded-full border ${
                              !isConnected
                                ? "border-slate-800 text-slate-600"
                                : isSelected
                                  ? "border-emerald-500/60 text-emerald-200"
                                  : "border-slate-600 text-slate-300"
                            }`}
                          >
                            {isSelected ? "Selected" : "Select"}
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  <div className="mt-2 text-[11px] text-slate-500">
                    Only connected channels will actually send.
                  </div>
                </div>

                <div className="flex flex-wrap gap-3 pt-2">
                  <button
                    type="button"
                    onClick={sendQuickBlast}
                    disabled={sending || message.trim().length === 0 || selected.length === 0}
                    className="rounded-2xl bg-emerald-500 px-5 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-60"
                  >
                    {sending ? "Sending…" : "Send Quick Blast"}
                  </button>

                  <button
                    type="button"
                    onClick={saveForLater}
                    className="rounded-2xl border border-slate-600 bg-slate-950 px-5 py-2 text-sm text-slate-200 hover:border-slate-500"
                  >
                    Save for later
                  </button>

                  <button
                    type="button"
                    onClick={() => setAdminOpen((v) => !v)}
                    className="rounded-2xl border border-slate-700 bg-slate-900/80 px-5 py-2 text-sm text-slate-200 hover:border-slate-600"
                  >
                    Admin view
                  </button>
                </div>

                {result && (
                  <div className="mt-4 rounded-2xl border border-slate-700 bg-slate-950 p-4 text-sm">
                    {result.success ? (
                      <div className="text-emerald-200">
                        Sent. {result.summary ? `OK: ${result.summary.ok}, Failed: ${result.summary.failed}` : ""}
                      </div>
                    ) : (
                      <div className="text-red-200">
                        Failed: {result.error || "Unknown error"}
                      </div>
                    )}

                    <details className="mt-2">
                      <summary className="cursor-pointer text-xs text-slate-400 hover:text-slate-300">
                        Show details (redacted)
                      </summary>
                      <pre className="mt-2 max-h-64 overflow-auto rounded-xl border border-slate-800 bg-slate-950 p-3 text-[11px] text-slate-200">
{JSON.stringify(result, null, 2)}
                      </pre>
                    </details>
                  </div>
                )}

                {adminOpen && (
                  <div className="mt-4 rounded-2xl border border-slate-700 bg-slate-950 p-4 text-xs text-slate-300">
                    <div className="text-slate-400 mb-2">Safe technical details (redacted).</div>
                    <div>Selected platforms: {selected.join(", ") || "(none)"}</div>
                    <div className="mt-1">
                      Connected platforms: {Array.from(connectedPlatforms).join(", ") || "(none)"}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Drafts */}
            <div className="rounded-3xl border border-slate-700 bg-slate-900/80 p-5 md:p-6">
              <h3 className="text-base font-semibold">Saved drafts</h3>
              <p className="mt-1 text-sm text-slate-300">
                Drafts are stored on this device. (Later we can sync per org.)
              </p>
              <p className="mt-2 text-[11px] text-slate-500">
                Use “Save for later” and we’ll restore the full draft library
              </p>

              <div className="mt-4 space-y-3">
                {drafts.length === 0 ? (
                  <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4 text-sm text-slate-400">
                    No drafts yet.
                  </div>
                ) : (
                  drafts.map((d) => (
                    <div
                      key={d.id}
                      className="rounded-2xl border border-slate-800 bg-slate-950 p-4"
                    >
                      <div className="text-[11px] text-slate-500">
                        {new Date(d.savedAt).toLocaleString()}
                      </div>
                      <div className="mt-1 text-sm text-slate-200 line-clamp-3">
                        {d.message || "(empty)"}
                      </div>
                      <div className="mt-2 text-[11px] text-slate-500">
                        Channels: {d.selectedPlatforms?.join(", ") || "(none)"}
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => restoreDraft(d)}
                          className="rounded-xl bg-slate-900 px-3 py-1.5 text-xs text-slate-100 hover:bg-slate-800"
                        >
                          Restore
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteDraft(d.id)}
                          className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-slate-200 hover:border-red-500 hover:text-red-200"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="mt-8 text-xs text-slate-500">
            No response yet — send a Quick Blast to see details here.
          </div>
        </div>
      </div>
    </div>
  );
}
