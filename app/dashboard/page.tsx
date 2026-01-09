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

type Mode = "now" | "schedule";

const ALL_CHANNELS: { id: ChannelId; label: string; color: string }[] = [
  { id: "facebook", label: "Facebook Page", color: "bg-[#1877F2]" },
  { id: "linkedin", label: "LinkedIn", color: "bg-sky-500" },
  { id: "instagram", label: "Instagram", color: "bg-pink-500" },
  { id: "threads", label: "Threads", color: "bg-white" },
];

export default function DashboardHomePage() {
  const [message, setMessage] = useState(
    "Quick check-in from Root Health Ops Dashboard ✅"
  );
  const [imageUrl, setImageUrl] = useState("");
  const [mode, setMode] = useState<Mode>("now");
  const [scheduledAt, setScheduledAt] = useState("");

  const [isPosting, setIsPosting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<QuickBlastResult[] | null>(null);

  // 🔑 CONNECTED CHANNELS — SOURCE OF TRUTH
  const [connected, setConnected] = useState<Record<ChannelId, boolean>>({
    facebook: false,
    linkedin: false,
    instagram: false,
    threads: false,
    tiktok: false,
    reddit: false,
  });

  // Selected channels (UI)
  const [selected, setSelected] = useState<Record<ChannelId, boolean>>({
    facebook: true,
    linkedin: false,
    instagram: false,
    threads: false,
    tiktok: false,
    reddit: false,
  });

  const organisationId = "23a054db-7040-40b1-b193-2f43cfa139de";

  // 🔌 LOAD CONNECTED CHANNELS
  useEffect(() => {
    fetch("/api/social-accounts")
      .then((r) => r.json())
      .then((data) => {
        const rows =
          data?.data || data?.accounts || data?.socialAccounts || data || [];

        const next = { ...connected };

        for (const r of rows) {
          const p = String(r.platform || "").toLowerCase();
          if (p.includes("facebook")) next.facebook = true;
          if (p.includes("linkedin")) next.linkedin = true;
          if (p.includes("instagram")) next.instagram = true;
          if (p.includes("threads")) next.threads = true;
          if (p.includes("tiktok")) next.tiktok = true;
          if (p.includes("reddit")) next.reddit = true;
        }

        setConnected(next);
      })
      .catch(() => {
        // fail open — do not hide UI
      });
  }, []);

  const selectedChannels = useMemo(
    () =>
      (Object.keys(selected) as ChannelId[]).filter(
        (c) => selected[c] && connected[c]
      ),
    [selected, connected]
  );

  const toggle = (c: ChannelId) =>
    setSelected((s) => ({ ...s, [c]: !s[c] }));

  const handleSend = async () => {
    setIsPosting(true);
    setError(null);
    setStatus(null);
    setResults(null);

    try {
      if (!message.trim()) throw new Error("Message is required.");
      if (selectedChannels.length === 0)
        throw new Error("Select at least one connected channel.");

      const out: QuickBlastResult[] = [];

      for (const channel of selectedChannels) {
        const res = await fetch("/api/social/quick-blast", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            channel,
            message,
            imageUrl,
            organisationId,
          }),
        });

        const data = await res.json().catch(() => ({}));

        if (!res.ok || data?.success === false) {
          out.push({
            channel,
            ok: false,
            error: data?.error || "Failed",
            details: data?.details,
            sent: data?.sent,
          });
        } else {
          out.push({ channel, ok: true, sent: data?.sent });
        }
      }

      setResults(out);

      const ok = out.filter((r) => r.ok).map((r) => r.channel);
      if (!ok.length)
        throw new Error("All channels failed — see details below.");

      setStatus(`Sent via ${ok.join(", ")}`);
    } catch (e: any) {
      setError(e.message || "Quick Blast failed.");
    } finally {
      setIsPosting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6">
      <h1 className="text-2xl font-semibold mb-4">
        Root Health Ops Dashboard
      </h1>

      <div className="max-w-3xl space-y-4">
        <textarea
          className="w-full rounded-xl bg-slate-900 border border-slate-700 p-3"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />

        <input
          type="url"
          placeholder="Image URL (optional)"
          className="w-full rounded-xl bg-slate-900 border border-slate-700 p-2"
          value={imageUrl}
          onChange={(e) => setImageUrl(e.target.value)}
        />

        <div className="flex flex-wrap gap-2">
          {ALL_CHANNELS.map((c) => (
            <button
              key={c.id}
              disabled={!connected[c.id]}
              onClick={() => toggle(c.id)}
              className={`px-3 py-1.5 rounded-full border text-xs flex items-center gap-1
                ${
                  selected[c.id] && connected[c.id]
                    ? "border-emerald-500 bg-emerald-500/10"
                    : "border-slate-600 bg-slate-900"
                }
                ${!connected[c.id] ? "opacity-40 cursor-not-allowed" : ""}
              `}
            >
              <span className={`h-2 w-2 rounded-full ${c.color}`} />
              {c.label}
              {!connected[c.id] && " (not connected)"}
            </button>
          ))}
        </div>

        <button
          onClick={handleSend}
          disabled={isPosting}
          className="rounded-full bg-emerald-500 px-5 py-2 text-slate-950 font-semibold"
        >
          {isPosting ? "Sending…" : "Send Quick Blast"}
        </button>

        {status && <div className="text-emerald-400">{status}</div>}
        {error && <div className="text-red-400">{error}</div>}

        {results && (
          <div className="text-xs bg-slate-900 border border-slate-700 rounded-xl p-3 space-y-1">
            {results.map((r) => (
              <div key={r.channel}>
                {r.ok ? "✓" : "⚠"} {r.channel}
                {!r.ok && (
                  <pre className="whitespace-pre-wrap text-red-300">
{JSON.stringify({ error: r.error, details: r.details, sent: r.sent }, null, 2)}
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
