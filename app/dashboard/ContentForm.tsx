"use client";

import { useState } from "react";

export default function ContentForm() {
  const [title, setTitle] = useState("");
  const [platform, setPlatform] = useState("");
  const [status, setStatus] = useState("ready");
  const [notes, setNotes] = useState("");
  const [msg, setMsg] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg("Sending...");
    const res = await fetch("/api/content", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, platform, status, notes }),
    });
    const data = await res.json();
    if (res.ok) {
      setMsg("✅ Saved to Airtable (refresh to see it below)");
      setTitle("");
      setPlatform("");
      setStatus("ready");
      setNotes("");
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
        Create new content
      </h2>
      <form onSubmit={handleSubmit}>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title"
          required
          style={{ display: "block", width: "100%", marginBottom: "0.5rem" }}
        />
        <input
          value={platform}
          onChange={(e) => setPlatform(e.target.value)}
          placeholder="Platform (Instagram, LinkedIn, Reddit...)"
          style={{ display: "block", width: "100%", marginBottom: "0.5rem" }}
        />
        <input
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          placeholder="Status (ready/draft/posted)"
          style={{ display: "block", width: "100%", marginBottom: "0.5rem" }}
        />
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Post body / notes"
          style={{
            display: "block",
            width: "100%",
            marginBottom: "0.5rem",
            minHeight: "80px",
          }}
        />
        <button
          type="submit"
          style={{
            background: "#2563eb",
            color: "white",
            border: "none",
            borderRadius: "0.4rem",
            padding: "0.4rem 0.9rem",
            cursor: "pointer",
          }}
        >
          Save to Airtable
        </button>
      </form>
      {msg && <p style={{ marginTop: "0.5rem", fontSize: "0.8rem" }}>{msg}</p>}
    </div>
  );
}
