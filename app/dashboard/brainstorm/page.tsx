// app/dashboard/brainstorm/page.tsx

"use client";

import React, { useState } from "react";

type Role = "user" | "assistant";

type ChatMessage = {
  role: Role;
  content: string;
};

const BrainstormPage: React.FC = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content:
        "Hi, I’m your AI content partner inside Root Health. Tell me about your audience, your industry, and what you’d like this post or series to achieve (engagement, leads, appointments). We’ll shape it together.",
    },
  ]);
  const [input, setInput] = useState("");
  const [industry, setIndustry] = useState("");
  const [platform, setPlatform] = useState("LinkedIn");
  const [goal, setGoal] = useState("leads");
  const [isSending, setIsSending] = useState(false);

  const handleSend = async () => {
    if (!input.trim() || isSending) return;

    const newMessages = [
      ...messages,
      { role: "user" as Role, content: input.trim() },
    ];
    setMessages(newMessages);
    setInput("");
    setIsSending(true);

    try {
      const res = await fetch("/api/ai/brainstorm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newMessages,
          industry: industry || undefined,
          platform: platform || undefined,
          goal: goal || undefined,
        }),
      });

      if (!res.ok) {
        throw new Error("Request failed");
      }

      const data = await res.json();
      const reply = data.reply?.content || "Sorry, I couldn’t generate a reply.";

      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: reply as string },
      ]);
    } catch (err) {
      console.error(err);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            "Something went wrong talking to the AI. Please try again in a moment.",
        },
      ]);
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] p-4 gap-4">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold">AI Content Studio</h1>
        <p className="text-sm text-gray-500">
          Brainstorm posts, stories, and series with an AI that understands
          your audience, platform, and goals. This is the “vibe” space, not just
          a one-shot generator.
        </p>
      </header>

      {/* Context controls */}
      <div className="flex flex-wrap gap-3 text-sm">
        <div className="flex flex-col">
          <label className="mb-1 text-xs text-gray-500">Industry</label>
          <input
            className="border rounded-md px-2 py-1 text-sm min-w-[180px]"
            placeholder="e.g. HR, coaching, finance"
            value={industry}
            onChange={(e) => setIndustry(e.target.value)}
          />
        </div>

        <div className="flex flex-col">
          <label className="mb-1 text-xs text-gray-500">Platform</label>
          <select
            className="border rounded-md px-2 py-1 text-sm"
            value={platform}
            onChange={(e) => setPlatform(e.target.value)}
          >
            <option>LinkedIn</option>
            <option>Facebook</option>
            <option>Instagram</option>
            <option>Email newsletter</option>
            <option>Blog</option>
          </select>
        </div>

        <div className="flex flex-col">
          <label className="mb-1 text-xs text-gray-500">Main Goal</label>
          <select
            className="border rounded-md px-2 py-1 text-sm"
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
          >
            <option value="engagement">Engagement</option>
            <option value="leads">Leads</option>
            <option value="appointments">Appointments</option>
            <option value="awareness">Awareness</option>
          </select>
        </div>
      </div>

      {/* Chat area */}
      <div className="flex-1 border rounded-lg bg-white/80 overflow-hidden flex flex-col">
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {messages.map((m, idx) => (
            <div
              key={idx}
              className={`max-w-[80%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
                m.role === "assistant"
                  ? "bg-gray-100 self-start"
                  : "bg-blue-100 self-end"
              }`}
            >
              {m.content}
            </div>
          ))}
          {isSending && (
            <div className="text-xs text-gray-400 px-1">
              Thinking of ideas…
            </div>
          )}
        </div>

        {/* Input area */}
        <div className="border-t p-3 flex gap-2 items-end">
          <textarea
            className="flex-1 border rounded-md px-2 py-2 text-sm resize-none h-16"
            placeholder="Tell the AI what you want to create (e.g. a 3-part LinkedIn series on burnout for HR leaders, or a vulnerable story like the Root Health origin post)…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <button
            onClick={handleSend}
            disabled={isSending || !input.trim()}
            className="px-4 py-2 rounded-md text-sm font-medium border bg-blue-600 text-white disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSending ? "Sending…" : "Send"}
          </button>
        </div>
      </div>

      <p className="text-[11px] text-gray-400">
        Tip: Once you’ve co-created a post you love, you can copy it into your
        existing Campaign / Stories tools and schedule it like everything else.
      </p>
    </div>
  );
};

export default BrainstormPage;
