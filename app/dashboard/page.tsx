// app/dashboard/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";

type ChannelId =
  | "facebook"
  | "linkedin"
  | "instagram"
  | "threads"
  | "tiktok"
  | "reddit";

const ALL_CHANNELS: { id: ChannelId; label: string; dotClass: string }[] = [
  { id: "facebook", label: "Facebook Page", dotClass: "bg-[#1877F2]" },
  { id: "linkedin", label: "LinkedIn", dotClass: "bg-sky-500" },
  { id: "instagram", label: "Instagram", dotClass: "bg-pink-500" },
  { id: "threads", label: "Threads", dotClass: "bg-white" },
];

function safeJson(v: any) {
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

function detectConnectedPlatformsFromSocialAccountsPayload(payload: any) {
  const connected: Record<ChannelId, boolean> = {
    facebook: false,
    linkedin: false,
    instagram: false,
    threads: false,
    tiktok: false,
    reddit: false,
  };

  const rows = Array.isArray(payload?.socialAccounts)
    ? payload.socialAccounts
    : Array.isArray(payload?.data)
    ? payload.data
    : Array.isArray(payload)
    ? payload
    : [];

  for (const r of rows) {
    if (!r || typeof r !== "object") continue;
    if (r.is_active === false) continue;

    const p = String(r.platform || "").toLowerCase();
    if (p === "facebook") connected.facebook = true;
    if (p === "linkedin") connected.linkedin = true;
    if (p === "instagram") connected.instagram = true;
    if (p === "threads") connected.threads = true;
    if (p === "tiktok") connected.tiktok = true;
    if (p === "reddit") connected.reddit = true;
  }

  return connected;
}

export default function DashboardHomePage() {
  const [message, setMessage] = useState(
    "Quick check-in from Root Health Ops Dashboard ✅"
  );
  const [imageUrl, setImageUrl] = useState("");

  const [isPosting, setIsPosting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // raw response + connected + orgId from /api/social-accounts
  const [rawSocialAccounts, setRawSocialAccounts] = useState<any>(null);
  const [connectedHint, setConnectedHint] = useState<string>("Loading…");
  const [connected, setConnected] = useState<Record<ChannelId, boolean>>({
    facebook: false,
    linkedin: false,
    instagram: false,
    threads: false,
    tiktok: false,
    reddit: false,
  });
  const [organisationId, setOrganisationId] = useState<string | null>(null);

  // Selected channels
  const [selected, setSelected] = useState<Record<ChannelId, boolean>>({
    facebook: true,
    linkedin: false,
    instagram: false,
    threads: false,
    tiktok: false,
    reddit: false,
  });

  // Result payload from /api/social/quick-blast (one call)
  const [lastResponse, setLastResponse] = useState<any>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const res = await fetch("/api/social-accounts", { method: "GET" });
        const data = await res.json().catch(() => null);

        if (cancelled) return;

        setRawSocialAccounts(data);
        setConnectedHint(res.ok ? "Loaded from /api/social-accounts" : `HTTP ${res.status}`);
        setOrganisationId(typeof data?.organisationId === "string" ? data.organisationId : null);
        setConnected(detectConnectedPlatformsFromSocialAccountsPayload(data));
      } catch (e: any) {
        if (cancelled) return;
        setConnectedHint(e?.message || "Failed to load /api/social-accounts");
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedChannels = useMemo(() => {
    return (Object.keys(selected) as ChannelId[]).filter(
      (c) => selected[c] && connected[c]
    );
  }, [selected, connected]);

  const toggle = (c: ChannelId) => {
    setSelected((s) => ({ ...s, [c]: !s[c] }));
  };

  const handleSend = async () => {
    setIsPosting(true);
    setError(null);
    setStatus(null);
    setLastResponse(null);

    try {
      const trimmed = message.trim();
      if (!trimmed) throw new Error("Message is required.");

      if (!organisationId) {
        throw new Error(
          "No organisationId returned from /api/social-accounts. Cannot post."
        );
      }

      if (selectedChannels.length === 0) {
        const detected = Object.entries(connected)
          .filter(([, v]) => v)
          .map(([k]) => k)
          .join(", ");
        throw new Error(
          `Select at least one connected channel.\n\nDetected connected: ${
            detected || "(none)"
          }`
        );
      }

      // ✅ IMPORTANT: send PLATFORMS ARRAY (backend expects this)
      const res = await fetch("/api/social/quick-blast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: trimmed,
          platforms: selectedChannels,
          imageUrl,
          organisationId,
        }),
      });

      const data = await res.json().catch(() => ({}));
      setLastResponse(data);

      if (!res.ok || data?.success === false) {
        const msg =
          data?.error ||
          data?.message ||
          `Quick Blast failed (HTTP ${res.status})`;
        throw new Error(msg);
      }

      // If backend returns a "sent" list or details, keep it visible.
      setStatus(`Quick Blast submitted for: ${selectedChannels.join(", ")}`);
    } catch (e: any) {
      setError(e?.message || "Quick Blast failed.");
    } finally {
      setIsPosting(false);
    }
  };

  const detectedConnectedList = Object.entries(connected)
    .filter(([, v]) => v)
    .map(([k]) => k)
    .join(", ");

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6">
      <h1 className="text-2xl font-semibold mb-4">Root Health Ops Dashboard</h1>

      <div className="max-w-3xl mb-4 rounded-2xl border border-slate-700 bg-slate-900/70 p-4">
        <div className="text-[11px] uppercase tracking-wide text-slate-400">
          Connected platforms (from /api/social-accounts)
        </div>
        <div className="text-xs text-slate-300 mt-1">{connectedHint}</div>

        <div className="text-xs text-slate-200 mt-2">
          Detected connected:{" "}
          <span className="text-slate-50 font-medium">
            {detectedConnectedList || "(none detected)"}
          </span>
        </div>

        <div className="text-xs text-slate-200 mt-2">
          organisationId used for Quick Blast:{" "}
          <span className="text-slate-50 font-medium">
            {organisationId || "(missing)"}
          </span>
        </div>

        <details className="mt-3">
          <summary className="text-xs text-slate-400 cursor-pointer">
            Show raw /api/social-accounts response
          </summary>
          <pre className="mt-2 text-[10px] whitespace-pre-wrap bg-black/40 border border-slate-800 rounded-xl p-2 max-h-[260px] overflow-auto text-slate-300">
            {safeJson(rawSocialAccounts)}
          </pre>
        </details>
      </div>

      <div className="max-w-3xl space-y-4">
        <textarea
          className="w-full rounded-xl bg-slate-900 border border-slate-700 p-3 min-h-[140px]"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Write your Quick Blast message…"
        />

        <input
          type="url"
          placeholder="Image URL (optional)"
          className="w-full rounded-xl bg-slate-900 border border-slate-700 p-2"
          value={imageUrl}
          onChange={(e) => setImageUrl(e.target.value)}
        />

        <div className="space-y-2">
          <div className="text-sm font-medium text-slate-200">Channels</div>

          <div className="flex flex-wrap gap-2">
            {ALL_CHANNELS.map((c) => {
              const isConnected = connected[c.id];
              const isSelected = selected[c.id];

              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => toggle(c.id)}
                  className={[
                    "px-3 py-1.5 rounded-full border text-xs flex items-center gap-1 transition",
                    isSelected
                      ? "border-emerald-500 bg-emerald-500/10 text-emerald-100"
                      : "border-slate-600 bg-slate-900 text-slate-300 hover:border-slate-500",
                  ].join(" ")}
                >
                  <span className={["h-2 w-2 rounded-full", c.dotClass].join(" ")} />
                  {c.label}
                  {!isConnected && (
                    <span className="ml-1 text-[10px] text-amber-300">
                      (not connected)
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="text-[11px] text-slate-500">
            Quick Blast sends one request with <code>platforms: [...]</code> (array) to match the backend.
          </div>
        </div>

        <button
          onClick={handleSend}
          disabled={isPosting}
          className="rounded-full bg-emerald-500 px-5 py-2 text-slate-950 font-semibold disabled:opacity-60"
        >
          {isPosting ? "Sending…" : "Send Quick Blast"}
        </button>

        {status && <div className="text-emerald-400 text-sm">{status}</div>}
        {error && (
          <div className="text-red-400 text-sm whitespace-pre-wrap">{error}</div>
        )}

        {lastResponse && (
          <div className="text-xs bg-slate-900 border border-slate-700 rounded-xl p-3 space-y-2">
            <div className="text-[11px] uppercase tracking-wide text-slate-400">
              API response (/api/social/quick-blast)
            </div>
            <pre className="whitespace-pre-wrap text-[10px] text-slate-200 bg-black/30 border border-slate-800 rounded-lg p-2 overflow-auto">
{safeJson(lastResponse)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
