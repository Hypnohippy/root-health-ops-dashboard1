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
};

type ApiResponse = {
  success: boolean;
  items?: InboxItem[];
  note?: string;
  error?: string;
  details?: string;
  configured?: boolean;
};

type SavedDraft = {
  id: string; // draft id
  itemId: string;
  createdAt: string;
  text: string;
};

const STORAGE_KEY = "root_ops_responses_saved_drafts_v1";

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

function clampText(s: string, max = 900) {
  const t = (s || "").trim();
  if (t.length <= max) return t;
  return t.slice(0, max) + "…";
}

/** Local fallback drafter (safe + relevant enough) */
function draftReplyLocal({
  platform,
  authorName,
  text,
}: {
  platform: InboxPlatform;
  authorName?: string | null;
  text: string;
}) {
  const name = (authorName || "").trim();
  const greeting = name ? `Hi ${name} — ` : "Thanks for this — ";

  const tl = (text || "").toLowerCase();

  const isConcern =
    tl.includes("overwhelm") ||
    tl.includes("burnout") ||
    tl.includes("anxious") ||
    tl.includes("anxiety") ||
    tl.includes("panic") ||
    tl.includes("stress") ||
    tl.includes("struggle");

  const isQuestion = tl.includes("?") || tl.startsWith("how") || tl.startsWith("what");

  const platformLine =
    platform === "linkedin"
      ? "If you’d like, I can share a quick example you can try this week."
      : platform === "instagram" || platform === "threads"
      ? "If you want, reply “yes” and I’ll share a simple next step."
      : "If you want, tell me a bit more and I’ll point you to a simple next step.";

  if (isConcern) {
    return (
      `${greeting}thanks for sharing that — it sounds like a lot.\n\n` +
      `A small first step: pick one “2-minute reset” you can do today (slow breathing, short walk, water + a pause).\n\n` +
      `${platformLine}\n\n` +
      `If this feels urgent or you’re not safe, please reach out to local support services right away.`
    );
  }

  if (isQuestion) {
    return (
      `${greeting}good question.\n\n` +
      `A simple start is: choose one outcome (e.g. calmer / more energy), then one repeatable action you can do daily.\n\n` +
      `What’s the main thing you want to improve right now?`
    );
  }

  return (
    `${greeting}thanks for the comment.\n\n` +
    `What are you hoping to get out of this most right now (calmer, energy, routine, confidence)?`
  );
}

/** Kill “Option A/B”, “channels”, “draft ready” etc. */
function sanitizeAiReply(raw: string) {
  const t = (raw || "").trim();
  if (!t) return "";

  const badSignals = [
    // Existing / common meta junk
    "option a",
    "option b",
    "post the reply",
    "post reply",
    "save the reply",
    "save reply",
    "save for later",
    "great news",
    "drafted successfully",
    "sent smoothly",
    "reply draft is ready",
    "choose where to send",
    "choose which channels",
    "no channels have posted",
    "channels",
    "publish",
    "schedule",

    // ✅ New “didn’t go through” meta patterns
    "didn’t go through",
    "didn't go through",
    "let’s try sending it again",
    "let's try sending it again",
    "try sending it again",
    "try again",
    "sending it again",
    "didn't send",
    "did not send",
    "failed to send",
    "didn’t send",
    "reply didn't go through",
    "reply didn’t go through",
  ];

  const lowerAll = t.toLowerCase();
  const looksBad = badSignals.some((x) => lowerAll.includes(x));
  if (!looksBad) return t;

  // Strip lines that look like workflow/status text
  const lines = t
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const cleaned = lines
    .filter((l) => {
      const ll = l.toLowerCase();
      if (ll.startsWith("option a")) return false;
      if (ll.startsWith("option b")) return false;
      if (badSignals.some((x) => ll.includes(x))) return false;
      return true;
    })
    .join("\n")
    .trim();

  // If the cleaned result is still meta-ish or too thin, reject it -> fallback will be used
  const out = cleaned || "";
  const outLower = out.toLowerCase();
  if (!out) return "";
  if (out.length < 20) return ""; // prevent one-liner meta junk
  if (badSignals.some((x) => outLower.includes(x))) return "";
  return out;
}

