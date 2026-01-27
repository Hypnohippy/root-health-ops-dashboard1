"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import ConnectedChannelsBar from "../components/ConnectedChannelsBar";

type Mode = "direct" | "story_series";
type ChannelId = "linkedin" | "facebook" | "instagram" | "reddit" | "tiktok";

type DirectPost = {
  title?: string;
  body: string;
  cta?: string;
  hashtags?: string[];
};

type StoryPost = {
  title: string;
  body: string;
  platformSuggestion?: string;
  cta?: string;
  imagePrompt?: string;
};

type ChatMsg = {
  id: string;
  role: "user" | "assistant";
  text: string;
  createdAt: number;
  kind?: "plain" | "result";
  payload?: {
    mode: Mode;
    platform: ChannelId;
    tone: string;
    directPost?: DirectPost | null;
    seriesPosts?: StoryPost[] | null;
  };
};

function uid() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function composeDirect(post: DirectPost) {
  const composed = [
    post.title?.trim() ? post.title.trim() : null,
    post.body?.trim() ? post.body.trim() : null,
    post.cta?.trim() ? post.cta.trim() : null,
    post.hashtags?.length ? post.hashtags.join(" ") : null,
  ]
    .filter(Boolean)
    .join("\n\n");

  return composed.trim();
}

function composeSeries(posts: StoryPost[]) {
  return posts
    .map((p, i) =>
      `Part ${i + 1}/${posts.length}\n\n${p.title}\n\n${p.body}\n\n${p.cta || ""}`.trim()
    )
    .join("\n\n---\n\n");
}

function friendlyError(err: string) {
  const t = (err || "").toLowerCase();

  if (t.includes("write a brief") || t.includes("brief first") || t.includes("required")) {
    return {
      headline: "Type a quick idea first",
      help: "Just tell me who it’s for and what you want them to do. One sentence is enough.",
    };
  }

  if (t.includes("empty post") || t.includes("ai returned an empty")) {
    return {
      headline: "I didn’t get a usable draft back",
      help: "Try rephrasing your idea slightly (who it’s for + the outcome), then send again.",
    };
  }

  if (t.includes("failed to fetch") || t.includes("network") || t.includes("timeout")) {
    return {
      headline: "Connection hiccup",
      help: "Refresh the page and try again. If it keeps happening, we’ll check the server logs.",
    };
  }

  return {
    headline: "Something went wrong",
    help: "Try again. If it repeats, copy the details and we’ll fix it fast.",
  };
}

function defaultStarterMessages(): ChatMsg[] {
  return [
    {
      id: uid(),
      role: "assistant",
      createdAt: Date.now(),
      kind: "plain",
      text:
        "Hey David — this is your Thinking Space.\n\n" +
        "Tell me what you want to say (rough is fine). I’ll help shape it for your chosen platform + tone.\n\n" +
        "Tip: Include (1) who it’s for, (2) the problem, (3) the outcome you offer.",
    },
  ];
}

