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

  // ✅ needed to reply
  externalId?: string | null;
};

type ApiResponse = {
  success: boolean;
  items?: InboxItem[];
  note?: string;
  error?: string;
  configured?: boolean;
};

type SavedDraft = {
  id: string;
  inboxItemId: string;
  createdAt: string;
  text: string;
  platform: InboxPlatform;
  authorName?: string | null;
  snippet: string;
};

const STORAGE_KEY_DRAFTS = "rootops_saved_response_drafts_v1";
const STORAGE_KEY_STATUS = "rootops_inbox_status_overrides_v1";

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

function makeSnippet(s: string, max = 80) {
  const t = (s || "").replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return t.slice(0, max) + "…";
}

/** ✅ Detect “system helper / ops UI” responses that are NOT paste-ready replies */
function looksLikeSystemHelper(raw: string) {
  const t = (raw || "").toLowerCase();
  if (!t.trim()) return true;

  const bad = [
    "option a",
    "option b",
    "post now",
    "post the reply",
    "save for later",
    "drafted successfully",
    "sent smoothly",
    "no channels have posted",
    "choose where to send",
    "reply didn’t go through",
    "didn't go through",
    "didn’t post",
    "didn't post",
    "looks like your reply",
    "great news",
    "ready to go",
    "let’s try sending it again",
    "let’s get it out there",
  ];

  return bad.some((x) => t.includes(x));
}

/**
 * Strip “Option A/B”, “post didn’t go through”, “save for later”, etc.
 * If it still looks like UI/ops language after cleaning, return "" to force fallback.
 */
function sanitizeAiReply(raw: string) {
  const t = (raw || "").trim();
  if (!t) return "";

  const lower = t.toLowerCase();
  const looksBad =
    looksLikeSystemHelper(t) ||
    lower.includes("option a") ||
    lower.includes("option b") ||
    lower.includes("save") ||
    lower.includes("post");

  if (!looksBad) return t;

  const cleaned = t
    .split("\n")
    .map((l) => l.trimEnd())
    .filter((l) => {
      const ll = l.toLowerCase().trim();
      if (!ll) return true;
      if (ll.startsWith("option a")) return false;
      if (ll.startsWith("option b")) return false;
      if (ll.includes("post") && ll.includes("reply")) return false;
      if (ll.includes("save") && ll.includes("later")) return false;
      if (ll.includes("great news")) return false;
      if (ll.includes("drafted successfully")) return false;
      if (ll.includes("sent smoothly")) return false;
      if (ll.includes("no channels")) return false;
      if (ll.includes("choose where")) return false;
      if (ll.includes("looks like your reply")) return false;
      if (ll.includes("ready to go")) return false;
      if (ll.includes("didn't go through")) return false;
      if (ll.includes("didn’t go through")) return false;
      if (ll.includes("didn't post")) return false;
      if (ll.includes("didn’t post")) return false;
      return true;
    })
    .join("\n")
    .trim();

  if (!cleaned) return "";
  if (looksLikeSystemHelper(cleaned)) return "";

  return cleaned;
}

/** If AI response is super generic, prefer the local fallback */
function isTooGeneric(ai: string, original: string) {
  const a = (ai || "").trim().toLowerCase();
  const o = (original || "").trim().toLowerCase();
  if (!a) return true;

  const genericSignals = [
    "thanks so much for your comment",
    "we really appreciate your support",
    "have a great day",
    "here if you have any questions",
  ];
  const looksGeneric = genericSignals.some((x) => a.includes(x));

  const originalHasConcern =
    o.includes("overwhelm") ||
    o.includes("overwhelmed") ||
    o.includes("anx") ||
    o.includes("panic") ||
    o.includes("stress") ||
    o.includes("burnout") ||
    o.includes("ptsd") ||
    o.includes("depress");

  const originalHasQuestion =
    o.includes("?") ||
    o.startsWith("how") ||
    o.startsWith("what") ||
    o.startsWith("why") ||
    o.includes("any small") ||
    o.includes("first step");

  const aiMentionsConcern =
    a.includes("overwhelm") ||
    a.includes("stress") ||
    a.includes("anx") ||
    a.includes("panic") ||
    a.includes("small step") ||
    a.includes("first step") ||
    a.includes("try");

  if (looksGeneric && (originalHasConcern || originalHasQuestion) && !aiMentionsConcern)
    return true;

  if (looksGeneric && a.length < 180) return true;

  return false;
}

