// app/dashboard/responses/page.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

type InboxPlatform =
  | "facebook"
  | "instagram"
  | "linkedin"
  | "threads"
  | "tiktok"
  | "reddit"
  | "unknown";

type InboxStatus = "unread" | "needs_reply" | "replied" | "archived" | "unknown";

type InboxItem = {
  id: string;
  platform: InboxPlatform;
  status: InboxStatus;

  authorName?: string | null;
  authorHandle?: string | null;

  kind?: "comment" | "dm" | "mention" | "reaction" | "unknown";
  text: string;

  permalink?: string | null;
  createdAt: string;

  postText?: string | null;
  postId?: string | null;

  draftText?: string | null;
  draftUpdatedAt?: string | null;
};

type ApiResponse = {
  success: boolean;
  items?: InboxItem[];
  note?: string;
  error?: string;
  configured?: boolean;
};

const PLATFORM_LABEL: Record<InboxPlatform, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  linkedin: "LinkedIn",
  threads: "Threads",
  tiktok: "TikTok",
  reddit: "Reddit",
  unknown: "Unknown",
};

const PLATFORM_DOT: Record<InboxPlatform, string> = {
  facebook: "bg-[#1877F2]",
  linkedin: "bg-sky-500",
  instagram: "bg-pink-500",
  threads: "bg-white",
  tiktok: "bg-slate-200",
  reddit: "bg-orange-400",
  unknown: "bg-slate-500",
};

