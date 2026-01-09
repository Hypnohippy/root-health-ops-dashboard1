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

type QuickBlastResult = {
  channel: ChannelId;
  ok: boolean;
  error?: string;
  details?: any;
  sent?: any;
};

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

  // Your payload shape (confirmed):
  // { organisationId, socialAccounts: [{ platform, is_active, ... }]}
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
  const [results, setResults] = useState<QuickBlastResult[] | null>(null);

  const [connected, setConnected] = useState<Record<ChannelId, boolean>>({
    facebook: false,
    linkedin: false,
    instagram: false,
    threads: false,
    tiktok: false,
    reddit: false,
  });

  const [connectedHint, setConnectedHint] = useState<string>("Loading…");
  const [rawSocialAccounts, setRawSocialAccounts] = useState<any>(null);

  // ✅ SOURCE OF TRUTH orgId (from /api/social-accounts)
  const [organisationId, setOrganisationId] = useState<string | null>(null);

  // Selected channels (UI)
  const [selected, setSelected] = useState<Record<ChannelId, boolean>>({
    facebook: true,
    linkedin: false,
    instagram: false,
    threads: false,
    tiktok: false,
    reddit: false,
  });

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const res = await fetch("/api/social-accounts", { method: "GET" });
        const data = await res.json().catch(() => null);

        if (cancelled) return;

        setRawSocialAccounts(data);

        if (!res.ok) {
          setConnectedHint(`HTTP ${res.status} from /api/social-accounts`);
        } else {
          setConnectedHint("Loaded from /api/social-accounts");
        }

        // ✅ Set orgId from payload if present
        const orgIdFromPayload =
          typeof data?.organisationId === "string" ? data.organisationId : null;

        setOrganisationId(orgIdFromPayload);

        // ✅ Detect connected platforms using your confirmed payload shape
        const detected = detectConnectedPlatformsFromSocialAccountsPayload(data);
        setConnected(detected);
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
    setResults(null);

    try {
      const trimmed = message.trim();
      if (!trimmed) throw new Error("Message is required.");

      if (!organisationId) {
        throw new Error(
          "No organisationId returned from /api/social-accounts. This must be fixed before posting."
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

      const out: QuickBlastResult[] = [];

      for (const channel of selectedChannels) {
        const res = await fetch("/api/social/quick-blast", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            channel,
            message: trimmed,
            imageUrl,
            organisationId, // ✅ now correct org
          }),
        });

        const data = await res.json().catch(() => ({}));

        if (!res.ok || data?.success === false) {
          out.push({
            channel,
            ok: false,
            error: data?.error || data?.message || `HTTP ${res.status}`,
            details: data?.details,
            sent: data?.sent,
          });
        } else {
          out.push({
            channel,
            ok: true,
            sent: data?.sent,
          });
        }
      }

      setResults(out);

      const ok = out.filter((r) => r.ok).map((r) => r.channel);
      if (!ok.length) throw new Error("All selected channels failed — see details below.");

      setStatus(`Sent via ${ok.join(", ")}`);
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
            {organisationId || "(missing from /api/social-accounts)"}
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
                  <span
                    className={["h-2 w-2 rounded-full", c.dotClass].join(" ")}
                  />
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
            Quick Blast sends only to channels detected as connected from
            /api/social-accounts.
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

        {results && (
          <div className="text-xs bg-slate-900 border border-slate-700 rounded-xl p-3 space-y-2">
            <div className="text-[11px] uppercase tracking-wide text-slate-400">
              Results (Ayrshare response surfaced)
            </div>
            {results.map((r) => (
              <div
                key={r.channel}
                className="rounded-lg border border-slate-800 bg-slate-950/60 p-2"
              >
                <div className={r.ok ? "text-emerald-300" : "text-amber-300"}>
                  {r.ok ? "✓" : "⚠"} {r.channel}
                </div>

                {!r.ok && (
                  <pre className="mt-2 whitespace-pre-wrap text-[10px] text-slate-200 bg-black/30 border border-slate-800 rounded-lg p-2 overflow-auto">
{safeJson({ error: r.error, details: r.details, sent: r.sent })}
                  </pre>
                )}

                {r.ok && r.sent != null && (
                  <pre className="mt-2 whitespace-pre-wrap text-[10px] text-slate-200 bg-black/30 border border-slate-800 rounded-lg p-2 overflow-auto">
{safeJson({ sent: r.sent })}
                  </pre>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