export default function BrainstormPage() {
  // Context controls
  const [mode, setMode] = useState<Mode>("direct");
  const [platform, setPlatform] = useState<ChannelId>("linkedin");
  const [tone, setTone] = useState<string>("Professional & confident");

  // Story series controls
  const [seriesLength, setSeriesLength] = useState<number>(3);
  const [storyType, setStoryType] = useState<string>("HR director perspective");
  const [ctaStyle, setCtaStyle] = useState<string>("Comment for more / next part");

  // Chat input
  const [input, setInput] = useState<string>(
    "New year, new projects — I’m offering a free consultation to help HR/leadership pick a wellbeing programme that actually works. Make it confident, direct, and friendly."
  );

  // IMPORTANT: do NOT read localStorage during initial render (SSR/build)
  const [messages, setMessages] = useState<ChatMsg[]>(() => defaultStarterMessages());

  const [loading, setLoading] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  const listRef = useRef<HTMLDivElement | null>(null);

  const canSend = useMemo(() => !!input.trim() && !loading, [input, loading]);

  // Load saved chat AFTER mount (client only)
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem("rh_brainstorm_chat_v1");
      if (!raw) return;
      const parsed = JSON.parse(raw) as ChatMsg[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        setMessages(parsed);
      }
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist chat AFTER mount (client only)
  useEffect(() => {
    try {
      window.localStorage.setItem("rh_brainstorm_chat_v1", JSON.stringify(messages.slice(-60)));
    } catch {
      // ignore
    }
  }, [messages]);

  // Auto-scroll
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, loading]);

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // ignore
    }
  };

  const sendToQuickBlast = async (text: string) => {
    try {
      window.localStorage.setItem(
        "rh_prefill_quick_blast_v1",
        JSON.stringify({
          text,
          platform,
          tone,
          mode,
          createdAt: new Date().toISOString(),
        })
      );
    } catch {
      // ignore
    }
    await copyToClipboard(text);
    window.location.href = `/dashboard?from=brainstorm`;
  };

  const sendToStories = async (payload: { direct?: string; series?: StoryPost[] }) => {
    try {
      window.localStorage.setItem(
        "rh_prefill_stories_v1",
        JSON.stringify({
          mode,
          platform,
          tone,
          direct: payload.direct || null,
          series: payload.series || null,
          createdAt: new Date().toISOString(),
        })
      );
    } catch {
      // ignore
    }

    if (payload.direct) await copyToClipboard(payload.direct);
    if (payload.series?.length) await copyToClipboard(composeSeries(payload.series));

    window.location.href = `/dashboard/stories/new?from=brainstorm`;
  };

  const pushAssistantPlain = (text: string) => {
    setMessages((prev) => [
      ...prev,
      { id: uid(), role: "assistant", createdAt: Date.now(), kind: "plain", text },
    ]);
  };

  const pushAssistantResult = (text: string, payload: ChatMsg["payload"]) => {
    setMessages((prev) => [
      ...prev,
      {
        id: uid(),
        role: "assistant",
        createdAt: Date.now(),
        kind: "result",
        text,
        payload: payload || undefined,
      },
    ]);
  };

  const buildContextHeader = () => {
    const bits = [
      `Mode: ${mode === "direct" ? "Direct Post" : "Story Series"}`,
      `Platform: ${platform}`,
      `Tone: ${tone}`,
    ];

    if (mode === "story_series") {
      bits.push(`Series: ${seriesLength} parts`);
      bits.push(`Story type: ${storyType}`);
      bits.push(`CTA style: ${ctaStyle}`);
    }

    return bits.join(" · ");
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text) return;

    setLastError(null);
    setLoading(true);

    setMessages((prev) => [
      ...prev,
      { id: uid(), role: "user", createdAt: Date.now(), kind: "plain", text },
    ]);

    setInput("");

    try {
      const prompt = `${buildContextHeader()}\n\nUser idea:\n${text}`;

      if (mode === "direct") {
        const res = await fetch("/api/ai/brainstorm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt,
            platform,
            tone,
            goal: "Direct post to my audience",
          }),
        });

        const data: any = await res.json().catch(() => null);
        if (!data?.success) throw new Error(data?.error || "Brainstorm failed.");

        const post: DirectPost = data?.post;
        if (!post?.body) throw new Error("AI returned an empty post.");

        const composed = composeDirect(post);

        pushAssistantResult(
          "Here’s a polished draft. Want it shorter, punchier, or more human?\n\n(You can also send it straight to Quick Blast or Stories below.)",
          {
            mode,
            platform,
            tone,
            directPost: post,
            seriesPosts: null,
          }
        );

        pushAssistantPlain(composed);
        return;
      }

      const res = await fetch("/api/ai/story-series", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idea: prompt,
          storyType,
          tone,
          seriesLength,
          platform,
          ctaStyle,
        }),
      });

      const data: any = await res.json().catch(() => null);
      if (!data?.success || !Array.isArray(data?.posts)) {
        throw new Error(data?.error || "Story series generation failed.");
      }

      const posts: StoryPost[] = data.posts;

      pushAssistantResult(
        `Done — I’ve drafted a ${posts.length}-part story series.\n\nWant the series more “teachable”, more “story”, or more “salesy”?`,
        {
          mode,
          platform,
          tone,
          directPost: null,
          seriesPosts: posts,
        }
      );

      pushAssistantPlain(
        posts
          .map((p, i) => {
            const header = `Part ${i + 1}/${posts.length}: ${p.title}`;
            const cta = p.cta ? `\n\nCTA: ${p.cta}` : "";
            return `${header}\n\n${p.body}${cta}`.trim();
          })
          .join("\n\n— — —\n\n")
      );
    } catch (e: any) {
      const msg = e?.message || "Something went wrong.";
      setLastError(msg);

      const fe = friendlyError(msg);
      pushAssistantPlain(
        `⚠️ ${fe.headline}\n\n${fe.help}\n\nIf you want, paste what you were trying to do in one line and I’ll guide you.`
      );
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown: React.KeyboardEventHandler<HTMLTextAreaElement> = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (canSend) void handleSend();
    }
  };

  const clearChat = () => {
    if (!confirm("Clear this Brainstorm chat?")) return;
    const fresh = defaultStarterMessages();
    setMessages(fresh);
    try {
      window.localStorage.removeItem("rh_brainstorm_chat_v1");
    } catch {
      // ignore
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 px-4 py-8 flex justify-center">
      <div className="w-full max-w-6xl space-y-6">
        <header className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl md:text-3xl font-semibold">🧠 Brainstorm</h1>
              <p className="text-sm text-slate-300 max-w-2xl">
                Thinking Space — chat your idea out, get a polished draft, then send it to Quick Blast or Stories when you’re ready.
              </p>
            </div>

            <button
              type="button"
              onClick={clearChat}
              className="text-xs rounded-full border border-slate-600 px-3 py-1.5 hover:bg-white/10"
            >
              Clear
            </button>
          </div>

          <ConnectedChannelsBar title="Social connections" />
        </header>

        <section className="rounded-3xl border border-slate-700 bg-slate-900/80 p-5 space-y-4">
          <div className="grid md:grid-cols-4 gap-3">
            <div className="space-y-1">
              <label className="text-[11px] text-slate-300">Create</label>
              <select
                className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                value={mode}
                onChange={(e) => setMode(e.target.value as Mode)}
              >
                <option value="direct">Direct Post</option>
                <option value="story_series">Story Series</option>
              </select>
            </div>

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
                placeholder="Professional & confident"
              />
            </div>
          </div>

          {mode === "story_series" && (
            <div className="grid md:grid-cols-3 gap-3">
              <div className="space-y-1">
                <label className="text-[11px] text-slate-300">Story type</label>
                <input
                  className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                  value={storyType}
                  onChange={(e) => setStoryType(e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] text-slate-300">Series length</label>
                <input
                  type="number"
                  min={1}
                  max={10}
                  className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                  value={seriesLength}
                  onChange={(e) =>
                    setSeriesLength(Math.max(1, Math.min(10, Number(e.target.value) || 1)))
                  }
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] text-slate-300">CTA style</label>
                <input
                  className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                  value={ctaStyle}
                  onChange={(e) => setCtaStyle(e.target.value)}
                />
              </div>
            </div>
          )}

          <p className="text-[11px] text-slate-400">
            Tip: You can change Create/Platform/Tone at any time — your next message will use the new settings.
          </p>
        </section>

        <section className="rounded-3xl border border-slate-700 bg-slate-900/80 overflow-hidden">
          <div ref={listRef} className="max-h-[520px] overflow-y-auto px-4 py-4 space-y-3">
            {messages.map((m) => {
              const isUser = m.role === "user";
              return (
                <div key={m.id} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
                  <div
                    className={[
                      "max-w-[90%] md:max-w-[70%] rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap",
                      isUser
                        ? "bg-emerald-500 text-slate-950"
                        : "bg-slate-950/60 border border-slate-700 text-slate-100",
                    ].join(" ")}
                  >
                    {m.text}

                    {!isUser && m.kind === "result" && m.payload ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="text-xs rounded-full border border-slate-600 px-3 py-1 hover:bg-white/10"
                          onClick={async () => {
                            const p = m.payload!;
                            if (p.mode === "direct" && p.directPost) {
                              await copyToClipboard(composeDirect(p.directPost));
                            } else if (p.mode === "story_series" && p.seriesPosts?.length) {
                              await copyToClipboard(composeSeries(p.seriesPosts));
                            }
                          }}
                        >
                          Copy
                        </button>

                        <button
                          type="button"
                          className="text-xs rounded-full bg-emerald-500 px-3 py-1 font-semibold text-slate-950 hover:bg-emerald-400"
                          onClick={async () => {
                            const p = m.payload!;
                            if (p.mode === "direct" && p.directPost) {
                              await sendToQuickBlast(composeDirect(p.directPost));
                            } else if (p.mode === "story_series" && p.seriesPosts?.length) {
                              await sendToQuickBlast(
                                `${p.seriesPosts[0].title}\n\n${p.seriesPosts[0].body}\n\n${p.seriesPosts[0].cta || ""}`.trim()
                              );
                            }
                          }}
                        >
                          Send to Quick Blast
                        </button>

                        <button
                          type="button"
                          className="text-xs rounded-full border border-slate-600 px-3 py-1 hover:bg-white/10"
                          onClick={async () => {
                            const p = m.payload!;
                            if (p.mode === "direct" && p.directPost) {
                              await sendToStories({ direct: composeDirect(p.directPost) });
                            } else if (p.mode === "story_series" && p.seriesPosts?.length) {
                              await sendToStories({ series: p.seriesPosts });
                            }
                          }}
                        >
                          Send to Stories
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}

            {loading ? (
              <div className="flex justify-start">
                <div className="max-w-[90%] md:max-w-[70%] rounded-2xl px-4 py-3 text-sm bg-slate-950/60 border border-slate-700 text-slate-100">
                  Root Coach is thinking…
                </div>
              </div>
            ) : null}
          </div>

          <div className="border-t border-slate-700 bg-slate-950/40 px-4 py-4">
            <div className="flex flex-col gap-2">
              <textarea
                className="w-full min-h-[70px] rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type your idea… (Enter to send, Shift+Enter for a new line)"
              />

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => void handleSend()}
                  disabled={!canSend}
                  className="inline-flex items-center rounded-full bg-emerald-500 px-5 py-2 text-sm font-semibold text-slate-950 disabled:opacity-60 disabled:cursor-not-allowed hover:bg-emerald-400 transition"
                >
                  {loading ? "Sending…" : "Send"}
                </button>

                <div className="text-xs text-slate-400">
                  This is a thinking space — rough drafts welcome.
                </div>
              </div>
            </div>
          </div>
        </section>

        <p className="text-[11px] text-slate-500">
          Note: “Send to Quick Blast / Stories” stores the draft and copies it to your clipboard, then opens the destination page.
          Next we can add a 1-click “Paste from Brainstorm” button on those pages to auto-fill.
        </p>
      </div>
    </div>
  );
}
