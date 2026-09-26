// app/dashboard/responses/page.tsx
"use client";

import ResponseLifecycleDetails from "./ResponseLifecycleDetails";
import type { ResponseLifecycle } from "@/lib/responseLifecycle";
import { tenantFetch } from "@/lib/tenantFetch";

import React, { useEffect, useMemo, useRef, useState } from "react";

type InboxPlatform =
  | "facebook"
  | "instagram"
  | "linkedin"
  | "threads"
  | "tiktok"
  | "reddit"
  | "email"
  | "unknown";

type InboxStatus = "unread" | "needs_reply" | "replied" | "archived" | "unknown";

type InboxItem = {
  id: string;
  lifecycle?: ResponseLifecycle | null;
  platform: InboxPlatform;
  status: InboxStatus;

  authorName?: string | null;
  authorHandle?: string | null;

  kind?: "comment" | "dm" | "mention" | "reaction" | "email_reply" | "connection_accepted" | "unknown";
  text: string;

  permalink?: string | null;
  linkedinMessageUrl?: string | null;

  createdAt: string;

  postText?: string | null;
  postId?: string | null;

  // ✅ needed to reply
  externalId?: string | null;
  emailClassification?: string | null;
  responseState?: string | null;
  emailThreadId?: string | null;
  outreachReference?: string | null;
  senderEmail?: string | null;
  subject?: string | null;
  followUpAt?: string | null;
  proposedResponse?: string | null;
  emailReplyDraft?: string | null;
  emailDeliveryStatus?: string | null;
  emailSentMessageId?: string | null;
  emailSentThreadId?: string | null;
  emailSentAt?: string | null;
};

type ContactBriefing = {
  interactionType: string; messageType: string; name:string|null; role:string|null; company:string|null; sector:string|null;
  source:string; whyRelevant:string; relationship:string; latestEvent:string; whatWeKnow:string[]; history:string[];
  lifecycle?: ResponseLifecycle;
  lastAction:string|null; currentStage:string|null; buyingSignalLabel:string; objective:string;
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

const PLATFORM_LABEL: Record<InboxPlatform, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  linkedin: "LinkedIn",
  threads: "Threads",
  tiktok: "TikTok",
  reddit: "Reddit",
  email: "Email",
  unknown: "Unknown",
};

