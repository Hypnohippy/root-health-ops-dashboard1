// app/dashboard/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";

/**
 * Root Health Ops — Quick Blast (Build-safe, enterprise UX)
 * - Premium cockpit UI
 * - Connected channel detection from /api/social-accounts
 * - Sends selected platforms to /api/social/quick-blast
 * - Quota-aware outcome (429 / code 106)
 * - Local drafts (safe, simple)
 * - Redacted admin view + Root Coach panel
 */

type ChannelId =
  | "facebook"
  | "linkedin"
  | "instagram"
  | "threads"
  | "tiktok"
  | "reddit";

type OutcomeTone = "good" | "warn" | "bad" | "neutral";

type OutcomeCard = {
  tone: OutcomeTone;
  title: string;
  body: string;
  meta?: string;
};

type DraftItem = {
  id: string;
  title: string;
  message: string;
  imageUrl: string;
  selected: Record<ChannelId, boolean>;
  savedAt: string;
  pinned: boolean;
};

type CoachOption = {
  label: string;
  action: "save_for_later" | "refresh_connections";
};

const DRAFTS_KEY = "rh_ops_quick_blast_drafts_v3";
const MAX_DRAFTS = 25;

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

function safeJson(v: any) {
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

function redactVendorsDeep(input: any) {
  const vendorRegex = /ayrshare/gi;
  const makeRegex = /make(\.com)?/gi;
  const pricingRegex = /https?:\/\/[^\s"]*pricing[^\s"]*/gi;
  const docsRegex = /https?:\/\/[^\s"]*docs[^\s"]*/gi;

  const walk = (v: any): any => {
    if (v == null) return v;

    if (typeof v === "string") {
      return v
        .replace(vendorRegex, "Social posting service")
        .replace(makeRegex, "Social posting service")
        .replace(pricingRegex, "[link hidden]")
        .replace(docsRegex, "[link hidden]");
    }

    if (Array.isArray(v)) return v.map(walk);

    if (typeof v === "object") {
      const out: any = {};
      for (const [k, val] of Object.entries(v)) {
        const safeKey = String(k).replace(vendorRegex, "service");
        out[safeKey] = walk(val);
      }
      return out;
    }

    return v;
  };

  return walk(input);
}

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

function quotaMessage(payload: any): string | null {
  const status = payload?.status;
  const code = payload?.details?.code;
  const msg = String(payload?.details?.message || "").toLowerCase();

  if (status === 429 || code === 106 || msg.includes("quota")) {
    return (
      "Posting is paused for this workspace right now.\n\n" +
      "It looks like you have hit your monthly API quota.\n\n" +
      "Your draft is safe. Save it for later, then send as soon as quota resets or the plan changes."
    );
  }
  return null;
}

function formatDraftTitle(msg: string) {
  const t = (msg || "").trim().replace(/\s+/g, " ");
  if (!t) return "Untitled draft";
  return t.length > 56 ? t.slice(0, 56) + "…" : t;
}

function createDraftId() {
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function niceDate(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function toneStyles(tone: OutcomeTone) {
  switch (tone) {
    case "good":
      return "border-emerald-300/20 bg-emerald-300/10 text-emerald-50";
    case "warn":
      return "border-amber-300/20 bg-amber-300/10 text-amber-50";
    case "bad":
      return "border-red-300/20 bg-red-300/10 text-red-100";
    default:
      return "border-white/10 bg-white/5 text-slate-100";
  }
}

function parseCoachMessage(input: string | null): { body: string; options: CoachOption[] } {
  const raw = (input || "").trim();
  if (!raw) return { body: "", options: [] };

  // Keep it simple and safe:
  // If coach mentions save -> save
  // If coach mentions refresh -> refresh
  const lower = raw.toLowerCase();
  const options: CoachOption[] = [];

  if (lower.includes("save")) {
    options.push({ label: "Save for later", action: "save_for_later" });
  }
  options.push({ label: "Refresh connections", action: "refresh_connections" });

  return { body: raw, options: options.slice(0, 2) };
}

export default function DashboardHomePage() {
  const [message, setMessage] = useState("Quick check-in from Root Health Ops Dashboard ✅");
  const [imageUrl, setImageUrl] = useState("");

  const [isPosting, setIsPosting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [celebration, setCelebration] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [outcome, setOutcome] = useState<OutcomeCard | null>(null);

  const [rawSocialAccounts, setRawSocialAccounts] = useState<any>(null);
  const [connectedHint, setConnectedHint] = useState<string>("Loading…");
  const [organisationId, setOrganisationId] = useState<string | null>(null);

  const [connected, setConnected] = useState<Record<ChannelId, boolean>>({
    facebook: false,
    linkedin: false,
    instagram: false,
    threads: false,
    tiktok: false,
    reddit: false,
  });

  const [selected, setSelected] = useState<Record<ChannelId, boolean>>({ ...DEFAULT_SELECTED });

  const [lastResponse, setLastResponse] = useState<any>(null);
  const [coachMessage, setCoachMessage] = useState<string | null>(null);

  const [drafts, setDrafts] = useState<DraftItem[]>([]);
  const [draftsOpen, setDraftsOpen] = useState(false);
  const [draftSearch, setDraftSearch] = useState("");

  const detectedConnectedList = useMemo(() => {
    return Object.entries(connected)
      .filter(([, v]) => v)
      .map(([k]) => k)
      .join(", ");
  }, [connected]);

  const connectedCount = useMemo(() => Object.values(connected).filter(Boolean).length, [connected]);

  const selectedChannels = useMemo(() => {
    return (Object.keys(selected) as ChannelId[]).filter((c) => selected[c] && connected[c]);
  }, [selected, connected]);

  const quota = useMemo(() => quotaMessage(lastResponse), [lastResponse]);
  const quotaLocked = Boolean(quota);

  useEffect(() => {
    if (!celebration) return;
    const t = setTimeout(() => setCelebration(null), 6500);
    return () => clearTimeout(t);
  }, [celebration]);

  const refreshConnections = async () => {
    try {
      const res = await fetch("/api/social-accounts", { method: "GET" });
      const data = await res.json().catch(() => null);

      setRawSocialAccounts(data);
      setConnectedHint(res.ok ? "Loaded from connections" : `HTTP ${res.status}`);

      setOrganisationId(typeof data?.organisationId === "string" ? data.organisationId : null);
      setConnected(detectConnectedPlatforms(data));
    } catch (e: any) {
      setConnectedHint(e?.message || "Failed to load connections");
    }
  };

  const loadDrafts = () => {
    try {
      const raw = localStorage.getItem(DRAFTS_KEY);
      if (!raw) {
        setDrafts([]);
        return;
      }
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        setDrafts([]);
        return;
      }
      const cleaned: DraftItem[] = parsed
        .map((d: any) => {
          const id = String(d?.id || "").trim();
          if (!id) return null;

          const title = String(d?.title || "").trim() || formatDraftTitle(String(d?.message || ""));
          const savedAt = String(d?.savedAt || new Date().toISOString());
          const pinned = Boolean(d?.pinned);

          const sel = typeof d?.selected === "object" && d.selected ? d.selected : {};
          const selectedFixed: Record<ChannelId, boolean> = {
            ...DEFAULT_SELECTED,
            ...(sel as any),
          };

          return {
            id,
            title,
            message: String(d?.message || ""),
            imageUrl: String(d?.imageUrl || ""),
            selected: selectedFixed,
            savedAt,
            pinned,
          };
        })
        .filter(Boolean) as DraftItem[];

      setDrafts(cleaned);
      localStorage.setItem(DRAFTS_KEY, JSON.stringify(cleaned));
    } catch {
      setDrafts([]);
    }
  };

  const saveDrafts = (next: DraftItem[]) => {
    setDrafts(next);
    try {
      localStorage.setItem(DRAFTS_KEY, JSON.stringify(next));
    } catch {}
  };

  useEffect(() => {
    void refreshConnections();
    loadDrafts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleChannel = (c: ChannelId) => setSelected((s) => ({ ...s, [c]: !s[c] }));

  const saveDraft = (reason: string) => {
    const item: DraftItem = {
      id: createDraftId(),
      title: formatDraftTitle(message),
      message,
      imageUrl,
      selected,
      savedAt: new Date().toISOString(),
      pinned: false,
    };

    const next = [item, ...drafts].slice(0, MAX_DRAFTS);
    saveDrafts(next);

    setDraftsOpen(true);
    setStatus("Saved for later — your draft is safe.");
    setError(null);
    setOutcome({
      tone: "good",
      title: "Saved for later",
      body: "Your draft is safely stored on this device. Load it anytime and send when you're ready.",
      meta: reason ? `Saved (${reason}).` : "Saved.",
    });

    // IMPORTANT: This must always be a complete, valid string.
    setCelebration("Saved. You're still in control.");
  };

  const loadDraft = (id: string) => {
    const d = drafts.find((x) => x.id === id);
    if (!d) return;

    setMessage(d.message);
    setImageUrl(d.imageUrl);
    setSelected(d.selected);

    setStatus("Draft loaded.");
    setError(null);
    setOutcome({
      tone: "good",
      title: "Draft loaded",
      body: "You're back in control — tweak it, then send when ready.",
    });
  };

  const deleteDraft = (id: string) => {
    const ok = confirm("Delete this saved draft from this device?");
    if (!ok) return;
    const next = drafts.filter((d) => d.id !== id);
    saveDrafts(next);
  };

  const togglePin = (id: string) => {
    const next = drafts.map((d) => (d.id === id ? { ...d, pinned: !d.pinned } : d));
    saveDrafts(next);
  };

  const sortedFilteredDrafts = useMemo(() => {
    const q = draftSearch.trim().toLowerCase();
    const filtered = !q
      ? drafts
      : drafts.filter((d) => `${d.title} ${d.message}`.toLowerCase().includes(q));

    const sorted = [...filtered].sort((a, b) => {
      const ap = a.pinned ? 1 : 0;
      const bp = b.pinned ? 1 : 0;
      if (bp !== ap) return bp - ap;
      return new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime();
    });

    return sorted;
  }, [drafts, draftSearch]);

  const callRootCoach = async (payload: any) => {
    try {
      const res = await fetch("/api/ai/root-coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => null);
      if (data?.coachMessage) setCoachMessage(String(data.coachMessage));
    } catch {}
  };

  const postQuickBlast = async (platforms: ChannelId[]) => {
    const trimmed = message.trim();
    if (!trimmed) throw new Error("Message is required.");
    if (!organisationId) throw new Error("Workspace not loaded yet. Refresh and try again.");
    if (!platforms.length) throw new Error("Select at least one connected channel.");

    const res = await fetch("/api/social/quick-blast", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: trimmed,
        platforms,
        imageUrl: imageUrl.trim() || null,
        organisationId,
      }),
    });

    const data = await res.json().catch(() => ({}));
    setLastResponse(data);

    const q = quotaMessage(data);
    if (!res.ok || data?.success === false) {
      if (q) {
        setOutcome({
          tone: "warn",
          title: "Monthly quota reached",
          body: q,
          meta: "Save the draft now. Send instantly when quota resets or the plan changes.",
        });
        setError(q);
        void callRootCoach({
          context: "quota_limit_reached",
          userAction: `Quick Blast blocked by quota: ${platforms.join(", ")}`,
          errorMessage: q,
          outcome: "failed",
        });
        throw new Error(q);
      }

      const msg = String(data?.error || data?.message || "Posting failed.").trim() || "Posting failed.";
      setOutcome({
        tone: "bad",
        title: "Not posted yet",
        body: msg,
        meta: "Save for later, or refresh connections and try again.",
      });
      setError(msg);

      void callRootCoach({
        context: "quick_blast_failed",
        userAction: `Quick Blast attempted: ${platforms.join(", ")}`,
        errorMessage: msg,
        outcome: "failed",
      });

      throw new Error(msg);
    }

    setError(null);
    setStatus(`Posted successfully to: ${platforms.join(", ")}`);
    setOutcome({
      tone: "good",
      title: "Posted",
      body: `Your message was sent to: ${platforms.join(", ")}.`,
      meta: "Nice — keep the streak going.",
    });

    void callRootCoach({
      context: "quick_blast_success",
      userAction: `Quick Blast succeeded: ${platforms.join(", ")}`,
      outcome: "success",
    });
  };

  const handleSend = async () => {
    setIsPosting(true);
    setStatus(null);
    setCelebration(null);
    setError(null);
    setCoachMessage(null);
    setLastResponse(null);

    setOutcome({
      tone: "neutral",
      title: "Sending…",
      body: "Hang tight — pushing your message out now.",
    });

    try {
      if (!selectedChannels.length) {
        throw new Error(
          `Select at least one connected channel.\n\nDetected connected: ${
            detectedConnectedList || "(none)"
          }`
        );
      }
      await postQuickBlast(selectedChannels);
    } catch (e: any) {
      const msg = String(e?.message || "Something didn't go through.");
      setError(msg);
      setOutcome((prev) => {
        if (prev && prev.title !== "Sending…") return prev;
        return {
          tone: quotaLocked ? "warn" : "bad",
          title: quotaLocked ? "Monthly quota reached" : "Not posted yet",
          body: quotaLocked && quota ? quota : msg,
          meta: "Save the draft to keep momentum safe.",
        };
      });
    } finally {
      setIsPosting(false);
    }
  };

  const coachParsed = useMemo(() => parseCoachMessage(coachMessage), [coachMessage]);
  const coachOptions = coachParsed.options.length
    ? coachParsed.options
    : ([
        { label: "Save for later", action: "save_for_later" },
        { label: "Refresh connections", action: "refresh_connections" },
      ] as CoachOption[]);

  const runCoachOption = async (opt: CoachOption) => {
    if (opt.action === "save_for_later") {
      saveDraft("coach option");
      return;
    }
    if (opt.action === "refresh_connections") {
      await refreshConnections();
    }
  };

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

  const SoftBtn = ({
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
      className="inline-flex items-center justify-center rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-slate-100 hover:bg-white/10 disabled:opacity-60 disabled:cursor-not-allowed transition"
    >
      {children}
    </button>
  );

  const canSend = !isPosting && message.trim().length > 0;

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
            <div className="flex items-center gap-2">
              <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">
                Root Health Ops
              </h1>
              <Pill tone="good">Enterprise Beta</Pill>
            </div>
            <p className="mt-2 text-sm text-slate-300 max-w-2xl">
              A calm, premium cockpit for social momentum. Send fast. Recover cleanly. Keep going.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Pill>
              Connected: <span className="ml-1 text-slate-50 font-semibold">{connectedCount}</span>
            </Pill>
            <Pill>{connectedHint}</Pill>
            {quotaLocked && <Pill tone="warn">Quota reached</Pill>}
          </div>
        </div>

        {celebration && (
          <div className="rounded-3xl border border-emerald-300/20 bg-emerald-300/10 px-5 py-4 text-sm text-emerald-100">
            {celebration}
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6">
            <GlassCard className="p-6 md:p-7">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold">Quick Blast</h2>
                  <p className="mt-1 text-xs text-slate-300">
                    Write once, choose channels, send. If anything fails, the next step is clear.
                  </p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <Pill>{message.length} chars</Pill>
                  {organisationId ? (
                    <span className="text-[10px] text-slate-500">Workspace loaded</span>
                  ) : (
                    <span className="text-[10px] text-amber-200">Loading workspace…</span>
                  )}
                </div>
              </div>

              <div className="mt-5">
                <label className="text-[11px] uppercase tracking-wide text-slate-400">
                  Message
                </label>
                <textarea
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-50 placeholder:text-slate-500 outline-none focus:border-emerald-400/50 focus:ring-1 focus:ring-emerald-400/30 min-h-[160px]"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Write your Quick Blast…"
                />
              </div>

              <div className="mt-6">
                <label className="text-[11px] uppercase tracking-wide text-slate-400">
                  Image (optional, recommended for Instagram)
                </label>
                <input
                  type="url"
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-50 placeholder:text-slate-500 outline-none focus:border-emerald-400/50 focus:ring-1 focus:ring-emerald-400/30"
                  placeholder="Paste a direct image URL (JPG/PNG)…"
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                />
                <div className="mt-2 text-[11px] text-slate-400">
                  Tip: square or portrait images work best.
                </div>
              </div>

              <div className="mt-6">
                <div className="flex items-center justify-between gap-3">
                  <label className="text-[11px] uppercase tracking-wide text-slate-400">
                    Channels
                  </label>
                  <button
                    type="button"
                    onClick={refreshConnections}
                    className="text-xs text-slate-300 hover:text-slate-50"
                  >
                    Refresh
                  </button>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {CHANNELS.map((c) => {
                    const isConnected = connected[c.id];
                    const isSelected = selected[c.id];

                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => toggleChannel(c.id)}
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
                          <span className="ml-1 text-[10px] text-amber-200">not connected</span>
                        ) : (
                          <span className="ml-1 text-[10px] text-slate-400">connected</span>
                        )}
                      </button>
                    );
                  })}
                </div>

                <div className="mt-3 text-[11px] text-slate-400">
                  Only connected channels will actually send.
                </div>
              </div>

              <div className="mt-6 flex flex-col sm:flex-row gap-3">
                <PrimaryBtn
                  onClick={handleSend}
                  disabled={!canSend || !selectedChannels.length || !organisationId || quotaLocked}
                >
                  {quotaLocked ? "Posting paused (quota)" : isPosting ? "Sending…" : "Send Quick Blast"}
                </PrimaryBtn>

                <SoftBtn onClick={() => saveDraft("manual")} disabled={!canSend}>
                  Save for later
                </SoftBtn>
              </div>

              <div className="mt-4 text-xs text-slate-400">
                {status ? status : error ? error : ""}
              </div>
            </GlassCard>

            {outcome && (
              <div
                className={[
                  "rounded-3xl border p-6 md:p-7 whitespace-pre-wrap",
                  toneStyles(outcome.tone),
                ].join(" ")}
              >
                <div className="text-base md:text-lg font-semibold">{outcome.title}</div>
                <div className="mt-2 text-sm leading-relaxed">{outcome.body}</div>
                {outcome.meta && <div className="mt-3 text-xs text-slate-200/90">{outcome.meta}</div>}
              </div>
            )}

            <GlassCard className="p-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold">Admin view</h3>
                  <p className="mt-1 text-xs text-slate-300">Safe technical details (redacted).</p>
                </div>
                <Pill tone={quotaLocked ? "warn" : "neutral"}>{quotaLocked ? "Limited" : "Normal"}</Pill>
              </div>

              {lastResponse ? (
                <details className="mt-4">
                  <summary className="cursor-pointer text-sm text-slate-200 hover:text-slate-50">
                    Show last response (redacted)
                  </summary>
                  <pre className="mt-3 max-h-[320px] overflow-auto rounded-2xl border border-white/10 bg-black/30 p-4 text-[10px] text-slate-200 whitespace-pre-wrap">
                    {safeJson(redactVendorsDeep(lastResponse))}
                  </pre>
                </details>
              ) : (
                <div className="mt-4 text-sm text-slate-400">
                  No response yet — send a Quick Blast to see details here.
                </div>
              )}

              <details className="mt-4">
                <summary className="cursor-pointer text-sm text-slate-200 hover:text-slate-50">
                  Show connections (redacted)
                </summary>
                <pre className="mt-3 max-h-[320px] overflow-auto rounded-2xl border border-white/10 bg-black/30 p-4 text-[10px] text-slate-200 whitespace-pre-wrap">
                  {safeJson(redactVendorsDeep(rawSocialAccounts))}
                </pre>
              </details>
            </GlassCard>

            {coachMessage && (
              <GlassCard className="p-6">
                <div className="text-base font-semibold">Root Coach</div>
                {coachParsed.body && (
                  <div className="mt-3 text-sm whitespace-pre-wrap">{coachParsed.body}</div>
                )}
                {coachOptions.length === 2 && (
                  <div className="mt-4 grid gap-2">
                    {coachOptions.map((opt, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => runCoachOption(opt)}
                        disabled={isPosting}
                        className="rounded-2xl border border-sky-300/20 bg-sky-300/10 px-4 py-3 text-left text-sm font-semibold text-sky-50 hover:bg-sky-300/15 transition disabled:opacity-60"
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                )}
              </GlassCard>
            )}
          </div>

          <div className="space-y-6">
            <GlassCard className="p-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold">Saved drafts</h3>
                  <p className="mt-1 text-xs text-slate-300">
                    Save ideas now, reuse them later. (Stored on this device.)
                  </p>
                </div>
                <Pill>{drafts.length} saved</Pill>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <SoftBtn onClick={() => saveDraft("drafts panel")} disabled={!message.trim()}>
                  Save current
                </SoftBtn>
                <SoftBtn onClick={() => setDraftsOpen((v) => !v)} disabled={!drafts.length}>
                  {draftsOpen ? "Hide list" : "Show list"}
                </SoftBtn>
              </div>

              <div className="mt-4">
                <input
                  className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-50 placeholder:text-slate-500 outline-none focus:border-emerald-400/50 focus:ring-1 focus:ring-emerald-400/30"
                  placeholder="Search drafts…"
                  value={draftSearch}
                  onChange={(e) => setDraftSearch(e.target.value)}
                />
              </div>

              {draftsOpen && (
                <div className="mt-4 space-y-2">
                  {sortedFilteredDrafts.length === 0 ? (
                    <div className="text-xs text-slate-400">No drafts match that search.</div>
                  ) : (
                    sortedFilteredDrafts.map((d) => (
                      <div
                        key={d.id}
                        className="rounded-2xl border border-white/10 bg-white/5 p-4"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <div className="truncate text-sm font-semibold text-slate-50">
                                {d.title}
                              </div>
                              {d.pinned && <Pill tone="good">Pinned</Pill>}
                            </div>
                            <div className="mt-1 text-[11px] text-slate-400">
                              Saved: {niceDate(d.savedAt)}
                            </div>
                            <div className="mt-2 text-[11px] text-slate-400 truncate">
                              {d.message.trim() ? d.message.trim() : "(empty)"}
                            </div>
                          </div>

                          <div className="flex flex-wrap gap-2 justify-end">
                            <button
                              type="button"
                              onClick={() => togglePin(d.id)}
                              className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-white/10 transition"
                            >
                              {d.pinned ? "Unpin" : "Pin"}
                            </button>
                          </div>
                        </div>

                        <div className="mt-3 flex gap-2">
                          <button
                            type="button"
                            onClick={() => loadDraft(d.id)}
                            className="flex-1 rounded-2xl bg-slate-100 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-white transition"
                          >
                            Load
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteDraft(d.id)}
                            className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-slate-200 hover:bg-white/10 transition"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              <div className="mt-4 text-[11px] text-slate-400">
                Drafts are stored on this device. (Later we can add synced drafts per org.)
              </div>
            </GlassCard>
          </div>
        </div>
      </div>
    </div>
  );
}
