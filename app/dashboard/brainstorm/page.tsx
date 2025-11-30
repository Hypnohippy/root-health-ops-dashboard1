"use client";

import React, { useState } from "react";

type Role = "user" | "assistant";

type ChatMessage = {
  role: Role;
  content: string;
};

type BrainstormMode = "single_post" | "series" | "ad_variants";

const initialSystemHint = `Tip: tell the AI what you want.

For example:
- "I want to tell a vulnerable story about why I built Root Health."
- "Help me write a 3-part series about burnout and recovery."
- "Turn this rough idea into 3 short ad-style posts."`;

export default function BrainstormPage() {
  const [mode, setMode] = useState<BrainstormMode>("single_post");
  const [brandContext, setBrandContext] = useState<string>(
    "Root Health helps people understand themselves, recognise patterns, rebuild energy, and prevent burnout in a human, non-clinical way."
  );
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [drafts, setDrafts] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const handleSend = async () => {
    if (!input.trim()) return;

    const newMessage: ChatMessage = {
      role: "user",
      content: input.trim(),
    };

    const updatedMessages = [...messages, newMessage];
    setMessages(updatedMessages);
    setInput("");
    setIsLoading(true);
    setStatus("Thinking...");

    try {
      const res = await fetch("/api/ai/brainstorm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: updatedMessages,
          mode,
          brandContext,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        console.error("Brainstorm error:", err);
        setStatus("Something went wrong. Please try again.");
        setIsLoading(false);
        return;
      }

      const data = await res.json();
      const replyText: string = data.reply || "No response text received.";

      const assistantMessage: ChatMessage = {
        role: "assistant",
        content: replyText,
      };

      setMessages((prev) => [...prev, assistantMessage]);
      setStatus("Ready. You can refine further or save this as a draft.");
    } catch (error) {
      console.error("Brainstorm fetch error:", error);
      setStatus("Network error. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveDraft = (content: string) => {
    setDrafts((prev) => [content, ...prev]);
    setStatus("Draft saved. You can copy it into Stories or Series.");
  };

  const handleCopy = async (content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setStatus("Copied to clipboard. Paste into Stories or Campaigns.");
    } catch {
      setStatus("Could not copy to clipboard, please copy manually.");
    }
  };

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 md:flex-row">
      {/* LEFT: Chat area */}
      <section className="flex-1 space-y-4 rounded-2xl bg-black/30 p-4 shadow-lg shadow-emerald-500/10 border border-white/10">
        <header className="flex items-center justify-between gap-3 border-b border-white/10 pb-3">
          <div>
            <h1 className="text-lg font-semibold text-slate-50">
              🧠 Brainstorm Studio
            </h1>
            <p className="text-xs text-slate-300">
              Chat with your built-in AI to craft raw, honest LinkedIn & Facebook content.
            </p>
          </div>

          <div className="flex flex-col items-end gap-1 text-xs">
            <label className="text-slate-400">Mode</label>
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as BrainstormMode)}
              className="rounded-md bg-slate-900 border border-white/10 px-2 py-1 text-xs text-slate-50"
            >
              <option value="single_post">Single post</option>
              <option value="series">3-part story series</option>
              <option value="ad_variants">Short ad variants</option>
            </select>
          </div>
        </header>

        {/* Brand context (optional but handy) */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-200">
            Brand / context (optional)
          </label>
          <textarea
            value={brandContext}
            onChange={(e) => setBrandContext(e.target.value)}
            className="w-full rounded-md border border-white/10 bg-slate-950/60 p-2 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-emerald-400"
            rows={2}
          />
        </div>

        {/* Chat history */}
        <div className="h-72 space-y-3 overflow-y-auto rounded-md border border-white/10 bg-slate-950/40 p-3 text-sm">
          {messages.length === 0 && (
            <div className="text-xs text-slate-400 whitespace-pre-line">
              {initialSystemHint}
            </div>
          )}

          {messages.map((m, i) => (
            <div
              key={i}
              className={`flex ${
                m.role === "user" ? "justify-end" : "justify-start"
              }`}
            >
              <div
                className={`max-w-[80%] rounded-lg px-3 py-2 text-xs whitespace-pre-line ${
                  m.role === "user"
                    ? "bg-emerald-400 text-slate-950"
                    : "bg-slate-800 text-slate-50 border border-white/10"
                }`}
              >
                {m.content}
                {m.role === "assistant" && (
                  <div className="mt-2 flex gap-2 text-[10px]">
                    <button
                      onClick={() => handleSaveDraft(m.content)}
                      className="rounded-full border border-white/20 px-2 py-0.5 hover:bg-white/10"
                    >
                      Save as draft
                    </button>
                    <button
                      onClick={() => handleCopy(m.content)}
                      className="rounded-full border border-white/20 px-2 py-0.5 hover:bg-white/10"
                    >
                      Copy
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Input area */}
        <div className="space-y-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder='e.g. "I want to tell a vulnerable story about why I built Root Health..."'
            className="w-full rounded-md border border-white/10 bg-slate-950/60 p-3 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-emerald-400"
            rows={3}
          />
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400">
              Enter what you want to say. The AI will help shape it.
            </span>
            <button
              onClick={handleSend}
              disabled={isLoading || !input.trim()}
              className="rounded-md bg-emerald-400 px-4 py-1.5 text-xs font-semibold text-slate-950 shadow-sm shadow-emerald-500/40 disabled:opacity-60"
            >
              {isLoading ? "Thinking..." : "Send to AI"}
            </button>
          </div>
        </div>

        {status && (
          <p className="text-[11px] text-slate-300 border-t border-white/10 pt-2">
            {status}
          </p>
        )}
      </section>

      {/* RIGHT: Drafts & handoff */}
      <aside className="w-full max-w-xs space-y-3 rounded-2xl bg-black/30 p-4 shadow-lg shadow-emerald-500/10 border border-white/10">
        <h2 className="text-sm font-semibold text-slate-50">
          ✍️ Saved Drafts
        </h2>
        <p className="text-[11px] text-slate-300">
          Save any AI response as a draft, then copy it straight into{" "}
          <span className="font-semibold">Stories</span> or{" "}
          <span className="font-semibold">Campaigns</span> in your existing
          workflow.
        </p>

        {drafts.length === 0 && (
          <p className="text-[11px] text-slate-500">
            No drafts yet. Ask the AI for a post, then click
            {" “Save as draft” "} under the response.
          </p>
        )}

        <div className="space-y-3 max-h-72 overflow-y-auto">
          {drafts.map((draft, i) => (
            <div
              key={i}
              className="rounded-md border border-white/10 bg-slate-950/60 p-2 text-[11px] text-slate-100"
            >
              <div className="mb-2 max-h-32 overflow-y-auto whitespace-pre-line">
                {draft}
              </div>
              <div className="flex gap-2 text-[10px]">
                <button
                  onClick={() => handleCopy(draft)}
                  className="flex-1 rounded-full border border-white/20 px-2 py-1 text-center hover:bg-white/10"
                >
                  Copy to clipboard
                </button>
                {/* Simple navigation hint for you to use manually */}
                <a
                  href="/dashboard/stories/new"
                  className="flex-1 rounded-full border border-emerald-400/60 px-2 py-1 text-center text-emerald-300 hover:bg-emerald-500/10"
                >
                  Open Stories
                </a>
              </div>
            </div>
          ))}
        </div>

        <div className="border-t border-white/10 pt-2 text-[11px] text-slate-400">
          Workflow tip:
          <ul className="mt-1 list-disc pl-4 space-y-1">
            <li>Use this area to perfect your wording.</li>
            <li>Save the best version as a draft.</li>
            <li>Copy it and paste into your Stories / Series page.</li>
          </ul>
        </div>
      </aside>
    </div>
  );
}
