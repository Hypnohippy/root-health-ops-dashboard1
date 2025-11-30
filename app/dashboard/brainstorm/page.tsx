"use client";

import React, { useState } from "react";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type SeriesPost = {
  title: string;
  story: string;
};

export default function BrainstormPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content:
        "Tell me what you’d like to say. We can shape a vulnerable, human story together – then turn it into a series of posts when you’re ready.",
    },
  ]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);

  const [series, setSeries] = useState<SeriesPost[]>([]);
  const [isSeriesLoading, setIsSeriesLoading] = useState(false);

  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function resetNotices() {
    setNotice(null);
    setError(null);
  }

  async function sendMessage() {
    if (!input.trim()) return;
    resetNotices();

    const newMessages: ChatMessage[] = [
      ...messages,
      { role: "user", content: input.trim() },
    ];
    setMessages(newMessages);
    setInput("");
    setIsSending(true);

    try {
      const res = await fetch("/api/ai/brainstorm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: newMessages, mode: "chat" }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "The brainstorm AI failed to reply.");
        return;
      }

      const reply = (data.reply as string) || "";
      setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
    } catch (e: any) {
      setError(e?.message || "Error talking to brainstorm AI.");
    } finally {
      setIsSending(false);
    }
  }

  async function generateSeriesFromConversation() {
    resetNotices();

    if (messages.length === 0) {
      setError("Have at least one or two messages in the conversation first.");
      return;
    }

    setIsSeriesLoading(true);
    setSeries([]);

    try {
      const res = await fetch("/api/ai/brainstorm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages, mode: "series" }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to generate series from conversation.");
        return;
      }

      const posts = (data.series || []) as SeriesPost[];
      if (!posts.length) {
        setError("AI returned no series posts.");
        return;
      }

      setSeries(posts);
      setNotice("Created a 3-part series from this brainstorm.");
    } catch (e: any) {
      setError(e?.message || "Error generating series.");
    } finally {
      setIsSeriesLoading(false);
    }
  }

  async function savePostToAirtable(post: SeriesPost, index: number) {
    resetNotices();

    try {
      const res = await fetch("/api/content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: post.title || `Brainstorm series post ${index + 1}`,
          platform: "LinkedIn", // you can change this in Airtable later
          body: post.story,
          status: "draft",
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to save story to Airtable.");
        return;
      }

      setNotice(`Saved post ${index + 1} into Airtable Content as draft.`);
    } catch (e: any) {
      setError(e?.message || "Error saving to Airtable.");
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-50">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8 lg:flex-row">
        {/* LEFT: Chat / Brainstorm */}
        <div className="flex-1 space-y-4">
          <header className="space-y-1">
            <h1 className="text-2xl font-semibold text-slate-50">
              🧠 Brainstorm Studio
            </h1>
            <p className="text-sm text-slate-300">
              Talk like you do here. We&apos;ll shape vulnerable, honest
              stories about Root Health / Fuel Geist, then turn them into
              ready-to-use posts.
            </p>
          </header>

          {(notice || error) && (
            <div className="space-y-2">
              {notice && (
                <div className="rounded-lg border border-emerald-400/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
                  {notice}
                </div>
              )}
              {error && (
                <div className="rounded-lg border border-red-400/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                  {error}
                </div>
              )}
            </div>
          )}

          {/* Chat box */}
          <div className="flex h-[420px] flex-col rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl shadow-lg">
            <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3 text-sm">
              {messages.map((m, idx) => (
                <div
                  key={idx}
                  className={`max-w-[90%] rounded-lg px-3 py-2 ${
                    m.role === "user"
                      ? "ml-auto bg-emerald-400 text-slate-950"
                      : "mr-auto bg-black/40 text-slate-50 border border-white/10"
                  }`}
                >
                  {m.content}
                </div>
              ))}
            </div>

            {/* Input */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                sendMessage();
              }}
              className="flex gap-2 border-t border-white/10 bg-black/40 px-3 py-2"
            >
              <textarea
                className="flex-1 resize-none rounded-md border border-white/20 bg-black/40 px-2 py-1.5 text-xs text-slate-50 placeholder:text-slate-400"
                rows={2}
                placeholder="Tell me what you want to say – e.g. why you built Root Health, your own burnout story, how Coach Marcus helped, your journaling, etc."
                value={input}
                onChange={(e) => setInput(e.target.value)}
              />
              <button
                type="submit"
                disabled={isSending || !input.trim()}
                className="self-end rounded-md bg-emerald-400 px-3 py-1.5 text-xs font-medium text-slate-950 shadow-md hover:bg-emerald-300 disabled:opacity-60"
              >
                {isSending ? "Thinking..." : "Send"}
              </button>
            </form>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-[11px] text-slate-300 max-w-md">
              When you&apos;re happy with the conversation, click below and
              we&apos;ll turn this into a 3-part story series you can save into
              Airtable and schedule from the Stories/Scheduled pages.
            </p>
            <button
              type="button"
              onClick={generateSeriesFromConversation}
              disabled={isSeriesLoading}
              className="rounded-md bg-sky-400 px-3 py-1.5 text-xs font-medium text-slate-950 shadow-md hover:bg-sky-300 disabled:opacity-60"
            >
              {isSeriesLoading
                ? "Creating 3-part series..."
                : "Summarise as 3-part series"}
            </button>
          </div>
        </div>

        {/* RIGHT: Series posts + Airtable actions */}
        <div className="w-full max-w-md space-y-4">
          <h2 className="text-sm font-semibold text-slate-50">
            Series output & Airtable
          </h2>
          {series.length === 0 ? (
            <p className="text-xs text-slate-300">
              Once you click &quot;Summarise as 3-part series&quot;, your posts
              will appear here. You can then save each one into your Airtable{" "}
              <code>Content</code> table as a draft story.
            </p>
          ) : (
            <div className="space-y-3">
              {series.map((post, idx) => (
                <div
                  key={idx}
                  className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-3 text-xs text-slate-200 shadow-lg"
                >
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold text-slate-300">
                      Series Post {idx + 1}
                    </span>
                    <button
                      type="button"
                      onClick={() => savePostToAirtable(post, idx)}
                      className="rounded-md border border-white/30 bg-black/30 px-2 py-1 text-[11px] text-slate-100 hover:bg-black/40"
                    >
                      Save to Airtable
                    </button>
                  </div>
                  <p className="mb-1 text-xs font-semibold text-slate-50">
                    {post.title || `Post ${idx + 1}`}
                  </p>
                  <p className="whitespace-pre-wrap text-[11px] text-slate-200">
                    {post.story}
                  </p>
                </div>
              ))}

              <p className="text-[11px] text-slate-300">
                These drafts land in the same Airtable <code>Content</code>{" "}
                table your Stories page uses. From there you can schedule and
                manage them as usual.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