/**
 * Local fallback drafter (enterprise-safe).
 * Used whenever AI drifts into “posting UI” language or becomes generic.
 */
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
    tl.includes("?") ||
    tl.startsWith("how") ||
    tl.startsWith("what") ||
    tl.startsWith("why") ||
    tl.startsWith("any ") ||
    tl.startsWith("can ");

  const isConcern =
    tl.includes("struggle") ||
    tl.includes("anxious") ||
    tl.includes("anxiety") ||
    tl.includes("panic") ||
    tl.includes("depress") ||
    tl.includes("ptsd") ||
    tl.includes("stress") ||
    tl.includes("overwhelm") ||
    tl.includes("overwhelmed") ||
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
      ? "If you want, reply “yes” and I’ll share a simple next step."
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
      `A gentle first step is to pick one small thing you can do today — something you can repeat without pressure.\n\n` +
      `For example: 60 seconds of slow breathing, a short walk, or writing down the next one thing you can control.\n\n` +
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

function readSavedDrafts(): SavedDraft[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY_DRAFTS);
    const parsed = raw ? JSON.parse(raw) : null;
    if (!Array.isArray(parsed)) return [];
    return parsed as SavedDraft[];
  } catch {
    return [];
  }
}

function writeSavedDrafts(next: SavedDraft[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY_DRAFTS, JSON.stringify(next));
  } catch {}
}

type StatusOverrides = Record<string, InboxStatus>;

function readStatusOverrides(): StatusOverrides {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY_STATUS);
    const parsed = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as StatusOverrides;
  } catch {
    return {};
  }
}

function writeStatusOverrides(next: StatusOverrides) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY_STATUS, JSON.stringify(next));
  } catch {}
}

