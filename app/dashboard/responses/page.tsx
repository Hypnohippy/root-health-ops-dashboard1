// app/dashboard/responses/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";

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

// Internal only. Not shown in UI.
const ORG_ID = "23a054db-7040-40b1-b193-2f43cfa139de";

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

function nextSuggestedStatus(s: InboxStatus): InboxStatus {
  if (s === "unread") return "needs_reply";
  if (s === "needs_reply") return "replied";
  if (s === "replied") return "archived";
  return "unread";
}

export default function ResponsesPage() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [configured, setConfigured] = useState<boolean>(false);

  const [items, setItems] = useState<InboxItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // UX controls
  const [query, setQuery] = useState("");
  const [platformFilter, setPlatformFilter] = useState<InboxPlatform | "all">(
    "all"
  );
  const [statusFilter, setStatusFilter] = useState<InboxStatus | "all">("all");

  // Manual add form
  const [addOpen, setAddOpen] = useState(false);
  const [addPlatform, setAddPlatform] = useState<InboxPlatform>("linkedin");
  const [addStatus, setAddStatus] = useState<Exclude<InboxStatus, "unknown">>(
    "needs_reply"
  );
  const [addAuthor, setAddAuthor] = useState("");
  const [addPermalink, setAddPermalink] = useState("");
  const [addText, setAddText] = useState("");
  const [adding, setAdding] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/responses/list?organisationId=${encodeURIComponent(ORG_ID)}`,
        { method: "GET" }
      );
      const data: ApiResponse = await res.json().catch(() => ({
        success: false,
      }));

      if (!res.ok || data?.success === false) {
        throw new Error(
          data?.error || `Failed to load inbox (HTTP ${res.status}).`
        );
      }

      const nextItems = Array.isArray(data?.items) ? data.items : [];
      setItems(nextItems);

      if (selectedId && !nextItems.some((x) => x.id === selectedId)) {
        setSelectedId(null);
      }

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
      if (platformFilter !== "all" && it.platform !== platformFilter)
        return false;
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
      archived: 0,
    };

    for (const it of items) {
      if (it.status === "unread") c.unread++;
      if (it.status === "needs_reply") c.needs_reply++;
      if (it.status === "replied") c.replied++;
      if (it.status === "archived") c.archived++;
    }
    return c;
  }, [items]);

  const selected = useMemo(() => {
    return filtered.find((x) => x.id === selectedId) || null;
  }, [filtered, selectedId]);

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
              : it.status === "archived"
              ? "archived"
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

  const createManualItem = async () => {
    setAdding(true);
    setError(null);
    setNote(null);

    try {
      const text = addText.trim();
      if (!text) throw new Error("Please paste the comment text.");

      const res = await fetch("/api/responses/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organisationId: ORG_ID,
          platform: addPlatform,
          status: addStatus,
          authorName: addAuthor.trim() || null,
          permalink: addPermalink.trim() || null,
          text,
          createdAt: new Date().toISOString(),
          raw: {
            source: "manual_capture",
          },
        }),
      });

      const data: any = await res.json().catch(() => ({}));
      if (!res.ok || data?.success === false) {
        throw new Error(data?.error || `Failed to add item (HTTP ${res.status}).`);
      }

      setAddText("");
      setAddAuthor("");
      setAddPermalink("");
      setAddOpen(false);

      setNote("Saved to inbox. (Manual capture — provider sync is plan-gated.)");
      await load();
    } catch (e: any) {
      setError(e?.message || "Could not add inbox item.");
    } finally {
      setAdding(false);
    }
  };

  const updateStatus = async (id: string, status: Exclude<InboxStatus, "unknown">) => {
    setError(null);
    setNote(null);

    try {
      const res = await fetch("/api/responses/update-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organisationId: ORG_ID,
          id,
          status,
        }),
      });

      const data: any = await res.json().catch(() => ({}));
      if (!res.ok || data?.success === false) {
        throw new Error(data?.error || `Failed to update status (HTTP ${res.status}).`);
      }

      setNote(`Updated status to: ${status}`);
      await load();
    } catch (e: any) {
      setError(e?.message || "Could not update status.");
    }
  };

  const PrimaryBtn = ({
    children,
    onClick,
    disabled,
    className = "",
  }: {
    children: React.ReactNode;
    onClick: () => void;
    disabled?: boolean;
    className?: string;
  }) => (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        "inline-flex items-center justify-center rounded-2xl bg-emerald-500 px-4 py-2 text-xs font-semibold text-slate-950 shadow-[0_12px_30px_rgba(16,185,129,0.25)] hover:bg-emerald-400 disabled:opacity-60 disabled:cursor-not-allowed transition",
        className,
      ].join(" ")}
    >
      {children}
    </button>
  );

  const SoftBtn = ({
    children,
    onClick,
    disabled,
    className = "",
  }: {
    children: React.ReactNode;
    onClick: () => void;
    disabled?: boolean;
    className?: string;
  }) => (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        "inline-flex items-center justify-center rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-slate-100 hover:bg-white/10 disabled:opacity-60 disabled:cursor-not-allowed transition",
        className,
      ].join(" ")}
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

      {/* Manual add modal */}
      {addOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-xl rounded-3xl border border-white/10 bg-slate-950/80 backdrop-blur-xl p-5 shadow-[0_30px_80px_rgba(0,0,0,0.5)]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-lg font-semibold">Add inbox item</div>
                <div className="mt-1 text-xs text-slate-300">
                  Manual capture (because provider responses are plan-gated). Paste the comment and optional link.
                </div>
              </div>
              <SoftBtn onClick={() => setAddOpen(false)}>Close</SoftBtn>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div>
                <div className="text-[11px] uppercase tracking-wide text-slate-400">
                  Platform
                </div>
                <select
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-100 outline-none"
                  value={addPlatform}
                  onChange={(e) => setAddPlatform(e.target.value as any)}
                >
                  <option value="linkedin">LinkedIn</option>
                  <option value="facebook">Facebook</option>
                  <option value="instagram">Instagram</option>
                  <option value="threads">Threads</option>
                  <option value="tiktok">TikTok</option>
                  <option value="reddit">Reddit</option>
                  <option value="unknown">Unknown</option>
                </select>
              </div>

              <div>
                <div className="text-[11px] uppercase tracking-wide text-slate-400">
                  Status
                </div>
                <select
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-100 outline-none"
                  value={addStatus}
                  onChange={(e) => setAddStatus(e.target.value as any)}
                >
                  <option value="unread">Unread</option>
                  <option value="needs_reply">Needs reply</option>
                  <option value="replied">Replied</option>
                  <option value="archived">Archived</option>
                </select>
              </div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div>
                <div className="text-[11px] uppercase tracking-wide text-slate-400">
                  Author (optional)
                </div>
                <input
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-50 placeholder:text-slate-500 outline-none"
                  placeholder="e.g. Jane Smith"
                  value={addAuthor}
                  onChange={(e) => setAddAuthor(e.target.value)}
                />
              </div>

              <div>
                <div className="text-[11px] uppercase tracking-wide text-slate-400">
                  Permalink (optional)
                </div>
                <input
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-50 placeholder:text-slate-500 outline-none"
                  placeholder="Paste the LinkedIn comment URL…"
                  value={addPermalink}
                  onChange={(e) => setAddPermalink(e.target.value)}
                />
              </div>
            </div>

            <div className="mt-4">
              <div className="text-[11px] uppercase tracking-wide text-slate-400">
                Comment text (required)
              </div>
              <textarea
                className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-50 placeholder:text-slate-500 outline-none min-h-[140px]"
                placeholder="Paste the comment here…"
                value={addText}
                onChange={(e) => setAddText(e.target.value)}
              />
            </div>

            <div className="mt-4 flex gap-2">
              <SoftBtn onClick={() => setAddOpen(false)} disabled={adding} className="flex-1">
                Cancel
              </SoftBtn>
              <PrimaryBtn onClick={createManualItem} disabled={adding || !addText.trim()} className="flex-1">
                {adding ? "Saving…" : "Save to inbox"}
              </PrimaryBtn>
            </div>
          </div>
        </div>
      )}

      <div className="relative mx-auto w-full max-w-6xl px-4 py-10 space-y-8">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">
              Responses
            </h1>
            <p className="mt-2 text-sm text-slate-300 max-w-2xl">
              This is your inbox for comments, mentions, and messages — separate
              from Scheduled so we don’t mix planning with community management.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Pill>All: {counts.total}</Pill>
            <Pill tone="warn">Unread: {counts.unread}</Pill>
            <Pill tone="warn">Needs reply: {counts.needs_reply}</Pill>
            <Pill tone="good">Replied: {counts.replied}</Pill>

            <PrimaryBtn onClick={() => setAddOpen(true)} disabled={loading || refreshing}>
              Add item
            </PrimaryBtn>

            <SoftBtn onClick={refresh} disabled={refreshing || loading}>
              {refreshing ? "Refreshing…" : "Refresh"}
            </SoftBtn>
          </div>
        </div>

        <GlassCard className="p-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <div className="text-base font-semibold">Search & filters</div>
              <div className="mt-1 text-xs text-slate-300">
                Find what needs action fast. (Provider sync will come later on paid plan.)
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
              <div className="text-base font-semibold">Triage</div>
              <div className="mt-1 text-xs text-slate-300">
                This is the enterprise-safe workflow: track what needs a reply, and what’s done.
              </div>

              {!selected ? (
                <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-slate-300">
                  Select an item from the left to see actions here.
                </div>
              ) : (
                <div className="mt-4 space-y-3">
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
                      {selected.authorName ? (
                        <>
                          {" "}
                          · <span className="text-slate-300">{selected.authorName}</span>
                        </>
                      ) : null}
                    </div>

                    <div className="mt-3 text-sm whitespace-pre-wrap">
                      {selected.text}
                    </div>

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

                  <div className="grid gap-2">
                    <PrimaryBtn
                      onClick={() =>
                        updateStatus(
                          selected.id,
                          nextSuggestedStatus(selected.status) as any
                        )
                      }
                      disabled={selected.status === "unknown"}
                    >
                      Mark as: {nextSuggestedStatus(selected.status)}
                    </PrimaryBtn>

                    <div className="grid grid-cols-2 gap-2">
                      <SoftBtn onClick={() => updateStatus(selected.id, "unread")}>
                        Unread
                      </SoftBtn>
                      <SoftBtn onClick={() => updateStatus(selected.id, "needs_reply")}>
                        Needs reply
                      </SoftBtn>
                      <SoftBtn onClick={() => updateStatus(selected.id, "replied")}>
                        Replied
                      </SoftBtn>
                      <SoftBtn onClick={() => updateStatus(selected.id, "archived")}>
                        Archived
                      </SoftBtn>
                    </div>
                  </div>

                  {!configured && (
                    <div className="rounded-2xl border border-amber-400/30 bg-amber-400/10 p-4 text-sm text-amber-100 whitespace-pre-wrap">
                      Provider responses are plan-gated. This inbox works today via manual capture, and later we can turn on automatic sync when you upgrade.
                    </div>
                  )}
                </div>
              )}
            </GlassCard>

            <GlassCard className="p-6">
              <div className="text-base font-semibold">Enterprise safety</div>
              <div className="mt-2 text-sm text-slate-300 whitespace-pre-wrap">
                • No organisation IDs are shown.{"\n"}• Inbox is separate from Scheduled (planning vs responding).{"\n"}• Next step: permissions + audit trail (who replied, when).
              </div>
            </GlassCard>
          </div>
        </div>
      </div>
    </div>
  );
}
