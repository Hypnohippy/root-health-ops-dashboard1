// app/dashboard/brainstorm/page.tsx
"use client";

import React, { useMemo, useRef, useState } from "react";
import ConnectedChannelsBar from "../components/ConnectedChannelsBar";

type ChannelId = "linkedin" | "facebook" | "instagram" | "reddit" | "tiktok";

type ChatMsg = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

type Draft = {
  title: string;
  text: string;
  cta: string;
  hashtags: string[];
  suggestedMode: "quick_blast" | "story_series";
  imageQuery: string;
};

type CommonsImage = {
  url: string;
  title: string;
  pageUrl: string;
  licenseShortName?: string;
  licenseUrl?: string;
  attribution?: string;
};

type BrainstormApiResponse = {
  success: boolean;
  assistantReply?: string;
  questions?: string[];
  angles?: string[];
  drafts?: Draft[];
  error?: string;
};

type CommonsApiResponse = {
  success: boolean;
  query?: string;
  image?: CommonsImage | null;
  error?: string;
};

const PREFILL_QUICKBLAST_KEY = "rootops_prefill_quickblast_v1";
const PREFILL_STORIES_KEY = "rootops_prefill_stories_v1";

function uid() {
  try {
    return crypto.randomUUID();
  } catch {
    return String(Date.now()) + "_" + Math.random().toString(16).slice(2);
  }
}

function joinDraft(d: Draft) {
  const hash = d.hashtags?.length ? `\n\n${d.hashtags.join(" ")}` : "";
  const cta = d.cta?.trim() ? `\n\n${d.cta.trim()}` : "";
  return `${(d.text || "").trim()}${cta}${hash}`.trim();
}

