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
    <div style={{ padding: 24 }}>
      <h1 style={{ fontSize: 24, fontWeight: 600 }}>
        🚀 Daily Growth Engine
      </h1>

      <button
        onClick={generate}
        style={{
          marginTop: 16,
          padding: "10px 16px",
          borderRadius: 8,
          background: "#111",
          color: "#fff",
          cursor: "pointer",
        }}
      >
        {loading ? "Generating..." : "Generate Today’s Plan"}
      </button>

      {result && (
        <div
          style={{
            marginTop: 20,
            background: "#f5f5f5",
            padding: 16,
            borderRadius: 8,
            whiteSpace: "pre-wrap",
          }}
        >
          {result}
        </div>
      )}
    </div>
  );
}