const PLATFORM_DOT: Record<InboxPlatform, string> = {
  facebook: "bg-[#1877F2]",
  linkedin: "bg-sky-500",
  instagram: "bg-pink-500",
  threads: "bg-white",
  tiktok: "bg-slate-200",
  reddit: "bg-orange-400",
  email: "bg-violet-400",
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

function makeSnippet(s: string, max = 80) {
  const t = (s || "").replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return t.slice(0, max) + "…";
}

/** ✅ Detect “system helper / ops UI” responses that are NOT paste-ready replies */
const isLinkedInAcceptance = (item?: InboxItem | null) => item?.platform === "linkedin" && item.kind === "connection_accepted";
const customerStatus = (item: InboxItem) => item.lifecycle?.label || "State unavailable";
const responseFilterStatus = (item: InboxItem): InboxStatus => {
  const lifecycle = item.lifecycle;
  if (!lifecycle) return "unknown";
  if (lifecycle.humanActionRequired && lifecycle.currentStage !== "outreach_ready") return "needs_reply";
  if (["converted", "lost", "dismissed", "no_reply_needed"].includes(lifecycle.currentStage)) return "archived";
  if (lifecycle.currentStage === "outreach_ready") return "unread";
  return lifecycle.humanActionRequired ? "needs_reply" : "replied";
};


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



export default function ResponsesPage() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [sendingReply, setSendingReply] = useState(false);
  const [emailActionBusy, setEmailActionBusy] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [configured, setConfigured] = useState<boolean>(false);

  const [items, setItems] = useState<InboxItem[]>([]);
  const [organisationId, setOrganisationId] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [platformFilter, setPlatformFilter] = useState<InboxPlatform | "all">(() => (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("platform") as InboxPlatform) || "all");
  const [statusFilter, setStatusFilter] = useState<InboxStatus | "all">(() => (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("status") as InboxStatus) || "all");
  const [kindFilter] = useState(() => typeof window === "undefined" ? "" : new URLSearchParams(window.location.search).get("kind") || "");

  const [selectedId, setSelectedId] = useState<string | null>(() => typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("itemId"));

  const [replyDraft, setReplyDraft] = useState("");
  const [aiStatus, setAiStatus] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [contactContext, setContactContext] = useState<ContactBriefing | null>(null);
  const [contextLoading, setContextLoading] = useState(false);

  // Saved drafts
  const [savedDrafts, setSavedDrafts] = useState<SavedDraft[]>([]);
  const [showSaved, setShowSaved] = useState(false);

  // Prevent jump-to-top on select
  const listScrollYRef = useRef<number>(0);

  useEffect(() => {
    setSavedDrafts(readSavedDrafts());

  }, []);

  const resolveOrg = async () => {
    const res = await tenantFetch("/api/social-accounts", { method: "GET" });
    const data = await res.json().catch(() => null);

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

      const itemId = new URLSearchParams(window.location.search).get("itemId");
      const res = await fetch(`/api/responses/list?organisationId=${encodeURIComponent(org)}${itemId ? `&itemId=${encodeURIComponent(itemId)}` : ""}`, {
        method: "GET",
        cache: "no-store",
      });

      const data: ApiResponse = await res.json().catch(() => ({ success: false }));

      if (!res.ok || data?.success === false) {
        throw new Error(data?.error || `Failed to load inbox (HTTP ${res.status}).`);
      }

      const rows = Array.isArray(data?.items) ? data.items : [];
      setItems(rows);
      setNote(typeof data?.note === "string" ? data.note : null);
      setConfigured(Boolean(data?.configured));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load responses inbox.");
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

      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || `Pull failed (HTTP ${res.status}).`);
      }

      setAiStatus(`Pulled ${data?.pulled || 0} item(s). Refreshing list…`);
      await load();
      setTimeout(() => setAiStatus(null), 2600);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not pull latest comments.");
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
      if (statusFilter !== "all" && responseFilterStatus(it) !== statusFilter) return false;
      if (kindFilter && it.kind !== kindFilter) return false;
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
  }, [items, query, platformFilter, statusFilter, kindFilter]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {
      total: items.length,
      unread: 0,
      needs_reply: 0,
      replied: 0,
    };
    for (const it of items) {
      if (responseFilterStatus(it) === "unread") c.unread++;
      if (responseFilterStatus(it) === "needs_reply") c.needs_reply++;
      if (responseFilterStatus(it) === "replied") c.replied++;
    }
    return c;
  }, [items]);

  const selected = useMemo(() => {
    return filtered.find((x) => x.id === selectedId) || null;
  }, [filtered, selectedId]);

  useEffect(() => {
    const item = items.find((candidate) => candidate.id === selectedId);
    setReplyDraft(item?.platform === "email" ? item.emailReplyDraft || item.proposedResponse || "" : "");
    setAiStatus(null);
    setCopied(false);
    // The selected ID is the intentional reset boundary; list refreshes must not overwrite active edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  useEffect(() => {
    if (!selectedId || !organisationId) { setContactContext(null); return; }
    const controller = new AbortController(); setContextLoading(true); setContactContext(null);
    fetch(`/api/responses/${encodeURIComponent(selectedId)}/context?organisationId=${encodeURIComponent(organisationId)}`, { cache:"no-store", signal:controller.signal })
      .then(async response => { const data = await response.json(); if (!controller.signal.aborted && response.ok && data.context) setContactContext(data.context); })
      .catch(() => undefined).finally(() => { if (!controller.signal.aborted) setContextLoading(false); });
    return () => controller.abort();
  }, [selectedId, organisationId, items]);

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

  const selectionRef = useRef("");
  selectionRef.current = `${organisationId}:${selectedId}`;

  async function runAiSuggest() {
    if (!selected?.lifecycle?.canDraft) return;
    const selection = selectionRef.current;
    setAiStatus("Drafting for the current lifecycle…");
    setCopied(false);
    setReplyDraft("");
    try {
      const res = await tenantFetch("/api/ai/root-coach", {
        method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store",
        body: JSON.stringify({ organisationId, context: "responses_lifecycle_draft_v1", inboxItemId: selected.id, requestedLifecycleDraft: true }),
      });
      const data = await res.json();
      if (selectionRef.current !== selection) return;
      if (!res.ok) {
        setAiStatus(data.error || "The current lifecycle does not permit this draft.");
        await load();
        return;
      }
      if (!data.coachMessage || typeof data.coachMessage !== "string") throw new Error("No draft returned.");
      setReplyDraft(data.coachMessage);
      setAiStatus("Draft ready for review. Nothing has been sent.");
    } catch { if (selectionRef.current !== selection) return; setAiStatus("Unable to verify and draft for the current lifecycle. Refresh before trying again."); }
  }

  const copyDraft = async () => {
    try {
      if (!selected) return;
      if (!replyDraft.trim()) return;

      await navigator.clipboard.writeText(replyDraft);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);

      // Copying is not evidence of contact or sending.
    } catch {
      setCopied(false);
    }
  };

  const sendReply = async () => {
    if (!selected?.lifecycle?.canDraft) return;
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

      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || `Reply failed (HTTP ${res.status}).`);
      }

      setAiStatus("Reply sent ✅");

      setTimeout(() => setAiStatus(null), 2400);

      // refresh list so status persists from DB
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send reply.");
    } finally {
      setSendingReply(false);
    }
  };

  const saveDraft = async () => {
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

    if (selected.platform === "email") {
      setEmailActionBusy(true); setError(null);
      try {
        const org = organisationId || (await resolveOrg());
        const res = await fetch(`/api/responses/email/${encodeURIComponent(selected.id)}/draft`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ organisationId: org, draft: text }) });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error || "Could not save email draft.");
        setItems(prev => prev.map(item => item.id === selected.id ? { ...item, emailReplyDraft: text, emailDeliveryStatus: "draft" } : item));
        setAiStatus("Draft saved in Ops"); setTimeout(() => setAiStatus(null), 2000);
      } catch (e) { setError(e instanceof Error ? e.message : "Could not save email draft."); }
      finally { setEmailActionBusy(false); }
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

  const markContacted = async () => {
    if (!selected?.lifecycle?.canMarkContacted) return;
    setAiStatus("Saving…");
    try {
      const org = organisationId || (await resolveOrg());
      const response = await fetch("/api/responses/update-status", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ organisationId: org, id: selected.id, status: "replied" }) });
      if (!response.ok) throw new Error("Unable to mark this contact as contacted.");
      setReplyDraft("");
      await load();
      setAiStatus("Marked as contacted. Lifecycle refreshed.");
    } catch (error) { setAiStatus(error instanceof Error ? error.message : "Unable to mark this contact as contacted."); }
  };

  const approveAndSendEmail = async () => {
    if (!selected || selected.platform !== "email" || !selected.lifecycle?.canDraft) return;
    const approvedBody = replyDraft.trim();
    if (!approvedBody) { setAiStatus("Type or load a response before approval."); return; }
    setEmailActionBusy(true); setError(null);
    try {
      const org = organisationId || (await resolveOrg());
      const res = await fetch(`/api/responses/email/${encodeURIComponent(selected.id)}/approve-send`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ organisationId: org, approvedBody, idempotencyKey: crypto.randomUUID() }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "The B2B engine could not accept this email.");
      setAiStatus(data.status === "sent" ? "Email already sent." : "Approved text sent securely to the B2B engine. Waiting for delivery acknowledgement.");
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not approve email sending."); }
    finally { setEmailActionBusy(false); }
  };

  const applyEmailAction = async (action: string) => {
    if (!selected || selected.platform !== "email") return;
    let followUpAt: string | null = null;
    if (action === "set_follow_up") {
      followUpAt = window.prompt("Follow-up date (YYYY-MM-DD):");
      if (!followUpAt) return;
    }
    setEmailActionBusy(true); setError(null);
    try {
      const org = organisationId || (await resolveOrg());
      const res = await fetch(`/api/responses/email/${encodeURIComponent(selected.id)}/action`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organisationId: org, action, followUpAt, idempotencyKey: crypto.randomUUID() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Could not update email response.");
      setAiStatus("Email response updated."); await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not update email response."); }
    finally { setEmailActionBusy(false); }
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
              Your inbox for social activity and imported outreach email replies.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold text-slate-200">
              All: {counts.total}
            </span>
            <span className="inline-flex items-center rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-[11px] font-semibold text-amber-100">
              First messages: {counts.unread}
            </span>
            <span className="inline-flex items-center rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-[11px] font-semibold text-amber-100">
              Needs action: {counts.needs_reply}
            </span>
            <span className="inline-flex items-center rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-[11px] font-semibold text-emerald-100">
              Waiting / handled: {counts.replied}
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
                onChange={(e) => setPlatformFilter(e.target.value as InboxPlatform | "all")}
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
                <option className="bg-slate-950 text-slate-100" value="email">
                  Email
                </option>
              </select>

              <select
                className="rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as InboxStatus | "all")}
              >
                <option className="bg-slate-950 text-slate-100" value="all">
                  All statuses
                </option>
                <option className="bg-slate-950 text-slate-100" value="unread">
                  First message opportunities
                </option>
                <option className="bg-slate-950 text-slate-100" value="needs_reply">
                  Needs action
                </option>
                <option className="bg-slate-950 text-slate-100" value="replied">
                  Waiting / handled
                </option>
                <option className="bg-slate-950 text-slate-100" value="archived">
                  Closed / no action due
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
                No items found. Pull latest fetches connected social comments; email replies arrive through the secure intake.
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
                        statusTone(responseFilterStatus(it)) === "good"
                          ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-100"
                          : statusTone(responseFilterStatus(it)) === "warn"
                          ? "border-amber-400/30 bg-amber-400/10 text-amber-100"
                          : "border-white/10 bg-white/5 text-slate-200",
                      ].join(" ")}
                    >
                      {customerStatus(it)}
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
                  <ResponseLifecycleDetails lifecycle={it.lifecycle} compact />
                  {it.platform === "email" && it.emailClassification ? <div className="mt-2 text-[11px] text-violet-200">{it.emailClassification.replaceAll("_", " ")} · {it.lifecycle?.label || "State unavailable"}</div> : null}
                </button>
              ))
            )}
          </div>

          <div className="space-y-6">
            <div className="rounded-3xl border border-white/10 bg-white/5 shadow-[0_20px_60px_rgba(0,0,0,0.35)] backdrop-blur-xl p-6">
              <div>
                <div className="text-base font-semibold">{selected?.lifecycle?.label || "Response assistant"}</div>
                <div className="mt-1 text-xs text-slate-300">
                  {selected?.platform === "email"
                    ? "Edit and approve here. The existing B2B engine sends the exact approved text through Gmail."
                    : selected?.lifecycle?.canMarkContacted
                      ? "AI Suggest → edit → Copy or open LinkedIn. Nothing is sent automatically."
                      : "AI draft → edit → Send reply (Facebook/Instagram)."}
                </div>
              </div>

              {!selected ? (
                <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-slate-300">
                  Select an item from the left to draft a message.
                </div>
              ) : (
                <div className="mt-4 space-y-4">
                  <section aria-label="Why this contact matters" className="rounded-2xl border border-sky-400/20 bg-sky-400/[0.07] p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-sm font-semibold text-white">Why this contact matters</h2>{contactContext?.messageType ? <Pill>{`Message type: ${contactContext.messageType}`}</Pill> : null}</div>
                    <ResponseLifecycleDetails lifecycle={selected.lifecycle} />
                    {contextLoading ? <p className="mt-3 text-sm text-slate-400">Loading contact context…</p> : contactContext ? <div className="mt-3 grid gap-3 text-sm text-slate-300">
                      <div><div className="text-xs font-semibold uppercase tracking-wide text-sky-200">Who</div><p className="mt-1 text-white">{[contactContext.name, contactContext.role, contactContext.company].filter(Boolean).join(" — ") || "Contact details are incomplete."}</p>{contactContext.sector ? <p className="mt-1 text-xs text-slate-400">Sector: {contactContext.sector}</p> : null}</div>
                      <div><div className="text-xs font-semibold uppercase tracking-wide text-sky-200">Why relevant</div><p className="mt-1">{contactContext.whyRelevant}</p><p className="mt-1 text-xs text-slate-400">{contactContext.buyingSignalLabel}</p></div>
                      <div><div className="text-xs font-semibold uppercase tracking-wide text-sky-200">Relationship</div><p className="mt-1">{contactContext.relationship}</p><p className="mt-1 text-xs text-slate-400">Source: {contactContext.source}{contactContext.currentStage ? ` · ${contactContext.currentStage}` : ""}</p></div>
                      {(contactContext.whatWeKnow.length > 0 || contactContext.history.length > 0) ? <details className="rounded-xl border border-white/10 bg-black/20 p-3"><summary className="cursor-pointer font-semibold text-slate-200">What we know and previous history</summary><ul className="mt-2 space-y-1 text-xs text-slate-400">{[...contactContext.whatWeKnow,...contactContext.history].map((entry,index)=><li key={`${index}-${entry}`}>• {entry}</li>)}</ul></details> : <p className="text-xs text-slate-400">No additional outreach history is recorded.</p>}
                      <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/[0.07] p-3"><div className="text-xs font-semibold uppercase tracking-wide text-emerald-200">Best next move</div><p className="mt-1 text-emerald-50">{contactContext.objective}</p></div>
                    </div> : <p className="mt-3 text-sm text-slate-400">The contact briefing could not be loaded. The selected event remains available below.</p>}
                  </section>
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
                          statusTone(responseFilterStatus(selected)) === "good"
                            ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-100"
                            : statusTone(responseFilterStatus(selected)) === "warn"
                            ? "border-amber-400/30 bg-amber-400/10 text-amber-100"
                            : "border-white/10 bg-white/5 text-slate-200",
                        ].join(" ")}
                      >
                        {customerStatus(selected)}
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
                  {selected.platform === "email" ? <div className="mt-3 rounded-xl border border-violet-300/20 bg-violet-300/10 p-3 text-xs"><div><b>Sender:</b> {selected.senderEmail || selected.authorHandle || "Unknown"}</div><div><b>Subject:</b> {selected.subject || "(no subject)"}</div><div><b>Classification:</b> {(selected.emailClassification || "unclassified").replaceAll("_", " ")}</div><div><b>State:</b> {selected.lifecycle?.label || "State unavailable"}</div>{selected.emailDeliveryStatus ? <div><b>Delivery:</b> {selected.emailDeliveryStatus.replaceAll("_", " ")}</div> : null}{selected.outreachReference ? <div><b>Outreach:</b> {selected.outreachReference}</div> : null}{selected.emailThreadId ? <div><b>Thread:</b> {selected.emailThreadId}</div> : <div><b>Thread:</b> unavailable — engine will send safely without threading if supported</div>}</div> : null}

                    {selected.permalink ? (
                      <div className="mt-3 flex flex-wrap gap-3 text-[11px]">
                        <a
                          href={selected.permalink}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sky-300 hover:text-sky-200 underline"
                        >
                          {isLinkedInAcceptance(selected) ? "Open LinkedIn" : "Open on platform"}
                        </a>
                        {isLinkedInAcceptance(selected) && selected.linkedinMessageUrl ? <a href={selected.linkedinMessageUrl} target="_blank" rel="noreferrer" className="text-emerald-300 hover:text-emerald-200 underline">Open LinkedIn Message</a> : null}
                      </div>
                    ) : null}
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={runAiSuggest}
                      disabled={!selected.lifecycle?.canDraft}
                      className="rounded-2xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-slate-950 hover:bg-emerald-400 transition"
                    >
                      {selected.lifecycle?.draftOnRequest ? "AI Suggest (on request)" : "AI Suggest"}
                    </button>

                    {selected.platform !== "email" && !isLinkedInAcceptance(selected) && <button
                      type="button"
                      onClick={sendReply}
                      disabled={sendingReply || !replyDraft.trim() || !selected.lifecycle?.canDraft}
                      className="rounded-2xl bg-blue-500 px-4 py-3 text-sm font-semibold text-slate-50 hover:bg-blue-400 disabled:opacity-60 disabled:cursor-not-allowed transition"
                    >
                      {sendingReply ? "Sending…" : "Send reply"}
                    </button>}
                    {selected.lifecycle?.canMarkContacted ? <button type="button" onClick={() => void markContacted()} className="rounded-2xl bg-sky-500 px-4 py-3 text-sm font-semibold text-white hover:bg-sky-400 transition">Mark Contacted</button> : null}
                  </div>

                  {selected.platform === "email" ? <div className="grid grid-cols-2 gap-2">
                    <button type="button" disabled={emailActionBusy || !replyDraft.trim() || !selected.lifecycle?.canDraft || selected.emailDeliveryStatus === "sent"} onClick={() => void approveAndSendEmail()} className="col-span-2 rounded-2xl bg-violet-500 px-4 py-3 text-sm font-semibold text-white hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-50">{emailActionBusy ? "Working…" : selected.emailDeliveryStatus === "sent" ? "Sent" : "Approve & Send"}</button>
                    {[["mark_no_reply","No reply needed"],["set_follow_up","Set follow-up"],["nurture","Nurture"],["closed_lost","Closed / lost"],["engaged","Engaged"],["converted","Converted"]].map(([id,label]) => <button key={id} type="button" disabled={emailActionBusy || ["converted", "lost", "dismissed"].includes(selected.lifecycle?.currentStage || "unknown")} onClick={() => void applyEmailAction(id)} className="rounded-2xl border border-violet-300/30 bg-violet-300/10 px-3 py-2 text-xs font-semibold disabled:opacity-50">{label}</button>)}
                  </div> : null}

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={copyDraft}
                      disabled={!replyDraft.trim() || !selected.lifecycle?.canDraft}
                      className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-slate-100 hover:bg-white/10 disabled:opacity-60 disabled:cursor-not-allowed transition"
                    >
                      {copied ? "Copied" : "Copy"}
                    </button>

                    <button
                      type="button"
                      onClick={() => void saveDraft()}
                      disabled={!replyDraft.trim() || !selected.lifecycle?.canDraft}
                      className="rounded-2xl border border-emerald-300/30 bg-emerald-300/10 px-4 py-3 text-sm font-semibold text-emerald-50 hover:bg-emerald-300/15 disabled:opacity-60 disabled:cursor-not-allowed transition"
                    >
                      Save draft
                    </button>
                  </div>

                  {selected.platform === "email" && selected.emailReplyDraft ? (
                    <div className={`text-xs font-medium ${replyDraft === selected.emailReplyDraft ? "text-emerald-300" : "text-amber-300"}`}>
                      {replyDraft === selected.emailReplyDraft ? "Saved in Ops" : "Unsaved changes"}
                    </div>
                  ) : null}

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={clearDraft}
                      className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-slate-100 hover:bg-white/10 transition"
                    >
                      Clear
                    </button>


                  </div>

                  {selected.platform !== "email" ? <button
                    type="button"
                    onClick={() => setShowSaved(true)}
                    className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-slate-100 hover:bg-white/10 transition"
                  >
                    View saved{savedForSelected.length > 0 ? ` (${savedForSelected.length})` : ""}
                  </button> : null}

                  {aiStatus && (
                    <div className="rounded-2xl border border-white/10 bg-black/20 p-3 text-xs text-slate-300 whitespace-pre-wrap">
                      {aiStatus}
                    </div>
                  )}

                  <textarea
                    className="w-full min-h-[180px] rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:border-emerald-400/50 focus:ring-1 focus:ring-emerald-400/30"
                    placeholder={selected.lifecycle?.canDraft ? "Your current-stage message draft will appear here…" : "No message due for this lifecycle state."}
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
