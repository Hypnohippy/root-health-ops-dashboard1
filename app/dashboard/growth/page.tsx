"use client";

import { useState } from "react";

export default function GrowthPage() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function generate() {
    setLoading(true);
    setResult(null);

    try {
      const res = await fetch("/api/ai/growth-engine", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          day: new Date().getDate(),
        }),
      });

      const data = await res.json();

      if (!data.success) {
        setResult("❌ API Error: " + (data.error || "Unknown error"));
      } else {
        setResult(data.data);
      }
    } catch (err: any) {
      setResult("❌ Browser Error: " + err.message);
    }

    setLoading(false);
  }

  return (
    <div
      style={{
        padding: 24,
        color: "#ffffff",
        background: "#020617",
        minHeight: "100vh",
      }}
    >
      <h1 style={{ fontSize: 28, fontWeight: 700, color: "#ffffff" }}>
        🚀 Daily Growth Engine
      </h1>

      <p style={{ marginTop: 8, color: "#cbd5e1" }}>
        Generate today’s LinkedIn post, outreach messages, follow-up and SEO idea.
      </p>

      <button
        onClick={generate}
        disabled={loading}
        style={{
          marginTop: 16,
          padding: "12px 18px",
          borderRadius: 10,
          background: "#ffffff",
          color: "#020617",
          cursor: loading ? "not-allowed" : "pointer",
          border: "none",
          fontWeight: 700,
        }}
      >
        {loading ? "Generating..." : "Generate Today’s Plan"}
      </button>

      {result && (
        <div
          style={{
            marginTop: 24,
            background: "#0f172a",
            color: "#ffffff",
            padding: 18,
            borderRadius: 12,
            whiteSpace: "pre-wrap",
            border: "1px solid #334155",
            lineHeight: 1.6,
          }}
        >
          {result}
        </div>
      )}
    </div>
  );
}