function safeUrl(u?: string | null) {
  const s = String(u || "").trim();
  if (!s) return "";
  if (!/^https?:\/\//i.test(s)) return "";
  return s;
}

// Adds tiny variance so “Find another” often returns a different file.
function variantQuery(base: string, attempt: number) {
  const q = (base || "").trim();
  if (!q) return q;

  const add = [
    "photo",
    "workplace",
    "desk",
    "sticky notes",
    "calendar",
    "brain",
    "focus",
    "neurodiversity",
    "meeting",
    "laptop",
  ];

  const pick = add[attempt % add.length];
  // If query already has the word, don’t spam it
  if (q.toLowerCase().includes(pick.toLowerCase())) return q;
  return `${q} ${pick}`.trim();
}

export default function BrainstormPage() {
  const [platform, setPlatform] = useState<ChannelId>("linkedin");
  const [tone, setTone] = useState<string>("Professional & confident");

  const [wantImages, setWantImages] = useState<boolean>(true);

  const [input, setInput] = useState<string>(
    "I want to do a post on the difficulties of ADHD in working life. Can you give me some ideas?"
  );

  const [chat, setChat] = useState<ChatMsg[]>([
    {
      id: uid(),
      role: "assistant",
      content:
        "Drop your idea in plain English. I’ll riff with you first (angles + hooks), then draft posts you can send into Quick Blast or Stories.",
    },
  ]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [angles, setAngles] = useState<string[]>([]);
  const [drafts, setDrafts] = useState<Draft[]>([]);

  // Image state per draft index
  const [draftImages, setDraftImages] = useState<Record<number, CommonsImage | null>>({});
  const [draftImageBusy, setDraftImageBusy] = useState<Record<number, boolean>>({});
  const [draftImageAttempts, setDraftImageAttempts] = useState<Record<number, number>>({});
  const [draftImageQueryEdits, setDraftImageQueryEdits] = useState<Record<number, string>>({});
  const [draftImageError, setDraftImageError] = useState<Record<number, string | null>>({});

  const bottomRef = useRef<HTMLDivElement | null>(null);

  const canSend = useMemo(() => !!input.trim() && !loading, [input, loading]);

  const scrollToBottom = () => {
    try {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    } catch {}
  };

  const fetchImageForDraft = async (idx: number, query: string) => {
    if (!wantImages) return;
    const q = (query || "").trim();
    if (!q) return;

    setDraftImageBusy((prev) => ({ ...prev, [idx]: true }));
    setDraftImageError((prev) => ({ ...prev, [idx]: null }));

    try {
      const res = await fetch(`/api/media/commons-image?q=${encodeURIComponent(q)}`, {
        cache: "no-store",
      });
      const data: CommonsApiResponse = await res.json().catch(() => null);
      const img = data?.success ? (data.image || null) : null;

      setDraftImages((prev) => ({ ...prev, [idx]: img }));

      if (!img) {
        setDraftImageError((prev) => ({
          ...prev,
          [idx]: "No image found quickly. Try tweaking the query words.",
        }));
      }
    } catch {
      setDraftImages((prev) => ({ ...prev, [idx]: null }));
      setDraftImageError((prev) => ({ ...prev, [idx]: "Image lookup failed. Try again." }));
    } finally {
      setDraftImageBusy((prev) => ({ ...prev, [idx]: false }));
    }
  };

  const findAnotherImage = async (idx: number) => {
    const base = (draftImageQueryEdits[idx] ?? drafts[idx]?.imageQuery ?? "").trim();
    const attempt = (draftImageAttempts[idx] ?? 0) + 1;
    setDraftImageAttempts((prev) => ({ ...prev, [idx]: attempt }));

    const q = variantQuery(base, attempt);
    setDraftImageQueryEdits((prev) => ({ ...prev, [idx]: q })); // keep what we searched
    await fetchImageForDraft(idx, q);
  };

  const send = async () => {
    setError(null);
    const msg = input.trim();
    if (!msg) return;

    setChat((prev) => [...prev, { id: uid(), role: "user", content: msg }]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/ai/brainstorm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: msg,
          platform,
          tone,
          goal: "Brainstorm + draft posts",
          history: chat.slice(-10).map((m) => ({ role: m.role, content: m.content })),
        }),
      });

      const data: BrainstormApiResponse = await res.json().catch(() => null);

      if (!res.ok || !data?.success) {
        throw new Error(data?.error || `Brainstorm failed (${res.status})`);
      }

      const assistantText = String(data.assistantReply || "").trim();
      if (assistantText) {
        setChat((prev) => [...prev, { id: uid(), role: "assistant", content: assistantText }]);
      }

      setAngles(Array.isArray(data.angles) ? data.angles : []);
      const nextDrafts = Array.isArray(data.drafts) ? data.drafts : [];
      setDrafts(nextDrafts);

      // reset image state each round
      setDraftImages({});
      setDraftImageBusy({});
      setDraftImageAttempts({});
      setDraftImageQueryEdits({});
      setDraftImageError({});

      // fetch images AFTER drafts appear
      if (wantImages && nextDrafts.length) {
        nextDrafts.forEach((d, idx) => {
          const q = (d.imageQuery || "").trim();
          setDraftImageQueryEdits((prev) => ({ ...prev, [idx]: q }));
          void fetchImageForDraft(idx, q);
        });
      }

      setTimeout(scrollToBottom, 50);
    } catch (e: any) {
      setError(e?.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  const sendToQuickBlast = (d: Draft, img: CommonsImage | null, suggestedPlatform: ChannelId) => {
    const payload = {
      message: joinDraft(d),
      imageUrl: img?.url || "",
      suggestedPlatforms: [suggestedPlatform],
      attribution: img
        ? {
            title: img.title,
            pageUrl: img.pageUrl,
            licenseShortName: img.licenseShortName,
            licenseUrl: img.licenseUrl,
            attribution: img.attribution,
          }
        : null,
    };

    try {
      localStorage.setItem(PREFILL_QUICKBLAST_KEY, JSON.stringify(payload));
    } catch {}

    window.location.href = "/dashboard";
  };

  const sendToStories = (d: Draft, img: CommonsImage | null) => {
    const payload = {
      idea: joinDraft(d),
      platform,
      tone,
      imageUrl: img?.url || "",
      attribution: img
        ? {
            title: img.title,
            pageUrl: img.pageUrl,
            licenseShortName: img.licenseShortName,
            licenseUrl: img.licenseUrl,
            attribution: img.attribution,
          }
        : null,
    };

    try {
      localStorage.setItem(PREFILL_STORIES_KEY, JSON.stringify(payload));
    } catch {}

    window.location.href = "/dashboard/stories/new";
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 px-4 py-8 flex justify-center">
      <div className="w-full max-w-6xl space-y-6">
        <header className="space-y-3">
          <h1 className="text-2xl md:text-3xl font-semibold">💬 Brainstorm</h1>
          <p className="text-sm text-slate-300 max-w-3xl">
            Talk it out like a text thread. We riff first, then draft posts you can push into Quick Blast or Stories.
          </p>
          <ConnectedChannelsBar title="Social connections" />
        </header>

        <section className="rounded-3xl border border-slate-700 bg-slate-900/80 p-5 space-y-4">
          <div className="grid md:grid-cols-4 gap-3">
            <div className="space-y-1">
              <label className="text-[11px] text-slate-300">Platform</label>
              <select
                className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                value={platform}
                onChange={(e) => setPlatform(e.target.value as ChannelId)}
              >
                <option value="linkedin">LinkedIn</option>
                <option value="facebook">Facebook</option>
                <option value="instagram">Instagram</option>
                <option value="reddit">Reddit</option>
                <option value="tiktok">TikTok</option>
              </select>
            </div>

            <div className="space-y-1 md:col-span-2">
              <label className="text-[11px] text-slate-300">Tone</label>
              <input
                className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                value={tone}
                onChange={(e) => setTone(e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] text-slate-300">Extras</label>
              <label className="flex items-center gap-2 text-sm rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2">
                <input
                  type="checkbox"
                  checked={wantImages}
                  onChange={(e) => setWantImages(e.target.checked)}
                />
                Find images
              </label>
            </div>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          {/* Chat */}
          <div className="rounded-3xl border border-slate-700 bg-slate-900/80 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Conversation</h2>
              <div className="text-[11px] text-slate-400">
                Try: “Give me 10 hooks first.” / “Push back on my angle.” / “Make it kinder + simpler.”
              </div>
            </div>

            <div className="h-[460px] overflow-y-auto rounded-2xl border border-slate-700 bg-slate-950/60 p-4 space-y-3">
              {chat.map((m) => (
                <div
                  key={m.id}
                  className={[
                    "max-w-[90%] rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap",
                    m.role === "user"
                      ? "ml-auto bg-emerald-500/20 border border-emerald-500/40 text-slate-50"
                      : "mr-auto bg-slate-900 border border-slate-700 text-slate-100",
                  ].join(" ")}
                >
                  {m.content}
                </div>
              ))}
              <div ref={bottomRef} />
            </div>

            <div className="space-y-2">
              <textarea
                className="w-full min-h-[110px] rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Type your idea…"
              />

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={send}
                  disabled={!canSend}
                  className="inline-flex items-center rounded-full bg-emerald-500 px-5 py-2 text-sm font-semibold text-slate-950 disabled:opacity-60"
                >
                  {loading ? "Thinking…" : "Send"}
                </button>

                {error ? <div className="text-sm text-red-400">{error}</div> : null}
              </div>
            </div>
          </div>

          {/* Output */}
          <div className="space-y-6">
            {/* Angles */}
            <div className="rounded-3xl border border-slate-700 bg-slate-900/80 p-5 space-y-3">
              <h2 className="font-semibold">Angles</h2>
              {angles.length === 0 ? (
                <div className="text-sm text-slate-400">No angles yet — send a message.</div>
              ) : (
                <ul className="list-disc pl-5 space-y-2 text-sm text-slate-200">
                  {angles.map((a, i) => (
                    <li key={i}>{a}</li>
                  ))}
                </ul>
              )}
            </div>

            {/* Drafts */}
            <div className="rounded-3xl border border-slate-700 bg-slate-900/80 p-5 space-y-3">
              <h2 className="font-semibold">Draft posts</h2>

              {drafts.length === 0 ? (
                <div className="text-sm text-slate-400">No drafts yet — send a message.</div>
              ) : (
                <div className="space-y-3">
                  {drafts.map((d, idx) => {
                    const img = draftImages[idx] ?? null;
                    const busy = !!draftImageBusy[idx];
                    const imgErr = draftImageError[idx] ?? null;
                    const query = draftImageQueryEdits[idx] ?? d.imageQuery ?? "";

                    const previewUrl = safeUrl(img?.url);
                    const filePageUrl = safeUrl(img?.pageUrl);

                    return (
                      <div
                        key={idx}
                        className="rounded-2xl border border-slate-700 bg-slate-950/60 p-4 space-y-3"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-sm font-semibold">{d.title || `Draft ${idx + 1}`}</div>
                            <div className="text-[11px] text-slate-400">
                              Suggested: {d.suggestedMode === "story_series" ? "Stories" : "Quick Blast"}
                            </div>
                          </div>

                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => sendToQuickBlast(d, img, platform)}
                              className="rounded-full bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-emerald-400"
                            >
                              Send to Quick Blast
                            </button>
                            <button
                              type="button"
                              onClick={() => sendToStories(d, img)}
                              className="rounded-full border border-slate-600 bg-slate-900 px-3 py-1.5 text-xs text-slate-100 hover:bg-white/10"
                            >
                              Send to Stories
                            </button>
                          </div>
                        </div>

                        <pre className="whitespace-pre-wrap text-sm text-slate-100">{joinDraft(d)}</pre>

                        {/* Image area */}
                        <div className="rounded-2xl border border-slate-700 bg-slate-900/60 p-3 space-y-3">
                          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
                            <div className="flex-1 space-y-1">
                              <div className="text-[11px] text-slate-400">Image search query</div>
                              <input
                                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none"
                                value={query}
                                onChange={(e) =>
                                  setDraftImageQueryEdits((prev) => ({
                                    ...prev,
                                    [idx]: e.target.value,
                                  }))
                                }
                                placeholder="e.g. adhd workplace desk"
                              />
                              <div className="text-[11px] text-slate-500">
                                Tip: Use concrete nouns (“desk”, “meeting”, “calendar”, “sticky notes”) for better results.
                              </div>
                            </div>

                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => fetchImageForDraft(idx, query)}
                                disabled={busy || !wantImages}
                                className="rounded-full border border-slate-600 bg-slate-950 px-3 py-2 text-xs text-slate-100 hover:bg-white/10 disabled:opacity-60"
                              >
                                {busy ? "Searching…" : "Search this"}
                              </button>

                              <button
                                type="button"
                                onClick={() => void findAnotherImage(idx)}
                                disabled={busy || !wantImages}
                                className="rounded-full bg-blue-500 px-3 py-2 text-xs font-semibold text-slate-50 hover:bg-blue-400 disabled:opacity-60"
                              >
                                {busy ? "…" : "Find another"}
                              </button>
                            </div>
                          </div>

                          {wantImages ? (
                            busy ? (
                              <div className="text-sm text-slate-300">Finding an image…</div>
                            ) : img ? (
                              <div className="grid md:grid-cols-[140px_1fr] gap-3 items-start">
                                {/* Preview */}
                                <div className="rounded-2xl border border-slate-700 bg-slate-950 overflow-hidden">
                                  {previewUrl ? (
                                    <a href={previewUrl} target="_blank" rel="noreferrer">
                                      {/* eslint-disable-next-line @next/next/no-img-element */}
                                      <img
                                        src={previewUrl}
                                        alt={img.title || "Commons image"}
                                        className="w-full h-[140px] object-cover"
                                      />
                                    </a>
                                  ) : (
                                    <div className="h-[140px] flex items-center justify-center text-xs text-slate-400">
                                      No preview
                                    </div>
                                  )}
                                </div>

                                {/* Meta */}
                                <div className="text-[12px] text-slate-200 space-y-1">
                                  <div className="break-all">
                                    <span className="text-slate-400">Image URL:</span>{" "}
                                    {previewUrl || "(missing)"}
                                  </div>
                                  <div className="break-all">
                                    <span className="text-slate-400">Commons page:</span>{" "}
                                    {filePageUrl || "(missing)"}
                                  </div>
                                  <div>
                                    <span className="text-slate-400">License:</span>{" "}
                                    {img.licenseShortName || "Unknown"}
                                    {img.licenseUrl ? (
                                      <>
                                        {" "}
                                        <a
                                          className="text-emerald-300 hover:text-emerald-200"
                                          href={img.licenseUrl}
                                          target="_blank"
                                          rel="noreferrer"
                                        >
                                          (view)
                                        </a>
                                      </>
                                    ) : null}
                                  </div>
                                  {img.attribution ? (
                                    <div>
                                      <span className="text-slate-400">Attribution:</span> {img.attribution}
                                    </div>
                                  ) : null}

                                  <div className="pt-2 flex flex-wrap gap-2">
                                    {previewUrl ? (
                                      <a
                                        href={previewUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="rounded-full border border-slate-600 bg-slate-950 px-3 py-1.5 text-xs text-slate-100 hover:bg-white/10"
                                      >
                                        Open full image
                                      </a>
                                    ) : null}
                                    {filePageUrl ? (
                                      <a
                                        href={filePageUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="rounded-full border border-slate-600 bg-slate-950 px-3 py-1.5 text-xs text-slate-100 hover:bg-white/10"
                                      >
                                        Open Commons page
                                      </a>
                                    ) : null}
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <div className="text-sm text-slate-400">
                                {imgErr || "No image found. Try Search this or Find another."}
                              </div>
                            )
                          ) : (
                            <div className="text-sm text-slate-400">Image search is off.</div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </section>

        <footer className="text-xs text-slate-500">
          Click the thumbnail to preview. Use “Find another” to rotate images without slowing down the AI.
        </footer>
      </div>
    </div>
  );
}