function newSeedItem(): InboxItem {
  const now = new Date();
  const id = `seed_${now.getTime()}_${Math.random().toString(16).slice(2)}`;

  const platforms: InboxPlatform[] = ["linkedin", "instagram", "threads", "facebook"];
  const platform = platforms[Math.floor(Math.random() * platforms.length)] || "linkedin";

  const authorNames = ["Alex", "Sam", "Jordan", "Taylor", "Jamie"];
  const authorName = authorNames[Math.floor(Math.random() * authorNames.length)] || "Alex";

  const samples = [
    "This really helped — thank you for sharing.",
    "How do you stay consistent when motivation drops?",
    "I’ve been feeling overwhelmed lately. Any small first step?",
    "Love this. Can you share an example routine?",
    "Not sure I agree — what’s the evidence for this approach?",
  ];

  const text = samples[Math.floor(Math.random() * samples.length)] || samples[0];

  return {
    id,
    platform,
    status: "needs_reply",
    kind: "comment",
    authorName,
    authorHandle: null,
    text,
    permalink: null,
    createdAt: now.toISOString(),
    postText: "a quick check-in post",
    postId: null,
  };
}

function loadDrafts(): SavedDraft[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveDrafts(all: SavedDraft[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    // ignore
  }
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

  const [seedCount, setSeedCount] = useState(0);

  // Saved drafts (localStorage)
  const [savedDrafts, setSavedDrafts] = useState<SavedDraft[]>([]);
  const [showSaved, setShowSaved] = useState(false);

  const lastScrollYRef = useRef<number>(0);

  useEffect(() => {
    // localStorage only on client
    setSavedDrafts(loadDrafts());
  }, []);

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

      const res = await fetch(
        `/api/responses/list?organisationId=${encodeURIComponent(org)}`,
        { method: "GET" }
      );
      const data: ApiResponse = await res.json().catch(() => ({ success: false }));

      if (!res.ok || data?.success === false) {
        throw new Error(
          data?.details || data?.error || `Failed to load inbox (HTTP ${res.status}).`
        );
      }

      setItems(Array.isArray(data?.items) ? data.items : []);
      setNote(typeof data?.note === "string" ? data.note : null);
      setConfigured(Boolean(data?.configured));
    } catch (e: any) {
      setError(e?.message || "Could not load responses inbox.");
      setItems([]);
      setNote(null);
      setConfigured(false);
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

  const draftsForSelected = useMemo(() => {
    if (!selected) return [];
    return savedDrafts
      .filter((d) => d.itemId === selected.id)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }, [savedDrafts, selected]);

  useEffect(() => {
    setReplyDraft("");
    setAiStatus(null);
    setCopied(false);
    setShowSaved(false);
  }, [selectedId]);

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

  async function runAiSuggest() {
    if (!selected) return;

    setAiStatus("Drafting reply…");
    setCopied(false);

    const fallback = draftReplyLocal({
      platform: selected.platform,
      authorName: selected.authorName,
      text: selected.text,
    });

    try {
      const res = await fetch("/api/ai/root-coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          context: "responses_reply_draft_v3",
          userAction:
            "Draft a PUBLIC reply to this social comment/message. Output ONLY the reply text.",
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
            "OUTPUT ONLY THE REPLY TEXT.",
            "No options (no Option A/B). No workflow status. No channels. No scheduling.",
            "Warm, concise, relevant to their message.",
            "No medical diagnosis/claims. No guarantees.",
            "If urgent distress: suggest local support services.",
            "Optional: one short clarifying question.",
          ],
        }),
      });

      const data: any = await res.json().catch(() => null);
      const raw = typeof data?.coachMessage === "string" ? data.coachMessage : "";
      const cleaned = sanitizeAiReply(raw);

      if (!res.ok || !cleaned) {
        setReplyDraft(fallback);
        setAiStatus("AI output was junk/generic — using safe fallback. (Edit it.)");
        setTimeout(() => setAiStatus(null), 5500);
        return;
      }

      setReplyDraft(cleaned);
      setAiStatus("Draft ready — edit it, save it, or copy/paste.");
      setTimeout(() => setAiStatus(null), 4500);
    } catch {
      setReplyDraft(fallback);
      setAiStatus("AI failed — using safe fallback. (Edit it.)");
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

  const clearDraft = () => {
    setReplyDraft("");
    setAiStatus(null);
    setCopied(false);
  };

  const saveCurrentDraft = () => {
    if (!selected) return;
    const text = replyDraft.trim();
    if (!text) return;

    const d: SavedDraft = {
      id: `draft_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      itemId: selected.id,
      createdAt: new Date().toISOString(),
      text,
    };

    const next = [d, ...savedDrafts];
    setSavedDrafts(next);
    saveDrafts(next);

    setAiStatus("Draft saved.");
    setTimeout(() => setAiStatus(null), 2500);
  };

  const deleteSavedDraft = (draftId: string) => {
    const next = savedDrafts.filter((d) => d.id !== draftId);
    setSavedDrafts(next);
    saveDrafts(next);
  };

  const loadSavedDraft = (draftText: string) => {
    setReplyDraft(draftText);
    setAiStatus("Loaded saved draft — edit if needed.");
    setTimeout(() => setAiStatus(null), 2500);
  };

  const seedMany = (n: number) => {
    // Make seeds ALWAYS visible
    setQuery("");
    setPlatformFilter("all");
    setStatusFilter("all");
    setShowSaved(false);

    const seeds: InboxItem[] = [];
    for (let i = 0; i < n; i++) seeds.push(newSeedItem());

    // Insert at top in one state update
    setItems((prev) => [...seeds, ...prev]);
    setSeedCount((c) => c + n);
    setNote("Seed mode: Demo items only (not real comments). Great for testing.");
    setError(null);

    // Scroll to top so you can SEE them
    requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0, behavior: "smooth" });
    });

    // Select the newest one so the right panel populates
    setSelectedId(seeds[0]?.id ?? null);
  };

  const Row = ({ it }: { it: InboxItem }) => {
    const isSelected = it.id === selectedId;
    return (
      <button
        type="button"
        onClick={() => {
          lastScrollYRef.current = window.scrollY || 0;
          setSelectedId(it.id);
          requestAnimationFrame(() => {
            window.scrollTo({ top: lastScrollYRef.current, left: 0, behavior: "auto" });
          });
        }}
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

          <Pill tone={statusTone(it.status)}>{it.status}</Pill>
        </div>

        <div className="mt-2 text-xs text-slate-400">
          {safeDate(it.createdAt)}
          {it.authorName ? (
            <>
              {" "}
              · <span className="text-slate-300">{it.authorName}</span>
            </>
          ) : null}
        </div>

        <div className="mt-3 text-sm text-slate-100 line-clamp-3 whitespace-pre-wrap">
          {it.text || "(empty)"}
        </div>
      </button>
    );
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
              Inbox for comments/messages — separate from Scheduled so staff don’t confuse planning with responding.
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

        <div className="rounded-3xl border border-white/10 bg-white/5 shadow-[0_20px_60px_rgba(0,0,0,0.35)] backdrop-blur-xl p-6">
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

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => seedMany(1)}
              className="rounded-2xl border border-emerald-300/30 bg-emerald-300/10 px-3 py-2 text-xs font-semibold text-emerald-50 hover:bg-emerald-300/15 transition"
            >
              Seed test item
            </button>

            <button
              type="button"
              onClick={() => seedMany(5)}
              className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-100 hover:bg-white/10 transition"
            >
              Seed 5
            </button>

            {seedCount > 0 && <span className="text-[11px] text-slate-400">Seeded: {seedCount}</span>}
          </div>

          {note && (
            <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-slate-300 whitespace-pre-wrap">
              {note}
            </div>
          )}

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

          {organisationId ? (
            <div className="mt-4 text-[11px] text-slate-400">Workspace loaded.</div>
          ) : (
            <div className="mt-4 text-[11px] text-slate-400">Loading workspace…</div>
          )}
        </div>

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
            <div className="rounded-3xl border border-white/10 bg-white/5 shadow-[0_20px_60px_rgba(0,0,0,0.35)] backdrop-blur-xl p-6">
              <div>
                <div className="text-base font-semibold">Reply assistant</div>
                <div className="mt-1 text-xs text-slate-300">
                  Generate → edit → save or copy/paste.
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
                        <div className="text-sm font-semibold">{PLATFORM_LABEL[selected.platform]}</div>
                      </div>
                      <Pill tone={statusTone(selected.status)}>{selected.status}</Pill>
                    </div>

                    <div className="mt-2 text-[11px] text-slate-400">
                      {safeDate(selected.createdAt)}
                      {selected.authorName ? (
                        <>
                          {" "}
                          · <span className="text-slate-300">{selected.authorName}</span>
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

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={saveCurrentDraft}
                      disabled={!replyDraft.trim()}
                      className="flex-1 rounded-2xl border border-emerald-300/30 bg-emerald-300/10 px-4 py-3 text-sm font-semibold text-emerald-50 hover:bg-emerald-300/15 disabled:opacity-60 disabled:cursor-not-allowed transition"
                    >
                      Save draft
                    </button>
                    <button
                      type="button"
                      onClick={clearDraft}
                      className="flex-1 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-slate-100 hover:bg-white/10 transition"
                    >
                      Clear
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowSaved((v) => !v)}
                    className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm font-semibold text-slate-100 hover:bg-white/5 transition"
                  >
                    {showSaved ? "Hide saved drafts" : `View saved drafts (${draftsForSelected.length})`}
                  </button>

                  {showSaved && (
                    <div className="rounded-2xl border border-white/10 bg-black/20 p-4 space-y-3">
                      {draftsForSelected.length === 0 ? (
                        <div className="text-sm text-slate-300">No saved drafts for this item yet.</div>
                      ) : (
                        draftsForSelected.map((d) => (
                          <div key={d.id} className="rounded-2xl border border-white/10 bg-white/5 p-3">
                            <div className="text-[11px] text-slate-400">{safeDate(d.createdAt)}</div>
                            <div className="mt-2 text-sm text-slate-100 whitespace-pre-wrap">
                              {d.text}
                            </div>
                            <div className="mt-3 flex gap-2">
                              <button
                                type="button"
                                onClick={() => loadSavedDraft(d.text)}
                                className="flex-1 rounded-2xl bg-emerald-500 px-3 py-2 text-xs font-semibold text-slate-950 hover:bg-emerald-400 transition"
                              >
                                Load
                              </button>
                              <button
                                type="button"
                                onClick={() => deleteSavedDraft(d.id)}
                                className="flex-1 rounded-2xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-100 hover:bg-red-500/15 transition"
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}

                  {aiStatus && (
                    <div className="rounded-2xl border border-white/10 bg-black/20 p-3 text-xs text-slate-300 whitespace-pre-wrap">
                      {aiStatus}
                    </div>
                  )}

                  <textarea
                    className="w-full min-h-[180px] rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:border-emerald-400/50 focus:ring-1 focus:ring-emerald-400/30"
                    placeholder="Your reply draft will appear here…"
                    value={replyDraft}
                    onChange={(e) => setReplyDraft(e.target.value)}
                  />
                </div>
              )}
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/5 shadow-[0_20px_60px_rgba(0,0,0,0.35)] backdrop-blur-xl p-6">
              <div className="text-base font-semibold">Enterprise safety</div>
              <div className="mt-2 text-sm text-slate-300 whitespace-pre-wrap">
                • AI drafts are always editable before posting.\n
                • Drafts can be saved per inbox item.\n
                • Seed mode is for demo/testing.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
