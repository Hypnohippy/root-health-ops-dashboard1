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

/**
 * Robustly detect "connected" platforms from ANY reasonable response shape.
 * We do NOT assume a schema. We look for:
 * - arrays of rows containing `platform` (or similar)
 * - objects containing booleans like { linkedin: true }
 * - nested shapes
 * - string occurrences like "instagram_business" / "linkedin_company" etc.
 */
function detectConnectedPlatforms(payload: any): {
  connected: Record<ChannelId, boolean>;
  sourceHint: string;
} {
  const connected: Record<ChannelId, boolean> = {
    facebook: false,
    linkedin: false,
    instagram: false,
    threads: false,
    tiktok: false,
    reddit: false,
  };

  const markFromString = (s: string) => {
    const v = s.toLowerCase();
    if (v.includes("facebook")) connected.facebook = true;
    if (v.includes("linkedin")) connected.linkedin = true;
    if (v.includes("instagram")) connected.instagram = true;
    if (v.includes("threads")) connected.threads = true;
    if (v.includes("tiktok")) connected.tiktok = true;
    if (v.includes("reddit")) connected.reddit = true;
  };

  // Common shapes first
  const candidates: any[] = [];

  if (Array.isArray(payload)) candidates.push(payload);
  if (Array.isArray(payload?.data)) candidates.push(payload.data);
  if (Array.isArray(payload?.accounts)) candidates.push(payload.accounts);
  if (Array.isArray(payload?.socialAccounts)) candidates.push(payload.socialAccounts);
  if (Array.isArray(payload?.social_accounts)) candidates.push(payload.social_accounts);
  if (Array.isArray(payload?.platforms)) candidates.push(payload.platforms);

  // Boolean-map shapes (very common)
  const boolMaps = [
    payload?.connected,
    payload?.connections,
    payload?.status,
    payload?.platformStatus,
    payload?.platformsConnected,
  ].filter(Boolean);

  for (const bm of boolMaps) {
    if (bm && typeof bm === "object") {
      for (const key of Object.keys(bm)) {
        const val = (bm as any)[key];
        if (val === true) markFromString(key);
        if (typeof val === "string") markFromString(val);
      }
    }
  }

  // Row-array shapes
  for (const arr of candidates) {
    if (!Array.isArray(arr)) continue;

    for (const row of arr) {
      // If it's a string list like ["facebook","instagram_business"]
      if (typeof row === "string") {
        markFromString(row);
        continue;
      }

      if (!row || typeof row !== "object") continue;

      // Respect is_active if present, otherwise treat as connected record
      if (row?.is_active === false) continue;

      // Most likely field names
      const fields = [
        row.platform,
        row.platform_name,
        row.platformName,
        row.channel,
        row.provider,
        row.network,
        row.name,
        row.account_name,
      ].filter(Boolean);

      for (const f of fields) {
        if (typeof f === "string") markFromString(f);
      }
    }
  }

  // Deep scan fallback: walk the object and collect keys/strings
  const seen = new Set<any>();
  const walk = (node: any) => {
    if (!node) return;
    if (seen.has(node)) return;
    if (typeof node === "string") {
      markFromString(node);
      return;
    }
    if (typeof node !== "object") return;

    seen.add(node);

    for (const [k, v] of Object.entries(node)) {
      markFromString(String(k));
      if (typeof v === "string") markFromString(v);
      else walk(v);
    }
  };

  walk(payload);

  const any =
    connected.facebook ||
    connected.linkedin ||
    connected.instagram ||
    connected.threads ||
    connected.tiktok ||
    connected.reddit;

  return {
    connected,
    sourceHint: any ? "Detected from /api/social-accounts payload" : "No platforms detected in payload",
  };
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

  // Connected state derived from /api/social-accounts (robust detection)
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

  // Selected channels (UI)
  const [selected, setSelected] = useState<Record<ChannelId, boolean>>({
    facebook: true,
    linkedin: false,
    instagram: false,
    threads: false,
    tiktok: false,
    reddit: false,
  });

  // single-tenant beta org
  const organisationId = "23a054db-7040-40b1-b193-2f43cfa139de";

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const res = await fetch("/api/social-accounts", { method: "GET" });
        const data = await res.json().catch(() => null);

        if (cancelled) return;

        setRawSocialAccounts(data);

        const detected = detectConnectedPlatforms(data);
        setConnected(detected.connected);
        setConnectedHint(
          res.ok
            ? detected.sourceHint
            : `HTTP ${res.status} from /api/social-accounts`
        );
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
    // allow toggling even if disconnected so user can see intent,
    // but we will block sending unless connected[c] is true
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

      // Guard: only send to channels we believe are connected
      if (selectedChannels.length === 0) {
        // Give a helpful message with current connected flags
        throw new Error(
          `No connected channels selected.\n\nDetected connected: ${Object.entries(
            connected
          )
            .filter(([, v]) => v)
            .map(([k]) => k)
            .join(", ") || "(none)"}`
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
            organisationId,
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
      if (!ok.length) {
        throw new Error("All selected channels failed — see details below.");
      }

      setStatus(`Sent via ${ok.join(", ")}`);
    } catch (e: any) {
      setError(e?.message || "Quick Blast failed.");
    } finally {
      setIsPosting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6">
      <h1 className="text-2xl font-semibold mb-4">Root Health Ops Dashboard</h1>

      <div className="max-w-3xl space-y-4">
        <div className="rounded-2xl border border-slate-700 bg-slate-900/70 p-4">
          <div className="text-[11px] uppercase tracking-wide text-slate-400">
            Connected platforms (from /api/social-accounts)
          </div>
          <div className="text-xs text-slate-200 mt-1">{connectedHint}</div>
          <div className="text-xs text-slate-400 mt-2">
            Detected connected:{" "}
            <span className="text-slate-100">
              {Object.entries(connected)
                .filter(([, v]) => v)
                .map(([k]) => k)
                .join(", ") || "(none detected)"}
            </span>
          </div>

          {/* Keep this small and helpful; remove later once stable */}
          <details className="mt-3">
            <summary className="text-xs text-slate-400 cursor-pointer">
              Show raw /api/social-accounts response
            </summary>
            <pre className="mt-2 text-[10px] whitespace-pre-wrap bg-black/40 border border-slate-800 rounded-xl p-2 max-h-[260px] overflow-auto text-slate-300">
              {safeJson(rawSocialAccounts)}
            </pre>
          </details>
        </div>

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
                      not connected
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <div className="text-[11px] text-slate-500">
            Quick Blast will only send to channels detected as connected from /api/social-accounts.
            If something is posting elsewhere (e.g. Stories) but shows not connected here, expand the raw response above — it will reveal the mismatch.
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