function safeDate(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function statusTone(s: InboxStatus): "good" | "warn" | "neutral" {
  if (s === "replied") return "good";
  if (s === "needs_reply" || s === "unread") return "warn";
  return "neutral";
}

function draftReplyLocal({
  platform,
  authorName,
  text,
  postText,
}: {
  platform: InboxPlatform;
  authorName?: string | null;
  text: string;
  postText?: string | null;
}) {
  const name = (authorName || "").trim();
  const greeting = name ? `Hi ${name} — ` : "Thanks for this — ";

  const t = (text || "").trim();
  const tl = t.toLowerCase();

  const isPraise =
    tl.includes("love") ||
    tl.includes("great") ||
    tl.includes("amazing") ||
    tl.includes("thank") ||
    tl.includes("helpful") ||
    tl.includes("brilliant");

  const isQuestion =
    tl.includes("?") || tl.startsWith("how") || tl.startsWith("what") || tl.startsWith("why");

  const isConcern =
    tl.includes("struggle") ||
    tl.includes("anxious") ||
    tl.includes("anxiety") ||
    tl.includes("panic") ||
    tl.includes("depress") ||
    tl.includes("ptsd") ||
    tl.includes("stress") ||
    tl.includes("overwhelm") ||
    tl.includes("burnout");

  const isNegative =
    tl.includes("hate") ||
    tl.includes("bad") ||
    tl.includes("terrible") ||
    tl.includes("worst") ||
    tl.includes("scam") ||
    tl.includes("fake") ||
    tl.includes("useless");

  const platformLine =
    platform === "linkedin"
      ? "If you’d like, I can share a quick example you can try this week."
      : platform === "instagram" || platform === "threads"
      ? "If you want, drop a “yes” and I’ll send a simple next step."
      : "If you want, tell me a bit more and I’ll point you to a simple next step.";

  const contextHint =
    postText && postText.trim()
      ? `\n\n(For context: this was in reply to your post about “${postText
          .trim()
          .slice(0, 120)}${postText.trim().length > 120 ? "…" : ""}”)`
      : "";

  if (isConcern) {
    return (
      `${greeting}I really appreciate you sharing that.\n\n` +
      `A gentle next step is to pick one small thing you can do today — something you can repeat without pressure.\n\n` +
      `${platformLine}\n\n` +
      `If this feels urgent or you’re not safe, please reach out to local support services right away.` +
      contextHint
    );
  }

  if (isNegative) {
    return (
      `${greeting}I hear you.\n\n` +
      `I’m sorry it landed that way — if you’re open to it, tell me what part didn’t work for you and I’ll try to make it clearer or point you to something more useful.\n\n` +
      `No pressure either way.` +
      contextHint
    );
  }

  if (isPraise) {
    return (
      `${greeting}that means a lot — thank you.\n\n` +
      `What part resonated most for you? I’m shaping the next posts around what people find genuinely useful.\n\n` +
      `${platformLine}` +
      contextHint
    );
  }

  if (isQuestion) {
    return (
      `${greeting}good question.\n\n` +
      `A simple way to start is: choose one clear outcome (e.g., “feel calmer in 2 minutes”), then pick one repeatable action you can do daily.\n\n` +
      `If you tell me your situation (work / study / home), I’ll tailor a short, practical version.` +
      contextHint
    );
  }

  return (
    `${greeting}thanks for taking the time to comment.\n\n` +
    `If you tell me what you’re aiming for right now (more energy, less stress, better routine), I’ll suggest one small next step you can try.` +
    contextHint
  );
}

function clampText(s: string, max = 900) {
  const t = (s || "").trim();
  if (t.length <= max) return t;
  return t.slice(0, max) + "…";
}

/** ✅ Remove “Option A/B” and other meta helper junk if it appears */
function sanitizeAiReply(raw: string) {
  const t = (raw || "").trim();
  if (!t) return "";

  const badSignals = [
    "option a",
    "option b",
    "post reply now",
    "save reply for later",
    "great news!",
    "drafted successfully",
    "you can either post it now",
    "sent smoothly",
  ];

  const lower = t.toLowerCase();
  const looksBad = badSignals.some((x) => lower.includes(x));
  if (!looksBad) return t;

  // Try strip lines containing "Option A/B" or obvious meta phrases
  const lines = t.split("\n").map((l) => l.trimEnd());
  const cleaned = lines
    .filter((l) => {
      const ll = l.toLowerCase().trim();
      if (!ll) return true;
      if (ll.startsWith("option a")) return false;
      if (ll.startsWith("option b")) return false;
      if (ll.includes("post reply")) return false;
      if (ll.includes("save") && ll.includes("later")) return false;
      if (ll.includes("great news")) return false;
      if (ll.includes("drafted successfully")) return false;
      return true;
    })
    .join("\n")
    .trim();

  // If it’s still meta-ish, just return empty and force fallback
  const cleanedLower = cleaned.toLowerCase();
  const stillBad = badSignals.some((x) => cleanedLower.includes(x));
  return stillBad ? "" : cleaned;
}

export default function ResponsesPage() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [configured, setConfigured] = useState<boolean>(false);

  const [items, setItems] = useState<InboxItem[]>([]);
  const [organisationId, setOrganisationId] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [platformFilter, setPlatformFilter] = useState<InboxPlatform | "all">("all");
  const [statusFilter, setStatusFilter] = useState<InboxStatus | "all">("all");

  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [replyDraft, setReplyDraft] = useState("");
  const [aiStatus, setAiStatus] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Debounced draft saving (keep your current endpoints if already added)
  const saveTimer = useRef<any>(null);
  const lastSaved = useRef<string>("");

  const resolveOrg = async () => {
    const res = await fetch("/api/social-accounts", { method: "GET" });
    const data: any = await res.json().catch(() => null);

    const org =
      typeof data?.organisationId === "string"
        ? data.organisationId
        : typeof data?.organisation_id === "string"
        ? data.organisation_id
        : null;

    if (!org) throw new Error("Workspace not loaded yet. Please refresh and try again.");
    setOrganisationId(org);
    return org;
  };

  const load = async () => {
    setLoading(true);
    setError(null);

    try {
      const org = organisationId || (await resolveOrg());

      const res = await fetch(`/api/responses/list?organisationId=${encodeURIComponent(org)}`, {
        method: "GET",
      });
      const data: ApiResponse = await res.json().catch(() => ({ success: false }));

      if (!res.ok || data?.success === false) {
        throw new Error(data?.error || `Failed to load inbox (HTTP ${res.status}).`);
      }

      const list = Array.isArray(data?.items) ? data.items : [];
      setItems(list);
      setNote(typeof data?.note === "string" ? data.note : null);
      setConfigured(Boolean(data?.configured));
    } catch (e: any) {
      setError(e?.message || "Could not load responses inbox.");
      setItems([]);
      setNote(null);
      setConfigured(false);
      setSelectedId(null);
    } finally {
      setLoading(false);
    }
  };

  const refresh = async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((it) => {
      if (platformFilter !== "all" && it.platform !== platformFilter) return false;
      if (statusFilter !== "all" && it.status !== statusFilter) return false;
      if (!q) return true;

      const hay = [
        it.platform,
        it.status,
        it.kind || "",
        it.authorName || "",
        it.authorHandle || "",
        it.text || "",
        it.postText || "",
      ]
        .join(" ")
        .toLowerCase();

      return hay.includes(q);
    });
  }, [items, query, platformFilter, statusFilter]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { total: items.length, unread: 0, needs_reply: 0, replied: 0 };
    for (const it of items) {
      if (it.status === "unread") c.unread++;
      if (it.status === "needs_reply") c.needs_reply++;
      if (it.status === "replied") c.replied++;
    }
    return c;
  }, [items]);

  const selected = useMemo(() => {
    return filtered.find((x) => x.id === selectedId) || null;
  }, [filtered, selectedId]);

  // Load any saved draft into textarea when selecting
  useEffect(() => {
    setCopied(false);
    setAiStatus(null);

    if (!selected) {
      setReplyDraft("");
      lastSaved.current = "";
      return;
    }

    const d = (selected.draftText || "").trim();
    setReplyDraft(d);
    lastSaved.current = d;
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const Row = ({ it }: { it: InboxItem }) => {
    const isSelected = it.id === selectedId;
    return (
      <button
        type="button"
        onClick={() => setSelectedId(it.id)}
        className={[
          "w-full text-left rounded-2xl border p-4 transition",
          isSelected
            ? "border-emerald-300/30 bg-emerald-300/5"
            : "border-white/10 bg-black/20 hover:bg-white/5",
        ].join(" ")}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <span
              className={[
                "h-2 w-2 rounded-full",
                PLATFORM_DOT[it.platform] || PLATFORM_DOT.unknown,
                "shadow-[0_0_0_4px_rgba(255,255,255,0.06)]",
              ].join(" ")}
            />
            <div className="text-xs font-semibold text-slate-100 truncate">
              {PLATFORM_LABEL[it.platform] || "Unknown"}
              <span className="ml-2 text-[11px] font-normal text-slate-400">
                {it.kind || "activity"}
              </span>
            </div>
          </div>

          <Pill tone={statusTone(it.status)}>
            {it.status === "needs_reply"
              ? "needs reply"
              : it.status === "unread"
              ? "unread"
              : it.status === "replied"
              ? "replied"
              : it.status}
          </Pill>
        </div>

        <div className="mt-2 text-xs text-slate-400">
          {safeDate(it.createdAt)}
          {it.authorName || it.authorHandle ? (
            <>
              {" "}
              ·{" "}
              <span className="text-slate-300">
                {it.authorName || it.authorHandle}
              </span>
            </>
          ) : null}
        </div>

        <div className="mt-3 text-sm text-slate-100 line-clamp-3 whitespace-pre-wrap">
          {it.text || "(empty)"}
        </div>
      </button>
    );
  };

  const scheduleSaveDraft = (text: string) => {
    if (!selected || !organisationId) return;
    if (text === lastSaved.current) return;

    if (saveTimer.current) clearTimeout(saveTimer.current);

    saveTimer.current = setTimeout(async () => {
      try {
        const res = await fetch("/api/responses/draft", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            organisationId,
            inboxItemId: selected.id,
            draftText: text,
            updatedBy: "staff",
          }),
        });

        const data: any = await res.json().catch(() => null);
        if (!res.ok || data?.success === false) throw new Error(data?.error || "Failed to save draft");

        lastSaved.current = text;
        setItems((prev) =>
          prev.map((x) =>
            x.id === selected.id ? { ...x, draftText: text, draftUpdatedAt: new Date().toISOString() } : x
          )
        );
      } catch (e: any) {
        setAiStatus(e?.message || "Failed to save draft.");
        setTimeout(() => setAiStatus(null), 3500);
      }
    }, 650);
  };

  async function runAiSuggest() {
    if (!selected) return;

    setAiStatus("Drafting reply…");
    setCopied(false);

    const fallback = draftReplyLocal({
      platform: selected.platform,
      authorName: selected.authorName,
      text: selected.text,
      postText: selected.postText,
    });

    try {
      const res = await fetch("/api/ai/root-coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          context: "responses_reply_draft_reply_only",
          userAction:
            "Write ONLY the final public reply text. No headings. No options. No meta commentary. No 'Option A/B'.",
          platform: selected.platform,
          item: {
            kind: selected.kind || "comment",
            text: clampText(selected.text, 900),
            authorName: selected.authorName || null,
            authorHandle: selected.authorHandle || null,
            createdAt: selected.createdAt,
            postText: selected.postText ? clampText(selected.postText, 300) : null,
            permalink: selected.permalink || null,
          },
          rules: [
            "Output MUST be ONLY the reply text.",
            "Do NOT include 'Option A' or 'Option B'.",
            "Do NOT mention posting, saving, or workflows.",
            "Warm, concise, respectful.",
            "No medical claims or diagnosis. No promises or guarantees.",
            "If distress/urgency: suggest local support services.",
          ],
        }),
      });

      const data: any = await res.json().catch(() => null);
      const raw = typeof data?.coachMessage === "string" ? data.coachMessage : "";
      const cleaned = sanitizeAiReply(raw);

      if (!res.ok || !cleaned) {
        setReplyDraft(fallback);
        scheduleSaveDraft(fallback);
        setAiStatus("AI returned helper/meta text — using safe fallback. (You can edit it.)");
        setTimeout(() => setAiStatus(null), 5000);
        return;
      }

      setReplyDraft(cleaned);
      scheduleSaveDraft(cleaned);
      setAiStatus("Draft ready — edit it, then copy/paste.");
      setTimeout(() => setAiStatus(null), 4500);
    } catch {
      setReplyDraft(fallback);
      scheduleSaveDraft(fallback);
      setAiStatus("AI draft failed — using safe fallback. (You can edit it.)");
      setTimeout(() => setAiStatus(null), 5000);
    }
  }

  const copyDraft = async () => {
    try {
      if (!replyDraft.trim()) return;
      await navigator.clipboard.writeText(replyDraft);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  };

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
            <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">Responses</h1>
            <p className="mt-2 text-sm text-slate-300 max-w-2xl">
              Your inbox for comments and messages — separate from Scheduled so staff don’t confuse “planning posts” with “responding”.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Pill>All: {counts.total}</Pill>
            <Pill tone="warn">Unread: {counts.unread}</Pill>
            <Pill tone="warn">Needs reply: {counts.needs_reply}</Pill>
            <Pill tone="good">Replied: {counts.replied}</Pill>

            <button
              type="button"
              onClick={refresh}
              disabled={refreshing}
              className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-100 hover:bg-white/10 disabled:opacity-60 disabled:cursor-not-allowed transition"
            >
              {refreshing ? "Refreshing…" : "Refresh"}
            </button>
          </div>
        </div>

        <GlassCard className="p-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <div className="text-base font-semibold">Search & filters</div>
              <div className="mt-1 text-xs text-slate-300">Find what needs action fast.</div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
              <input
                className="w-full sm:w-[340px] rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-50 placeholder:text-slate-500 outline-none focus:border-emerald-400/50 focus:ring-1 focus:ring-emerald-400/30"
                placeholder="Search…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />

              <select
                className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-100 outline-none"
                value={platformFilter}
                onChange={(e) => setPlatformFilter(e.target.value as any)}
              >
                <option value="all">All platforms</option>
                <option value="facebook">Facebook</option>
                <option value="linkedin">LinkedIn</option>
                <option value="instagram">Instagram</option>
                <option value="threads">Threads</option>
                <option value="tiktok">TikTok</option>
                <option value="reddit">Reddit</option>
              </select>

              <select
                className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-100 outline-none"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
              >
                <option value="all">All statuses</option>
                <option value="unread">Unread</option>
                <option value="needs_reply">Needs reply</option>
                <option value="replied">Replied</option>
                <option value="archived">Archived</option>
              </select>
            </div>
          </div>

          {error && (
            <div className="mt-4 rounded-2xl border border-red-500/40 bg-red-950/40 p-4 text-sm text-red-200 whitespace-pre-wrap">
              {error}
            </div>
          )}

          {loading && (
            <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-slate-300">
              Loading inbox…
            </div>
          )}
        </GlassCard>

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-3">
            {!loading && filtered.length === 0 ? (
              <div className="rounded-3xl border border-white/10 bg-white/5 p-6 text-sm text-slate-300">
                No items found.
              </div>
            ) : (
              filtered.map((it) => <Row key={it.id} it={it} />)
            )}
          </div>

          <div className="space-y-6">
            <GlassCard className="p-6">
              <div>
                <div className="text-base font-semibold">Reply assistant</div>
                <div className="mt-1 text-xs text-slate-300">
                  Generate a draft, edit it, then copy/paste to reply on the platform.
                </div>
              </div>

              {!selected ? (
                <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-slate-300">
                  Select an item from the left to draft a reply.
                </div>
              ) : (
                <div className="mt-4 space-y-4">
                  <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span
                          className={[
                            "h-2 w-2 rounded-full",
                            PLATFORM_DOT[selected.platform] || PLATFORM_DOT.unknown,
                            "shadow-[0_0_0_4px_rgba(255,255,255,0.06)]",
                          ].join(" ")}
                        />
                        <div className="text-sm font-semibold">
                          {PLATFORM_LABEL[selected.platform] || "Unknown"}
                        </div>
                      </div>
                      <Pill tone={statusTone(selected.status)}>{selected.status}</Pill>
                    </div>

                    <div className="mt-2 text-[11px] text-slate-400">
                      {safeDate(selected.createdAt)}
                      {selected.authorName || selected.authorHandle ? (
                        <>
                          {" "}
                          ·{" "}
                          <span className="text-slate-300">
                            {selected.authorName || selected.authorHandle}
                          </span>
                        </>
                      ) : null}
                    </div>

                    <div className="mt-3 text-sm whitespace-pre-wrap">{selected.text}</div>

                    {selected.permalink ? (
                      <div className="mt-3 text-[11px]">
                        <a
                          href={selected.permalink}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sky-300 hover:text-sky-200 underline"
                        >
                          Open on platform
                        </a>
                      </div>
                    ) : null}
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={runAiSuggest}
                      className="flex-1 rounded-2xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-slate-950 hover:bg-emerald-400 transition"
                    >
                      AI Suggest Reply
                    </button>

                    <button
                      type="button"
                      onClick={copyDraft}
                      disabled={!replyDraft.trim()}
                      className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-slate-100 hover:bg-white/10 disabled:opacity-60 disabled:cursor-not-allowed transition"
                    >
                      {copied ? "Copied" : "Copy"}
                    </button>
                  </div>

                  {aiStatus && (
                    <div className="rounded-2xl border border-white/10 bg-black/20 p-3 text-xs text-slate-300 whitespace-pre-wrap">
                      {aiStatus}
                    </div>
                  )}

                  <textarea
                    className="w-full min-h-[180px] rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:border-emerald-400/50 focus:ring-1 focus:ring-emerald-400/30"
                    placeholder="Your reply draft will appear here…"
                    value={replyDraft}
                    onChange={(e) => {
                      const v = e.target.value;
                      setReplyDraft(v);
                      scheduleSaveDraft(v);
                    }}
                  />
                </div>
              )}
            </GlassCard>
          </div>
        </div>
      </div>
    </div>
  );
}
