"use client";

import { useState } from "react";
import Link from "next/link";

export default function BrainstormPage() {
  const [messages, setMessages] = useState([
    { role: "assistant", text: "👋 Hi David — what would you like to brainstorm today?" }
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  async function sendMessage() {
    if (!input.trim()) return;

    const userMessage = { role: "user", text: input };
    setMessages((m) => [...m, userMessage]);
    setInput("");
    setLoading(true);

    try {
      // This calls your existing /api/ai/reply endpoint
      const res = await fetch("/api/ai/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMessage.text })
      });

      const data = await res.json();

      const aiMessage = {
        role: "assistant",
        text: data.reply || "Something went wrong — no reply received."
      };

      setMessages((m) => [...m, aiMessage]);
    } catch (err) {
      setMessages((m) => [
        ...m,
        { role: "assistant", text: "❌ Error connecting to AI." }
      ]);
    }

    setLoading(false);
  }

  // Helper: Convert all messages into a single block of text
  const compiledOutput = messages
    .filter((m) => m.role === "assistant" || m.role === "user")
    .map((m) => (m.role === "user" ? `🟦 YOU: ${m.text}` : `🟩 AI: ${m.text}`))
    .join("\n\n");

  // Helper to redirect user to prefilled editors
  async function pushTo(type: "single" | "series" | "ad") {
    localStorage.setItem("brainstorm_output", compiledOutput);
    if (type === "single") window.location.href = "/dashboard/content/new";
    if (type === "series") window.location.href = "/dashboard/campaigns/new";
    if (type === "ad") window.location.href = "/dashboard/campaigns/new";
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <h1 className="text-3xl font-bold">🧠 Content Brainstorm Studio</h1>
      <p className="text-sm text-gray-500">
        This is your private space to brainstorm ideas, craft stories, refine messaging,
        and develop perfect LinkedIn/Facebook posts. When you're done → export directly
        into content or campaign tools.
      </p>

      {/* Chat Window */}
      <div className="border rounded-lg p-4 h-[400px] overflow-y-auto bg-white space-y-4">
        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`p-3 rounded-lg max-w-[80%] ${
              msg.role === "assistant"
                ? "bg-green-100 ml-0"
                : "bg-blue-100 ml-auto"
            }`}
          >
            {msg.text}
          </div>
        ))}
      </div>

      {/* Input Bar */}
      <div className="flex gap-4">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type your idea, story, or ask AI something..."
          className="flex-1 border rounded-lg p-3"
        />
        <button
          onClick={sendMessage}
          disabled={loading}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg"
        >
          {loading ? "Thinking…" : "Send"}
        </button>
      </div>

      {/* Export Buttons */}
      <div className="space-y-3">
        <h2 className="font-semibold text-lg">📤 Export Brainstorm</h2>
        <p className="text-gray-500 text-sm">Choose where to send your final content.</p>

        <div className="flex gap-3">
          <button
            onClick={() => pushTo("single")}
            className="px-4 py-2 bg-purple-600 text-white rounded-lg"
          >
            ➕ Create Single Post
          </button>

          <button
            onClick={() => pushTo("series")}
            className="px-4 py-2 bg-orange-600 text-white rounded-lg"
          >
            🔗 Create Series (3-part, storytelling, etc.)
          </button>

          <button
            onClick={() => pushTo("ad")}
            className="px-4 py-2 bg-red-600 text-white rounded-lg"
          >
            📣 Create Paid Ad
          </button>
        </div>
      </div>
    </div>
  );
}