export default function ResponsesPage() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [sendingReply, setSendingReply] = useState(false);

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

  // Saved drafts
  const [savedDrafts, setSavedDrafts] = useState<SavedDraft[]>([]);
  const [showSaved, setShowSaved] = useState(false);

  // Local status overrides to stop “replied → snaps back”
  const statusOverridesRef = useRef<StatusOverrides>({});

  // Prevent jump-to-top on select
  const listScrollYRef = useRef<number>(0);

  useEffect(() => {
    setSavedDrafts(readSavedDrafts());
    statusOverridesRef.current = readStatusOverrides();
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

  const applyOverrides = (rows: InboxItem[]) => {
    const ov = statusOverridesRef.current || {};
    if (!ov || Object.keys(ov).length === 0) return rows;
    return rows.map((x) => (ov[x.id] ? { ...x, status: ov[x.id] } : x));
  };

  const load = async () => {
    setLoading(true);
    setError(null);

    try {
      const org = organisationId || (await resolveOrg());

      const res = await fetch(`/api/responses/list?organisationId=${encodeURIComponent(org)}`, {
        method: "GET",
        cache: "no-store",
      });

      const data: ApiResponse = await res.json().catch(() => ({ success: false } as any));

      if (!res.ok || data?.success === false) {
        throw new Error(data?.error || `Failed to load inbox (HTTP ${res.status}).`);
      }

      const rows = Array.isArray(data?.items) ? data.items : [];
      setItems(applyOverrides(rows));
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

  const pullLatest = async () => {
    setPulling(true);
    setError(null);
    try {
      const org = organisationId || (await resolveOrg());
      const res = await fetch("/api/responses/pull", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ organisationId: org }),
      });

      const data: any = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || `Pull failed (HTTP ${res.status}).`);
      }

      setAiStatus(`Pulled ${data?.pulled || 0} item(s). Refreshing list…`);
      await load();
      setTimeout(() => setAiStatus(null), 2600);
    } catch (e: any) {
      setError(e?.message || "Could not pull latest comments.");
    } finally {
      setPulling(false);
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
    const c: Record<string, number> = {
      total: items.length,
      unread: 0,
      needs_reply: 0,
      replied: 0,
    };
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

  useEffect(() => {
    setReplyDraft("");
    setAiStatus(null);
    setCopied(false);
  }, [selectedId]);

  // restore scroll after selection to prevent “skippy”
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (listScrollYRef.current > 0) {
      requestAnimationFrame(() => {
        window.scrollTo({ top: listScrollYRef.current });
      });
    }
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

  const onSelectRow = (it: InboxItem) => {
    if (typeof window !== "undefined") listScrollYRef.current = window.scrollY || 0;
    setSelectedId(it.id);
  };

  const Row = ({ it }: { it: InboxItem }) => {
    const isSelected = it.id === selectedId;
    return (
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          onSelectRow(it);
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
                {it.authorHandle && it.authorName ? ` (${it.authorHandle})` : ""}
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

  const setLocalStatus = (id: string, status: InboxStatus) => {
    const nextOv: StatusOverrides = {
      ...(statusOverridesRef.current || {}),
      [id]: status,
    };
    statusOverridesRef.current = nextOv;
    writeStatusOverrides(nextOv);
    setItems((prev) => prev.map((x) => (x.id === id ? { ...x, status } : x)));
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

    const itemSnapshot = {
      platform: selected.platform,
      kind: selected.kind || "comment",
      text: selected.text,
      authorName: selected.authorName || null,
      authorHandle: selected.authorHandle || null,
      createdAt: selected.createdAt,
      postText: selected.postText || null,
      permalink: selected.permalink || null,
    };

    const callAi = async () => {
      const res = await fetch("/api/ai/root-coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          context: "responses_public_reply_draft_v2",
          userAction:
            "Write ONLY the reply text that I can post as a public reply. Do NOT mention posting, saving, drafts, channels, options, or system status.",
          outcome: "success",
          platform: itemSnapshot.platform,
          item: {
            kind: itemSnapshot.kind,
            text: clampText(itemSnapshot.text, 900),
            authorName: itemSnapshot.authorName,
            authorHandle: itemSnapshot.authorHandle,
            createdAt: itemSnapshot.createdAt,
            postText: itemSnapshot.postText ? clampText(itemSnapshot.postText, 300) : null,
            permalink: itemSnapshot.permalink,
          },
          rules: [
            "Output ONLY the reply text (no headings, no options, no meta).",
            "Be warm, concise, respectful.",
            "No medical claims or diagnosis. No promises or guarantees.",
            "If distress/urgency is present, suggest seeking local support services.",
            "Ask at most ONE clarifying question if helpful.",
            "Keep it suitable for public replies.",
          ],
        }),
      });

      const data: any = await res.json().catch(() => null);
      const raw =
        (typeof data?.coachMessage === "string" && data.coachMessage) ||
        (typeof data?.message === "string" && data.message) ||
        (typeof data?.text === "string" && data.text) ||
        "";

      return { ok: res.ok, raw };
    };

    try {
      const r1 = await callAi();
      let cleaned1 = sanitizeAiReply(r1.raw);

      if (
        !r1.ok ||
        !cleaned1 ||
        looksLikeSystemHelper(r1.raw) ||
        isTooGeneric(cleaned1, itemSnapshot.text)
      ) {
        const r2 = await callAi();
        const cleaned2 = sanitizeAiReply(r2.raw);

        if (
          r2.ok &&
          cleaned2 &&
          !looksLikeSystemHelper(r2.raw) &&
          !isTooGeneric(cleaned2, itemSnapshot.text)
        ) {
          setReplyDraft(cleaned2);
          setAiStatus("Draft ready — edit it, then send.");
          setTimeout(() => setAiStatus(null), 4200);
          return;
        }

        setReplyDraft(fallback);
        setAiStatus("AI drift detected — using safe fallback. (Edit it if you want.)");
        setTimeout(() => setAiStatus(null), 5200);
        return;
      }

      setReplyDraft(cleaned1);
      setAiStatus("Draft ready — edit it, then send.");
      setTimeout(() => setAiStatus(null), 4200);
    } catch {
      setReplyDraft(fallback);
      setAiStatus("AI draft failed — using safe fallback. (Edit it if you want.)");
      setTimeout(() => setAiStatus(null), 5200);
    }
  }

  const copyDraft = async () => {
    try {
      if (!selected) return;
      if (!replyDraft.trim()) return;

      await navigator.clipboard.writeText(replyDraft);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);

      // local mark
      setLocalStatus(selected.id, "replied");
    } catch {
      setCopied(false);
    }
  };

  const sendReply = async () => {
    if (!selected) return;
    const msg = (replyDraft || "").trim();
    if (!msg) {
      setAiStatus("Type or generate a reply first.");
      setTimeout(() => setAiStatus(null), 2200);
      return;
    }

    if (!selected.externalId) {
      setAiStatus("This item is missing the platform comment ID. Pull latest again and re-select this item.");
      setTimeout(() => setAiStatus(null), 3200);
      return;
    }

    // Only FB/IG implemented here (safe + predictable)
    if (selected.platform !== "facebook" && selected.platform !== "instagram") {
      setAiStatus(`Direct reply is not enabled for ${PLATFORM_LABEL[selected.platform]} yet.`);
      setTimeout(() => setAiStatus(null), 3200);
      return;
    }

    setSendingReply(true);
    setError(null);

    try {
      const org = organisationId || (await resolveOrg());

      const res = await fetch("/api/responses/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          organisationId: org,
          platform: selected.platform,
          externalId: selected.externalId,
          message: msg,
        }),
      });

      const data: any = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || `Reply failed (HTTP ${res.status}).`);
      }

      setAiStatus("Reply sent ✅");
      setLocalStatus(selected.id, "replied");
      setTimeout(() => setAiStatus(null), 2400);

      // refresh list so status persists from DB
      await load();
    } catch (e: any) {
      setError(e?.message || "Could not send reply.");
    } finally {
      setSendingReply(false);
    }
  };

  const saveDraft = () => {
    if (!selected) {
      setAiStatus("Select an inbox item first.");
      setTimeout(() => setAiStatus(null), 2000);
      return;
    }
    const text = (replyDraft || "").trim();
    if (!text) {
      setAiStatus("Nothing to save yet — generate or type a draft first.");
      setTimeout(() => setAiStatus(null), 2400);
      return;
    }

    const d: SavedDraft = {
      id: `draft_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      inboxItemId: selected.id,
      createdAt: new Date().toISOString(),
      text,
      platform: selected.platform,
      authorName: selected.authorName || null,
      snippet: makeSnippet(text, 90),
    };

    const next = [d, ...savedDrafts];
    setSavedDrafts(next);
    writeSavedDrafts(next);

    setAiStatus("Saved.");
    setTimeout(() => setAiStatus(null), 1600);
  };

  const loadSavedDraft = (d: SavedDraft) => {
    setReplyDraft(d.text);
    setShowSaved(false);
    setAiStatus("Loaded saved draft.");
    setTimeout(() => setAiStatus(null), 1600);
  };

  const deleteSavedDraft = (id: string) => {
    const next = savedDrafts.filter((d) => d.id !== id);
    setSavedDrafts(next);
    writeSavedDrafts(next);
  };

  const clearDraft = () => {
    setReplyDraft("");
    setAiStatus("Cleared draft.");
    setTimeout(() => setAiStatus(null), 1400);
  };

  const markNeedsReply = () => {
    if (!selected) return;
    setLocalStatus(selected.id, "needs_reply");
    setAiStatus("Marked as needs reply.");
    setTimeout(() => setAiStatus(null), 1800);
  };

  const savedForSelected = useMemo(() => {
    if (!selected) return [];
    return savedDrafts.filter((d) => d.inboxItemId === selected.id);
  }, [savedDrafts, selected]);

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
              Responses
            </h1>
            <p className="mt-2 text-sm text-slate-300 max-w-2xl">
              Your inbox for comments and messages — pull latest, reply inside the dashboard.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold text-slate-200">
              All: {counts.total}
            </span>
            <span className="inline-flex items-center rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-[11px] font-semibold text-amber-100">
              Unread: {counts.unread}
            </span>
            <span className="inline-flex items-center rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-[11px] font-semibold text-amber-100">
              Needs reply: {counts.needs_reply}
            </span>
            <span className="inline-flex items-center rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-[11px] font-semibold text-emerald-100">
              Replied: {counts.replied}
            </span>

            <button
              type="button"
              onClick={pullLatest}
              disabled={pulling}
              className="rounded-2xl bg-emerald-500 px-3 py-2 text-xs font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-60 disabled:cursor-not-allowed transition"
            >
              {pulling ? "Pulling…" : "Pull latest"}
            </button>

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
              <div className="mt-1 text-xs text-slate-300">
                Pull latest to fetch real comments. Refresh just reloads what’s already stored.
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
              <input
                className="w-full sm:w-[340px] rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-50 placeholder:text-slate-500 outline-none focus:border-emerald-400/50 focus:ring-1 focus:ring-emerald-400/30"
                placeholder="Search…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />

              <select
                className="rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none"
                value={platformFilter}
                onChange={(e) => setPlatformFilter(e.target.value as any)}
              >
                <option className="bg-slate-950 text-slate-100" value="all">
                  All platforms
                </option>
                <option className="bg-slate-950 text-slate-100" value="facebook">
                  Facebook
                </option>
                <option className="bg-slate-950 text-slate-100" value="instagram">
                  Instagram
                </option>
                <option className="bg-slate-950 text-slate-100" value="linkedin">
                  LinkedIn
                </option>
                <option className="bg-slate-950 text-slate-100" value="threads">
                  Threads
                </option>
                <option className="bg-slate-950 text-slate-100" value="tiktok">
                  TikTok
                </option>
                <option className="bg-slate-950 text-slate-100" value="reddit">
                  Reddit
                </option>
              </select>

              <select
                className="rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
              >
                <option className="bg-slate-950 text-slate-100" value="all">
                  All statuses
                </option>
                <option className="bg-slate-950 text-slate-100" value="unread">
                  Unread
                </option>
                <option className="bg-slate-950 text-slate-100" value="needs_reply">
                  Needs reply
                </option>
                <option className="bg-slate-950 text-slate-100" value="replied">
                  Replied
                </option>
                <option className="bg-slate-950 text-slate-100" value="archived">
                  Archived
                </option>
              </select>
            </div>
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

          {!configured && (
            <div className="mt-3 text-[11px] text-amber-200">
              If you just created the table: hit <b>Pull latest</b> first.
            </div>
          )}
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-3">
            {!loading && filtered.length === 0 ? (
              <div className="rounded-3xl border border-white/10 bg-white/5 p-6 text-sm text-slate-300">
                No items found. Hit <b>Pull latest</b> to fetch comments into your inbox.
              </div>
            ) : (
              filtered.map((it) => (
                <button
                  key={it.id}
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    if (typeof window !== "undefined") listScrollYRef.current = window.scrollY || 0;
                    setSelectedId(it.id);
                  }}
                  className={[
                    "w-full text-left rounded-2xl border p-4 transition",
                    it.id === selectedId
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

                    <span
                      className={[
                        "inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-semibold",
                        statusTone(it.status) === "good"
                          ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-100"
                          : statusTone(it.status) === "warn"
                          ? "border-amber-400/30 bg-amber-400/10 text-amber-100"
                          : "border-white/10 bg-white/5 text-slate-200",
                      ].join(" ")}
                    >
                      {it.status === "needs_reply"
                        ? "needs reply"
                        : it.status === "unread"
                        ? "unread"
                        : it.status === "replied"
                        ? "replied"
                        : it.status}
                    </span>
                  </div>

                  <div className="mt-2 text-xs text-slate-400">
                    {safeDate(it.createdAt)}
                    {it.authorName || it.authorHandle ? (
                      <>
                        {" "}
                        ·{" "}
                        <span className="text-slate-300">
                          {it.authorName || it.authorHandle}
                          {it.authorHandle && it.authorName ? ` (${it.authorHandle})` : ""}
                        </span>
                      </>
                    ) : null}
                  </div>

                  <div className="mt-3 text-sm text-slate-100 line-clamp-3 whitespace-pre-wrap">
                    {it.text || "(empty)"}
                  </div>
                </button>
              ))
            )}
          </div>

          <div className="space-y-6">
            <div className="rounded-3xl border border-white/10 bg-white/5 shadow-[0_20px_60px_rgba(0,0,0,0.35)] backdrop-blur-xl p-6">
              <div>
                <div className="text-base font-semibold">Reply assistant</div>
                <div className="mt-1 text-xs text-slate-300">
                  AI draft → edit → Send reply (Facebook/Instagram).
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
                      <span
                        className={[
                          "inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-semibold",
                          statusTone(selected.status) === "good"
                            ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-100"
                            : statusTone(selected.status) === "warn"
                            ? "border-amber-400/30 bg-amber-400/10 text-amber-100"
                            : "border-white/10 bg-white/5 text-slate-200",
                        ].join(" ")}
                      >
                        {selected.status}
                      </span>
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

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={runAiSuggest}
                      className="rounded-2xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-slate-950 hover:bg-emerald-400 transition"
                    >
                      AI Suggest
                    </button>

                    <button
                      type="button"
                      onClick={sendReply}
                      disabled={sendingReply || !replyDraft.trim()}
                      className="rounded-2xl bg-blue-500 px-4 py-3 text-sm font-semibold text-slate-50 hover:bg-blue-400 disabled:opacity-60 disabled:cursor-not-allowed transition"
                    >
                      {sendingReply ? "Sending…" : "Send reply"}
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={copyDraft}
                      disabled={!replyDraft.trim()}
                      className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-slate-100 hover:bg-white/10 disabled:opacity-60 disabled:cursor-not-allowed transition"
                    >
                      {copied ? "Copied" : "Copy"}
                    </button>

                    <button
                      type="button"
                      onClick={saveDraft}
                      disabled={!replyDraft.trim()}
                      className="rounded-2xl border border-emerald-300/30 bg-emerald-300/10 px-4 py-3 text-sm font-semibold text-emerald-50 hover:bg-emerald-300/15 disabled:opacity-60 disabled:cursor-not-allowed transition"
                    >
                      Save draft
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={clearDraft}
                      className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-slate-100 hover:bg-white/10 transition"
                    >
                      Clear
                    </button>

                    <button
                      type="button"
                      onClick={markNeedsReply}
                      className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-slate-100 hover:bg-white/10 transition"
                    >
                      Mark needs reply
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowSaved(true)}
                    className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-slate-100 hover:bg-white/10 transition"
                  >
                    View saved{savedForSelected.length > 0 ? ` (${savedForSelected.length})` : ""}
                  </button>

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
          </div>
        </div>
      </div>

      {showSaved && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm">
          <div className="mx-auto mt-10 w-[95%] max-w-3xl rounded-3xl border border-white/10 bg-slate-950 p-6 shadow-[0_30px_100px_rgba(0,0,0,0.6)]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-lg font-semibold">Saved drafts</div>
                <div className="mt-1 text-xs text-slate-400">
                  Stored in your browser (localStorage). These won’t sync across devices yet.
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowSaved(false)}
                className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-100 hover:bg-white/10 transition"
              >
                Close
              </button>
            </div>

            <div className="mt-5 space-y-3 max-h-[70vh] overflow-auto pr-1">
              {selected ? (
                <div className="text-xs text-slate-300">
                  Showing drafts saved for this item:{" "}
                  <span className="text-slate-100 font-semibold">{selected.id}</span>
                </div>
              ) : (
                <div className="text-xs text-slate-300">Select an inbox item to view drafts.</div>
              )}

              {selected && savedForSelected.length === 0 ? (
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
                  No saved drafts for this item yet.
                </div>
              ) : null}

              {selected &&
                savedForSelected.map((d) => (
                  <div key={d.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-xs text-slate-300">
                        {safeDate(d.createdAt)} ·{" "}
                        <span className="text-slate-100 font-semibold">
                          {PLATFORM_LABEL[d.platform]}
                        </span>
                        {d.authorName ? <span className="text-slate-400"> · {d.authorName}</span> : null}
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => loadSavedDraft(d)}
                          className="rounded-xl bg-emerald-500 px-3 py-2 text-xs font-semibold text-slate-950 hover:bg-emerald-400 transition"
                        >
                          Load
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteSavedDraft(d.id)}
                          className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-100 hover:bg-white/10 transition"
                        >
                          Delete
                        </button>
                      </div>
                    </div>

                    <div className="mt-3 text-sm text-slate-100 whitespace-pre-wrap">{d.text}</div>
                  </div>
                ))}
            </div>

            <div className="mt-5 text-[11px] text-slate-500">
              Tip: If AI outputs “posting” language again, hit <b>Clear</b> and regenerate.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
