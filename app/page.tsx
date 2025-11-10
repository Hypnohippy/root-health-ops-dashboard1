"use client";

import { useState } from "react";

export default function DashboardPage() {
  const [title, setTitle] = useState("");
  const [platform, setPlatform] = useState("");
  const [status, setStatus] = useState("draft");
  const [notes, setNotes] = useState("");
  const [message, setMessage] = useState("");

  async function createContent(e: React.FormEvent) {
    e.preventDefault();
    setMessage("Sending...");
    try {
      const res = await fetch("/api/content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, platform, status, notes }),
      });
      const data = await res.json();
      if (res.ok) {
        setMessage("✅ Content sent to Airtable!");
        setTitle("");
        setPlatform("");
        setStatus("draft");
        setNotes("");
      } else {
        setMessage("❌ Error: " + JSON.stringify(data.error || data));
      }
    } catch (err: any) {
      setMessage("❌ " + err.message);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f8fafc",
        color: "#0f172a",
        fontFamily: "system-ui, sans-serif",
        padding: "2rem",
      }}
    >
      <h1 style={{ fontSize: "2rem", fontWeight: "bold", marginBottom: "1rem" }}>
        Root Health Dashboard
      </h1>
      <h2 style={{ fontSize: "1.25rem", marginBottom: "1rem" }}>
        Create new Content (sends to Airtable)
      </h2>

      <form
        onSubmit={createContent}
        style={{
          background: "white",
          borderRadius: "0.75rem",
          padding: "1.5rem",
          boxShadow: "0 2px 6px rgba(0,0,0,0.1)",
          maxWidth: "480px",
        }}
      >
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title"
          style={{ display: "block", width: "100%", marginBottom: "0.5rem" }}
        />
        <input
          value={platform}
          onChange={(e) => setPlatform(e.target.value)}
          placeholder="Platform (e.g. Reddit, Instagram)"
          style={{ display: "block", width: "100%", marginBottom: "0.5rem" }}
        />
        <input
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          placeholder="Status"
          style={{ display: "block", width: "100%", marginBottom: "0.5rem" }}
        />
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notes / caption / post body"
          style={{
            display: "block",
            width: "100%",
            marginBottom: "0.75rem",
            minHeight: "100px",
          }}
        />
        <button
          type="submit"
          style={{
            background: "#2563eb",
            color: "white",
            border: "none",
            borderRadius: "0.5rem",
            padding: "0.5rem 1rem",
            cursor: "pointer",
          }}
        >
          Send to Airtable
        </button>
      </form>

      {message && (
        <p style={{ marginTop: "1rem", fontWeight: "500" }}>{message}</p>
      )}
    </div>
  );
}
