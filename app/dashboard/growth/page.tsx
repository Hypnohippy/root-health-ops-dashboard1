"use client";

import { useState } from "react";

export default function GrowthPage() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);
  const [saved, setSaved] = useState(false);

  async function generate() {
    setLoading(true);
    setData(null);
    setSaved(false);

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

      const json = await res.json();

      if (!json.success) {
        alert(json.error);
      } else {
        setData(json.data);
        setSaved(true);
      }
    } catch (err: any) {
      alert(err.message);
    }

    setLoading(false);
  }

  function copy(text: string) {
    navigator.clipboard.writeText(text);
  }

  return (
    <div style={{ padding: 24, color: "#fff", background: "#020617", minHeight: "100vh" }}>
      <h1 style={{ fontSize: 28, fontWeight: 700 }}>🚀 Daily Growth Engine</h1>

      <button
        onClick={generate}
        style={{
          marginTop: 16,
          padding: "12px 18px",
          borderRadius: 10,
          background: "#fff",
          color: "#000",
          fontWeight: 700,
        }}
      >
        {loading ? "Generating..." : "Generate Today’s Plan"}
      </button>

      {saved && (
        <p style={{ marginTop: 12, color: "#86efac" }}>
          Saved to Growth Tracker ✅
        </p>
      )}

      {data && (
        <div style={{ marginTop: 24 }}>

          <Section title="LinkedIn Post" onCopy={() => copy(data.linkedin_post)}>
            {data.linkedin_post}
          </Section>

          <Section title="Connection Messages">
            {data.connection_messages.map((msg: string, i: number) => (
              <div key={i} style={{ marginBottom: 10 }}>
                {msg}
                <CopyBtn onClick={() => copy(msg)} />
              </div>
            ))}
          </Section>

          <Section title="DM Message" onCopy={() => copy(data.dm_message)}>
            {data.dm_message}
          </Section>

          <Section title="Follow Up" onCopy={() => copy(data.follow_up_message)}>
            {data.follow_up_message}
          </Section>

          <Section title="SEO Article">
            <strong>{data.seo_article.title}</strong>
            <ul>
              {data.seo_article.outline.map((o: string, i: number) => (
                <li key={i}>{o}</li>
              ))}
            </ul>
          </Section>

        </div>
      )}
    </div>
  );
}

function Section({ title, children, onCopy }: any) {
  return (
    <div
      style={{
        background: "#0f172a",
        padding: 16,
        borderRadius: 10,
        marginBottom: 16,
        border: "1px solid #334155",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <h2>{title}</h2>
        {onCopy && <CopyBtn onClick={onCopy} />}
      </div>
      <div style={{ marginTop: 10, whiteSpace: "pre-wrap" }}>{children}</div>
    </div>
  );
}

function CopyBtn({ onClick }: any) {
  return (
    <button
      onClick={onClick}
      style={{
        background: "#fff",
        color: "#000",
        borderRadius: 6,
        padding: "4px 8px",
        cursor: "pointer",
      }}
    >
      Copy
    </button>
  );
}
