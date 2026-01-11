// app/dashboard/scheduled/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";

type ChannelId =
  | "facebook"
  | "linkedin"
  | "instagram"
  | "threads"
  | "tiktok"
  | "reddit";

type ScheduledPost = {
  id: string;
  organisation_id: string;
  message: string;
  platforms: string[];
  image_url?: string | null;
  scheduled_for: string;
  status: string;
  created_at?: string;
  meta?: any;
};

const CHANNELS: { id: ChannelId; label: string; dotClass: string }[] = [
  { id: "facebook", label: "Facebook Page", dotClass: "bg-[#1877F2]" },
  { id: "linkedin", label: "LinkedIn", dotClass: "bg-sky-500" },
  { id: "instagram", label: "Instagram", dotClass: "bg-pink-500" },
  { id: "threads", label: "Threads", dotClass: "bg-white" },
  { id: "tiktok", label: "TikTok", dotClass: "bg-slate-200" },
  { id: "reddit", label: "Reddit", dotClass: "bg-orange-400" },
];

const DEFAULT_SELECTED: Record<ChannelId, boolean> = {
  facebook: true,
  linkedin: false,
  instagram: false,
  threads: false,
  tiktok: false,
  reddit: false,
};

function detectConnectedPlatforms(payload: any) {
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
    if ((r as any).is_active === false) continue;

    const p = String((r as any).platform || "").toLowerCase();
    if (p === "facebook") connected.facebook = true;
    if (p === "linkedin") connected.linkedin = true;
    if (p === "instagram") connected.instagram = true;
    if (p === "threads") connected.threads = true;
    if (p === "tiktok") connected.tiktok = true;
    if (p === "reddit") connected.reddit = true;
  }

  return connected;
}

