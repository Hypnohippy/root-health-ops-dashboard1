"use client";

import { useState } from "react";

export default function ReplyForm() {
  const [platform, setPlatform] = useState("");
  const [direction, setDirection] = useState("outbound");
  const [status, setStatus] = useState("sent");
  const [messageBody, setMessageBody] = useState("");
  const [msg, setMsg] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg("Sending...");

    const res = await fetch("/api/reply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message_body: messageBody,
        platform,
        direction,
        status,
      }),
    });

    const data = await res.json();
    if (res.ok) {
      setMsg("✅ Reply logged in Airtable!");
      setPlatform("");
      setDirection("outbound");
      setStatus("sent");
      setMessageBody("");
    } else {
      setMsg("❌ " + JSON.stringify(data.error || data));
    }
  }

  return (
    <div
      style={{
        background: "white",
        borderRadius: "0.75rem",
        padding: "1rem",
        marginBottom: "1.5rem",
        maxWidth: "520px",
        boxShadow: "0 2px 6px rgba(0,0,0,0.03)",
      }}
    >
      <h2 style={{ fontWeight: 600, marginBottom: "0.75rem" }}>
        Log or send reply
      </h2>
      <form onSubmit={handleSubmit}>
        <textarea
          value={messageBody}
          onChange={(e) => setMessageBody(e.target.value)}
          placeholder="Message text"
          required
          style={{
            display: "block",
            width: "100%",
            marginBottom: "0.5rem",
            minHeight: "80px",
          }}
        />
        <input
          value={platform}
          onChange={(e) => setPlatform(e.target.value)}
          placeholder="Platform (e.g. Reddit, LinkedIn)"
          style={{ display: "block", width: "100%", marginBottom: "0.5rem" }}
        />
        <select
          value={direction}
          onChange={(e) => setDirection(e.target.value)}
          style={{ display: "block", width: "100%", marginBottom: "0.5rem" }}
        >
          <option value="outbound">Outbound (you → user)</option>
          <option value="inbound">Inbound (user → you)</option>
        </select>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          style={{ display: "block", width: "100%", marginBottom: "0.5rem" }}
        >
          <option value="sent">Sent</option>
          <option value="pending">Pending</option>
          <option value="ai_suggested">AI Suggested</option>
          <option value="reviewed">Reviewed</option>
        </select>
        <button
          type="submit"
          style={{
            background: "#16a34a",
            color: "white",
            border: "none",
            borderRadius: "0.4rem",
            padding: "0.4rem 0.9rem",
            cursor: "pointer",
          }}
        >
          Log Reply
        </button>
      </form>
      {msg && <p style={{ marginTop: "0.5rem", fontSize: "0.8rem" }}>{msg}</p>}
    </div>
  );
}
