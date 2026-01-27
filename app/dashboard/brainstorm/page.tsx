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

type CommonsImagesApiResponse = {
  success: boolean;
  query?: string;
  images?: CommonsImage[];
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

function stripHtml(s: string) {
  // quick cleanup for Artist/Credit often containing html
  return String(s || "")
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();
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
        "Drop your idea in plain English. I’ll riff with you first (angles + hooks), then draft posts you can push into Quick Blast or Stories.",
    },
  ]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [angles, setAngles] = useState<string[]>([]);
  const [drafts, setDrafts] = useState<Draft[]>([]);

  // chosen image per draft
  const [draftImages, setDraftImages] = useState<Record<number, CommonsImage | null>>({});
  const [draftImageQueryEdits, setDraftImageQueryEdits] = useState<Record<number, string>>({});

  // modal picker
  const [pickerOpenFor, setPickerOpenFor] = useState<number | null>(null);
  const [pickerQuery, setPickerQuery] = useState<string>("");
  const [pickerLoading, setPickerLoading] = useState(false);
  const [pickerError, setPickerError] = useState<string | null>(null);
  const [pickerResults, setPickerResults] = useState<CommonsImage[]>([]);

  const bottomRef = useRef<HTMLDivElement | null>(null);

  const canSend = useMemo(() => !!input.trim() && !loading, [input, loading]);

  const scrollToBottom = () => {
    try {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    } catch {}
  };

  const openPicker = async (idx: number) => {
    if (!wantImages) return;
    setPickerOpenFor(idx);

    const q = (draftImageQueryEdits[idx] ?? drafts[idx]?.imageQuery ?? "").trim();
    setPickerQuery(q);
    setPickerResults([]);
    setPickerError(null);

    // auto load results on open
    if (q) {
      await searchPicker(q);
    }
  };

  const closePicker = () => {
    setPickerOpenFor(null);
    setPickerResults([]);
    setPickerError(null);
    setPickerLoading(false);
  };

  const searchPicker = async (q: string) => {
    const query = (q || "").trim();
    if (!query) {
      setPickerError("Type a few keywords first (e.g., 'adhd workplace desk').");
      return;
    }

    setPickerLoading(true);
    setPickerError(null);
    setPickerResults([]);

    try {
      const res = await fetch(`/api/media/commons-images?q=${encodeURIComponent(query)}&limit=6`, {
        cache: "no-store",
      });
      const data: CommonsImagesApiResponse = await res.json().catch(() => null);

      if (!res.ok || !data?.success) {
        throw new Error(data?.error || `Image search failed (${res.status})`);
      }

      const images = Array.isArray(data.images) ? data.images : [];
      if (images.length === 0) {
        setPickerError("No results. Try different words (more concrete nouns).");
        setPickerResults([]);
      } else {
        setPickerResults(images);
      }
    } catch (e: any) {
      setPickerError(e?.message || "Image search failed.");
      setPickerResults([]);
    } finally {
      setPickerLoading(false);
    }
  };

  const chooseImage = (idx: number, img: CommonsImage) => {
    setDraftImages((prev) => ({ ...prev, [idx]: img }));
    closePicker();
  };

  const removeImage = (idx: number) => {
    setDraftImages((prev) => ({ ...prev, [idx]: null }));
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

      // reset chosen images each round (keeps behaviour predictable)
      setDraftImages({});
      setDraftImageQueryEdits(
        nextDrafts.reduce((acc, d, i) => {
          acc[i] = (d.imageQuery || "").trim();
          return acc;
        }, {} as Record<number, string>)
      );

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
                Image picker
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

                        {/* Image chooser */}
                        <div className="rounded-2xl border border-slate-700 bg-slate-900/60 p-3 space-y-3">
                          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
                            <div className="flex-1 space-y-1">
                              <div className="text-[11px] text-slate-400">Image keywords</div>
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
                            </div>

                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => openPicker(idx)}
                                disabled={!wantImages}
                                className="rounded-full bg-blue-500 px-3 py-2 text-xs font-semibold text-slate-50 hover:bg-blue-400 disabled:opacity-60"
                              >
                                Choose image
                              </button>

                              {img ? (
                                <button
                                  type="button"
                                  onClick={() => removeImage(idx)}
                                  className="rounded-full border border-slate-600 bg-slate-950 px-3 py-2 text-xs text-slate-100 hover:bg-white/10"
                                >
                                  Remove
                                </button>
                              ) : null}
                            </div>
                          </div>

                          {img ? (
                            <div className="grid md:grid-cols-[140px_1fr] gap-3 items-start">
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

                              <div className="text-[12px] text-slate-200 space-y-1">
                                <div className="break-all">
                                  <span className="text-slate-400">Image URL:</span> {previewUrl}
                                </div>
                                <div className="break-all">
                                  <span className="text-slate-400">Commons page:</span>{" "}
                                  {filePageUrl ? (
                                    <a
                                      className="text-emerald-300 hover:text-emerald-200"
                                      href={filePageUrl}
                                      target="_blank"
                                      rel="noreferrer"
                                    >
                                      {filePageUrl}
                                    </a>
                                  ) : (
                                    "(missing)"
                                  )}
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
                                    <span className="text-slate-400">Attribution:</span>{" "}
                                    {stripHtml(img.attribution)}
                                  </div>
                                ) : null}
                              </div>
                            </div>
                          ) : (
                            <div className="text-sm text-slate-400">
                              No image selected (optional).
                            </div>
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
          “Choose image” opens a 6-image picker from Wikimedia Commons.
        </footer>

        {/* Modal */}
        {pickerOpenFor !== null ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
            <div
              className="absolute inset-0 bg-black/70"
              onClick={closePicker}
              aria-hidden="true"
            />
            <div className="relative w-full max-w-4xl rounded-3xl border border-slate-700 bg-slate-950 text-slate-100 shadow-2xl">
              <div className="p-5 border-b border-slate-700 flex items-start justify-between gap-3">
                <div>
                  <div className="text-lg font-semibold">Pick an image</div>
                  <div className="text-[12px] text-slate-400">
                    Choose one → it will attach to this draft and travel into Quick Blast / Stories.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={closePicker}
                  className="rounded-full border border-slate-600 bg-slate-900 px-3 py-1.5 text-xs hover:bg-white/10"
                >
                  Close
                </button>
              </div>

              <div className="p-5 space-y-4">
                <div className="flex flex-col md:flex-row gap-3 md:items-end">
                  <div className="flex-1">
                    <div className="text-[11px] text-slate-400 mb-1">Search keywords</div>
                    <input
                      value={pickerQuery}
                      onChange={(e) => setPickerQuery(e.target.value)}
                      className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none"
                      placeholder="e.g. adhd workplace focus desk"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => searchPicker(pickerQuery)}
                    disabled={pickerLoading}
                    className="rounded-2xl bg-blue-500 px-4 py-2 text-sm font-semibold text-slate-50 hover:bg-blue-400 disabled:opacity-60"
                  >
                    {pickerLoading ? "Searching…" : "Search"}
                  </button>
                </div>

                {pickerError ? (
                  <div className="rounded-2xl border border-red-500/40 bg-red-950/30 px-4 py-3 text-sm text-red-100">
                    {pickerError}
                  </div>
                ) : null}

                {pickerLoading ? (
                  <div className="text-sm text-slate-300">Loading results…</div>
                ) : pickerResults.length === 0 ? (
                  <div className="text-sm text-slate-400">
                    No results yet — hit Search.
                  </div>
                ) : (
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {pickerResults.map((img, i) => {
                      const u = safeUrl(img.url);
                      return (
                        <button
                          key={`${i}-${img.title}`}
                          type="button"
                          onClick={() => chooseImage(pickerOpenFor, img)}
                          className="text-left rounded-2xl border border-slate-700 bg-slate-900 hover:bg-slate-800 transition overflow-hidden"
                        >
                          <div className="h-[150px] bg-slate-950">
                            {u ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={u} alt={img.title} className="w-full h-full object-cover" />
                            ) : (
                              <div className="h-full flex items-center justify-center text-xs text-slate-400">
                                No preview
                              </div>
                            )}
                          </div>
                          <div className="p-3 space-y-1">
                            <div className="text-xs font-semibold line-clamp-2">
                              {img.title.replace(/^File:/, "")}
                            </div>
                            <div className="text-[11px] text-slate-400">
                              {img.licenseShortName || "License unknown"}
                            </div>
                            <div className="text-[11px] text-emerald-300 line-clamp-1">
                              Select this
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}

                <div className="text-[11px] text-slate-500">
                  Licensing varies. We include the Commons file page + license link (when available) for reviewer clarity.
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