function toLocalInputValue(d: Date) {
  // yyyy-MM-ddTHH:mm (local)
  const pad = (n: number) => String(n).padStart(2, "0");
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const min = pad(d.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
}

function prettyPlatforms(list: any) {
  if (!Array.isArray(list) || list.length === 0) return "(none)";
  return list.map((x) => String(x)).join(", ");
}

export default function ScheduledPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<ScheduledPost[]>([]);

  // Connections / org
  const [connectedHint, setConnectedHint] = useState<string>("Loading connections…");
  const [rawSocialAccounts, setRawSocialAccounts] = useState<any>(null);
  const [organisationId, setOrganisationId] = useState<string | null>(null);

  const [connected, setConnected] = useState<Record<ChannelId, boolean>>({
    facebook: false,
    linkedin: false,
    instagram: false,
    threads: false,
    tiktok: false,
    reddit: false,
  });

  // Composer
  const [message, setMessage] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [scheduledForLocal, setScheduledForLocal] = useState<string>(() => {
    const d = new Date(Date.now() + 60 * 60 * 1000); // +1 hour
    return toLocalInputValue(d);
  });
  const [selected, setSelected] = useState<Record<ChannelId, boolean>>({
    ...DEFAULT_SELECTED,
  });

  const connectedCount = useMemo(
    () => Object.values(connected).filter(Boolean).length,
    [connected]
  );

  const selectedChannels = useMemo(() => {
    return (Object.keys(selected) as ChannelId[]).filter(
      (c) => selected[c] && connected[c]
    );
  }, [selected, connected]);

  const refreshConnections = async () => {
    try {
      const res = await fetch("/api/social-accounts", { method: "GET" });
      const data = await res.json().catch(() => null);

      setRawSocialAccounts(data);
      setConnectedHint(res.ok ? "Loaded from connections" : `HTTP ${res.status}`);

      setOrganisationId(
        typeof data?.organisationId === "string" ? data.organisationId : null
      );

      setConnected(detectConnectedPlatforms(data));
    } catch (e: any) {
      setConnectedHint(e?.message || "Failed to load connections");
    }
  };

  const loadScheduled = async (orgId: string) => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/schedule/list?organisationId=${encodeURIComponent(orgId)}`,
        { cache: "no-store" }
      );

      const data: any = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(
          data?.error || `Failed to load scheduled posts (HTTP ${res.status}).`
        );
      }

      const items = Array.isArray(data?.items) ? data.items : [];
      setRows(items);
    } catch (e: any) {
      setError(e?.message || "Could not load scheduled posts.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;

    const boot = async () => {
      await refreshConnections();

      // After refreshConnections, organisationId state may not be set yet (async).
      // So we read from the response again by calling /api/social-accounts once more safely.
      // This keeps behaviour deterministic for non-coders.
      try {
        const res = await fetch("/api/social-accounts", { method: "GET" });
        const data = await res.json().catch(() => null);
        const orgId =
          typeof data?.organisationId === "string" ? data.organisationId : null;

        if (!cancelled) {
          setRawSocialAccounts(data);
          setOrganisationId(orgId);
          setConnected(detectConnectedPlatforms(data));
          setConnectedHint(res.ok ? "Loaded from connections" : `HTTP ${res.status}`);
        }

        if (orgId && !cancelled) {
          await loadScheduled(orgId);
        } else if (!cancelled) {
          setLoading(false);
          setError("Workspace not loaded yet. Please refresh connections.");
        }
      } catch (e: any) {
        if (!cancelled) {
          setLoading(false);
          setError(e?.message || "Workspace not loaded yet.");
        }
      }
    };

    void boot();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const upcoming = useMemo(() => {
    const now = Date.now();
    return rows
      .filter((r) => new Date(r.scheduled_for).getTime() >= now)
      .sort(
        (a, b) =>
          new Date(a.scheduled_for).getTime() - new Date(b.scheduled_for).getTime()
      );
  }, [rows]);

  const past = useMemo(() => {
    const now = Date.now();
    return rows
      .filter((r) => new Date(r.scheduled_for).getTime() < now)
      .sort(
        (a, b) =>
          new Date(b.scheduled_for).getTime() - new Date(a.scheduled_for).getTime()
      );
  }, [rows]);

  const toggle = (c: ChannelId) => {
    setSelected((s) => ({ ...s, [c]: !s[c] }));
  };

  const schedulePost = async () => {
    setSaving(true);
    setError(null);

    try {
      const trimmed = message.trim();
      if (!trimmed) throw new Error("Message is required.");
      if (!organisationId) throw new Error("Workspace not loaded yet. Refresh connections.");
      if (selectedChannels.length === 0) {
        throw new Error(
          "Select at least one connected channel.\n\n" +
            `Detected connected: ${Object.entries(connected)
              .filter(([, v]) => v)
              .map(([k]) => k)
              .join(", ") || "(none)"}`
        );
      }

      const when = new Date(scheduledForLocal);
      if (Number.isNaN(when.getTime())) {
        throw new Error("Scheduled time is invalid. Please pick a valid date/time.");
      }

      const payload: any = {
        organisationId,
        message: trimmed,
        platforms: selectedChannels,
        imageUrl: imageUrl.trim() || null,
        scheduledFor: when.toISOString(),
        // also include snake_case to be compatible with older handlers
        scheduled_for: when.toISOString(),
        image_url: imageUrl.trim() || null,
      };

      // Assumption: you already have /api/schedule/create to insert into scheduled_posts.
      // If it returns an error, we show it cleanly.
      const res = await fetch("/api/schedule/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || data?.success === false) {
        throw new Error(
          data?.error ||
            data?.message ||
            `Failed to schedule post (HTTP ${res.status}).`
        );
      }

      // Reset composer (keep channels as-is for speed)
      setMessage("");
      setImageUrl("");

      // Reload list
      await loadScheduled(organisationId);
    } catch (e: any) {
      setError(e?.message || "Could not schedule post.");
    } finally {
      setSaving(false);
    }
  };

  const GlassCard = ({
    children,
    className = "",
  }: {
    children: React.ReactNode;
    className?: string;
  }) => (
    <div
      className={[
        "rounded-3xl border border-white/10 bg-white/5 shadow-[0_20px_60px_rgba(0,0,0,0.35)] backdrop-blur-xl",
        className,
      ].join(" ")}
    >
      {children}
    </div>
  );

  const Pill = ({
    children,
    tone = "neutral",
  }: {
    children: React.ReactNode;
    tone?: "neutral" | "good" | "warn";
  }) => {
    const cls =
      tone === "good"
        ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-100"
        : tone === "warn"
        ? "border-amber-400/30 bg-amber-400/10 text-amber-100"
        : "border-white/10 bg-white/5 text-slate-200";
    return (
      <span
        className={[
          "inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-semibold",
          cls,
        ].join(" ")}
      >
        {children}
      </span>
    );
  };

  const PrimaryBtn = ({
    children,
    onClick,
    disabled,
  }: {
    children: React.ReactNode;
    onClick: () => void;
    disabled?: boolean;
  }) => (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center justify-center rounded-2xl bg-emerald-500 px-5 py-3 text-sm font-semibold text-slate-950 shadow-[0_12px_30px_rgba(16,185,129,0.25)] hover:bg-emerald-400 disabled:opacity-60 disabled:cursor-not-allowed transition"
    >
      {children}
    </button>
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/2 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-emerald-500/10 blur-3xl" />
        <div className="absolute top-40 -left-40 h-[420px] w-[420px] rounded-full bg-sky-500/10 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-[520px] w-[520px] rounded-full bg-pink-500/10 blur-3xl" />
      </div>

      <div className="relative mx-auto w-full max-w-6xl px-4 py-10 space-y-8">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">
              Scheduled
            </h1>
            <p className="mt-2 text-sm text-slate-300 max-w-2xl">
              Queue posts into Supabase (scheduled_posts) with the same platform selector behaviour as Quick Blast.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Pill>
              Connected:{" "}
              <span className="ml-1 text-slate-50 font-semibold">
                {connectedCount}
              </span>
            </Pill>
            <Pill>{connectedHint}</Pill>
            <Pill tone={organisationId ? "good" : "warn"}>
              {organisationId ? "Workspace loaded" : "Workspace not loaded"}
            </Pill>
          </div>
        </div>

        {/* Composer */}
        <GlassCard className="p-6 md:p-7">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold">Schedule a post</h2>
              <p className="mt-1 text-xs text-slate-300">
                Same channel picker rules as Quick Blast: select channels, only connected channels send.
              </p>
            </div>
            <button
              type="button"
              onClick={async () => {
                await refreshConnections();
                if (organisationId) await loadScheduled(organisationId);
              }}
              className="text-xs text-slate-300 hover:text-slate-50"
            >
              Refresh
            </button>
          </div>

          <div className="mt-5 grid gap-5 lg:grid-cols-2">
            <div>
              <label className="text-[11px] uppercase tracking-wide text-slate-400">
                Message
              </label>
              <textarea
                className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-50 placeholder:text-slate-500 outline-none focus:border-emerald-400/50 focus:ring-1 focus:ring-emerald-400/30 min-h-[140px]"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Write your scheduled post…"
              />
            </div>

            <div className="space-y-5">
              <div>
                <label className="text-[11px] uppercase tracking-wide text-slate-400">
                  Scheduled time
                </label>
                <input
                  type="datetime-local"
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-50 outline-none focus:border-emerald-400/50 focus:ring-1 focus:ring-emerald-400/30"
                  value={scheduledForLocal}
                  onChange={(e) => setScheduledForLocal(e.target.value)}
                />
                <div className="mt-2 text-[11px] text-slate-400">
                  Uses your local time and saves in UTC.
                </div>
              </div>

              <div>
                <label className="text-[11px] uppercase tracking-wide text-slate-400">
                  Image URL (optional)
                </label>
                <input
                  type="url"
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-50 placeholder:text-slate-500 outline-none focus:border-emerald-400/50 focus:ring-1 focus:ring-emerald-400/30"
                  placeholder="Paste a direct image URL (JPG/PNG)…"
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="mt-6">
            <div className="flex items-center justify-between gap-3">
              <label className="text-[11px] uppercase tracking-wide text-slate-400">
                Channels
              </label>
              <div className="text-[11px] text-slate-400">
                Selected (connected):{" "}
                <span className="text-slate-200 font-semibold">
                  {selectedChannels.length}
                </span>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {CHANNELS.map((c) => {
                const isConnected = connected[c.id];
                const isSelected = selected[c.id];

                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => toggle(c.id)}
                    className={[
                      "group inline-flex items-center gap-2 rounded-2xl border px-4 py-2 text-xs font-semibold transition",
                      isSelected
                        ? "border-emerald-400/50 bg-emerald-400/10 text-emerald-50"
                        : "border-white/10 bg-white/5 text-slate-200 hover:bg-white/10",
                    ].join(" ")}
                  >
                    <span
                      className={[
                        "h-2 w-2 rounded-full",
                        c.dotClass,
                        "shadow-[0_0_0_4px_rgba(255,255,255,0.06)]",
                      ].join(" ")}
                    />
                    <span>{c.label}</span>
                    {!isConnected ? (
                      <span className="ml-1 text-[10px] text-amber-200">
                        not connected
                      </span>
                    ) : (
                      <span className="ml-1 text-[10px] text-slate-400">
                        connected
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="mt-3 text-[11px] text-slate-400">
              Only connected channels will be scheduled for dispatch.
            </div>
          </div>

          <div className="mt-6 flex flex-col sm:flex-row gap-3">
            <PrimaryBtn
              onClick={schedulePost}
              disabled={
                saving ||
                !organisationId ||
                message.trim().length === 0 ||
                selectedChannels.length === 0
              }
            >
              {saving ? "Scheduling…" : "Schedule post"}
            </PrimaryBtn>

            <button
              type="button"
              onClick={() => {
                setMessage("");
                setImageUrl("");
              }}
              disabled={saving}
              className="inline-flex items-center justify-center rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-slate-100 hover:bg-white/10 disabled:opacity-60 disabled:cursor-not-allowed transition"
            >
              Clear
            </button>
          </div>

          {error && (
            <div className="mt-5 rounded-2xl border border-red-500/40 bg-red-950/40 p-4 text-sm text-red-200 whitespace-pre-wrap">
              {error}
            </div>
          )}
        </GlassCard>

        {/* List */}
        <div className="grid gap-6 lg:grid-cols-2">
          <section className="rounded-3xl border border-slate-700 bg-slate-900/80 p-5 space-y-3">
            <h2 className="text-base font-semibold">Upcoming</h2>

            {loading && (
              <div className="rounded-2xl border border-slate-700 bg-slate-950/60 p-4 text-sm text-slate-300">
                Loading scheduled posts…
              </div>
            )}

            {!loading && upcoming.length === 0 ? (
              <p className="text-sm text-slate-400">No upcoming posts.</p>
            ) : (
              <div className="space-y-3">
                {upcoming.map((p) => (
                  <div
                    key={p.id}
                    className="rounded-2xl border border-slate-700 bg-slate-950/60 p-3"
                  >
                    <div className="text-[11px] text-slate-400">
                      {new Date(p.scheduled_for).toLocaleString()} ·{" "}
                      <span className="text-slate-200">
                        {prettyPlatforms(p.platforms)}
                      </span>
                    </div>
                    <div className="mt-2 text-sm whitespace-pre-wrap">{p.message}</div>
                    <div className="mt-2 text-[11px] text-slate-500">
                      status: {p.status}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-3xl border border-slate-700 bg-slate-900/80 p-5 space-y-3">
            <h2 className="text-base font-semibold">Past</h2>

            {loading && (
              <div className="rounded-2xl border border-slate-700 bg-slate-950/60 p-4 text-sm text-slate-300">
                Loading scheduled posts…
              </div>
            )}

            {!loading && past.length === 0 ? (
              <p className="text-sm text-slate-400">No past posts.</p>
            ) : (
              <div className="space-y-3">
                {past.slice(0, 25).map((p) => (
                  <div
                    key={p.id}
                    className="rounded-2xl border border-slate-700 bg-slate-950/60 p-3"
                  >
                    <div className="text-[11px] text-slate-400">
                      {new Date(p.scheduled_for).toLocaleString()} ·{" "}
                      <span className="text-slate-200">
                        {prettyPlatforms(p.platforms)}
                      </span>
                    </div>
                    <div className="mt-2 text-sm whitespace-pre-wrap">{p.message}</div>
                    <div className="mt-2 text-[11px] text-slate-500">
                      status: {p.status}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Connections debug (safe) */}
        <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-base font-semibold">Connections (for reference)</div>
              <div className="mt-1 text-xs text-slate-300">
                Helps validate platform visibility without touching OAuth.
              </div>
            </div>
            <Pill tone={organisationId ? "good" : "warn"}>
              Org: {organisationId ? organisationId : "none"}
            </Pill>
          </div>

          <details className="mt-4">
            <summary className="cursor-pointer text-sm text-slate-200 hover:text-slate-50">
              Show connections payload
            </summary>
            <pre className="mt-3 max-h-[320px] overflow-auto rounded-2xl border border-white/10 bg-black/30 p-4 text-[10px] text-slate-200 whitespace-pre-wrap">
              {JSON.stringify(rawSocialAccounts, null, 2)}
            </pre>
          </details>
        </div>
      </div>
    </div>
  );
}
