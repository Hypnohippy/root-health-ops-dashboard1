"use client";

import React, { useState } from "react";

type Role = "user" | "assistant";

type ChatMessage = {
  role: Role;
  content: string;
};

type Platform = "LinkedIn" | "Facebook" | "Instagram";

export default function BrainstormPage() {
  const [platform, setPlatform] = useState<Platform>("LinkedIn");
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content:
        "Hey, I’m your Brainstorm Buddy 👋\n\nTell me what you’re trying to say – a feeling, a story, an idea – and we’ll riff on it together until it’s a post you love.",
    },
  ]);

  const [workingDraft, setWorkingDraft] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function resetError() {
    setError(null);
  }

  async function handleSend(e?: React.FormEvent) {
    if (e) e.preventDefault();
    resetError();
    if (!input.trim() || isSending) return;

    const newUserMessage: ChatMessage = {
      role: "user",
      content: input.trim(),
    };

    const newMessages = [...messages, newUserMessage];
    setMessages(newMessages);
    setInput("");
    setIsSending(true);

    try {
      const res = await fetch("/api/ai/brainstorm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newMessages,
          platform,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Brainstorm API failed");
        return;
      }

      const replyText: string = data.reply || "";
      const draftText: string = data.draft || "";

      if (replyText) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: replyText },
        ]);
      }

      // If AI suggested a draft, update the working draft (but don’t lock it)
      if (draftText) {
        setWorkingDraft(draftText);
      }
    } catch (err: any) {
      setError(err?.message || "Error talking to Brainstorm API");
    } finally {
      setIsSending(false);
    }
  }

  function handleUseMessageAsDraft(msg: ChatMessage) {
    setWorkingDraft(msg.content);
  }

  async function handleCopyDraft() {
    if (!workingDraft.trim()) return;
    try {
      await navigator.clipboard.writeText(workingDraft);
      alert("Draft copied to clipboard. You can now paste it into Stories or Campaigns.");
    } catch {
      alert("Could not copy to clipboard – you can still select & copy manually.");
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-50">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8 lg:flex-row">
        {/* LEFT: Chat area */}
        <section className="flex-1 rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-xl shadow-lg flex flex-col">
          {/* Header */}
          <header className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h1 className="text-lg font-semibold text-slate-50">
                🧠 Brainstorm Studio
              </h1>
              <p className="text-xs text-slate-300">
                Talk to your content partner. Riff on ideas until the story feels right.
              </p>
            </div>

            <div className="space-y-1 text-right">
              <label className="block text-[11px] text-slate-300">
                Target platform
              </label>
              <select
                className="rounded-md border border-white/20 bg-black/40 px-2 py-1 text-xs text-slate-50"
                value={platform}
                onChange={(e) => setPlatform(e.target.value as Platform)}
              >
                <option value="LinkedIn">LinkedIn</option>
                <option value="Facebook">Facebook (Fuel Geist)</option>
                <option value="Instagram">Instagram</option>
              </select>
            </div>
          </header>

          {/* Messages */}
          <div className="flex-1 space-y-3 overflow-y-auto rounded-xl border border-white/10 bg-black/30 p-3 text-sm">
            {messages.map((m, idx) => (
              <div
                key={idx}
                className={`max-w-[90%] rounded-xl px-3 py-2 ${
                  m.role === "user"
                    ? "ml-auto bg-emerald-500/80 text-slate-950"
                    : "mr-auto bg-white/10 text-slate-50"
                }`}
              >
                <p className="whitespace-pre-wrap">{m.content}</p>
                {m.role === "assistant" && (
                  <button
                    type="button"
                    onClick={() => handleUseMessageAsDraft(m)}
                    className="mt-1 inline-flex rounded-full border border-white/30 bg-black/30 px-2 py-0.5 text-[10px] text-slate-100 hover:bg-black/50"
                  >
                    Use this as working draft
                  </button>
                )}
              </div>
            ))}
            {messages.length === 0 && (
              <p className="text-xs text-slate-400">
                Start typing below to begin the brainstorm.
              </p>
            )}
          </div>

          {/* Error */}
          {error && (
            <p className="mt-2 rounded-md border border-red-400/40 bg-red-500/10 px-3 py-1.5 text-[11px] text-red-200">
              {error}
            </p>
          )}

          {/* Input */}
          <form onSubmit={handleSend} className="mt-3 space-y-2">
            <textarea
              className="min-h-[70px] w-full rounded-md border border-white/20 bg-black/40 px-3 py-2 text-sm text-slate-50 placeholder:text-slate-400"
              placeholder="For example: 'I want to tell the real story of why I built Root Health, including burnout, trauma, and how the app grew from my own recovery, without sounding salesy.'"
              value={input}
              onChange={(e) => setInput(e.target.value)}
            />
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] text-slate-400">
                Tip: Talk to me like this chat. Ask for tweaks, different angles, more vulnerability, etc.
              </p>
              <button
                type="submit"
                disabled={isSending || !input.trim()}
                className="rounded-md bg-emerald-400 px-3 py-1.5 text-xs font-semibold text-slate-950 shadow-md hover:bg-emerald-300 disabled:opacity-60"
              >
                {isSending ? "Thinking..." : "Send"}
              </button>
            </div>
          </form>
        </section>

        {/* RIGHT: Working draft */}
        <section className="w-full max-w-md rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-xl shadow-lg space-y-3">
          <header>
            <h2 className="text-sm font-semibold text-slate-50">
              Working draft
            </h2>
            <p className="text-[11px] text-slate-300">
              This is the current version you&apos;re shaping. Edit it freely.
              When it feels right, copy it into Stories, Campaigns, or a direct post.
            </p>
          </header>

          <textarea
            className="h-64 w-full rounded-md border border-white/20 bg-black/40 px-3 py-2 text-sm text-slate-50 placeholder:text-slate-400"
            placeholder="When you like something from the brainstorm, click 'Use this as working draft' — or just start writing here."
            value={workingDraft}
            onChange={(e) => setWorkingDraft(e.target.value)}
          />

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleCopyDraft}
              disabled={!workingDraft.trim()}
              className="rounded-md border border-white/30 bg-black/40 px-3 py-1.5 text-xs text-slate-100 hover:bg-black/60 disabled:opacity-60"
            >
              Copy draft to clipboard
            </button>
            <a
              href="/dashboard/stories/new"
              className="rounded-md border border-emerald-400/40 bg-emerald-400/10 px-3 py-1.5 text-xs text-emerald-200 hover:bg-emerald-400/20"
            >
              Open Story Builder
            </a>
            <p className="text-[11px] text-slate-400">
              (For now, paste the draft where you want it. Next step: wire this into Stories automatically.)
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
