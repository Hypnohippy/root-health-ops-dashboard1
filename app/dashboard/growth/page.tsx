"use client";

import { useEffect, useState } from "react";

export default function GrowthPage() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);
  const [saved, setSaved] = useState(false);
  const [followups, setFollowups] = useState<any[]>([]);
  const [followupsLoading, setFollowupsLoading] = useState(true);

  useEffect(() => {
    loadFollowups();
  }, []);

  async function loadFollowups() {
    setFollowupsLoading(true);

    try {
      const res = await fetch("/api/growth/followups-due");
      const json = await res.json();

      if (json.success) {
        setFollowups((json.data || []).slice(0, 10));
      }
    } catch {
      setFollowups([]);
    }

    setFollowupsLoading(false);
  }

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

  async function markSent(target: any) {
    await fetch("/api/growth/mark-sent", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        id: target.id,
        stage: target.stage,
      }),
    });

    await loadFollowups();
  }

  function copy(text: string) {
    navigator.clipboard.writeText(text);
  }

  return (
    <div style={page}>
      <h1 style={title}>🚀 Daily Growth Cockpit</h1>

      <p style={subtitle}>
        Generate today’s content, then work through the people who need a message today.
      </p>

      <div style={{ marginTop: 16 }}>
        <a href="/dashboard/growth/tracker" style={smallLink}>📊 Tracker</a>{" "}
        <a href="/dashboard/growth/followups" style={smallLink}>🎯 Follow-Ups</a>
      </div>

      <section style={card}>
        <h2>1. Generate Today’s Plan</h2>

        <button onClick={generate} style={mainButton} disabled={loading}>
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
              {data.connection_messages?.map((msg: string, i: number) => (
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
              <strong>{data.seo_article?.title}</strong>
              <ul>
                {data.seo_article?.outline?.map((o: string, i: number) => (
                  <li key={i}>{o}</li>
                ))}
              </ul>
            </Section>
          </div>
        )}
      </section>

      <section style={card}>
        <h2>2. Message These People Today</h2>

        {followupsLoading ? (
          <p style={muted}>Loading follow-ups...</p>
        ) : followups.length === 0 ? (
          <p style={muted}>No follow-ups due today.</p>
        ) : (
          followups.map((target: any) => (
            <article key={target.id} style={targetCard}>
              <h3 style={{ margin: 0 }}>{target.target_name}</h3>

              <p style={muted}>
                {target.role_title || "Role not added"} · {target.company || "Company not added"}
              </p>

              <p style={stage}>Stage: {target.stage}</p>

              {target.linkedin_url && (
                <a href={target.linkedin_url} target="_blank" style={profileLink}>
                  Open LinkedIn profile
                </a>
              )}

              <div style={messageBox}>
                {target.suggested_message}
              </div>

              <button onClick={() => copy(target.suggested_message)} style={copyButton}>
                Copy Message
              </button>

              <button onClick={() => markSent(target)} style={sentButton}>
                Mark Sent / Move Next
              </button>
            </article>
          ))
        )}
      </section>
    </div>
  );
}

function Section({ title, children, onCopy }: any) {
  return (
    <div style={section}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
        <h2 style={{ margin: 0 }}>{title}</h2>
        {onCopy && <CopyBtn onClick={onCopy} />}
      </div>

      <div style={{ marginTop: 10, whiteSpace: "pre-wrap", lineHeight: 1.6 }}>
        {children}
      </div>
    </div>
  );
}

function CopyBtn({ onClick }: any) {
  return (
    <button onClick={onClick} style={copyButton}>
      Copy
    </button>
  );
}

const page: React.CSSProperties = {
  padding: 24,
  color: "#ffffff",
  background: "#020617",
  minHeight: "100vh",
};

const title: React.CSSProperties = {
  fontSize: 30,
  fontWeight: 800,
};

const subtitle: React.CSSProperties = {
  marginTop: 8,
  color: "#cbd5e1",
};

const smallLink: React.CSSProperties = {
  display: "inline-block",
  padding: "8px 12px",
  borderRadius: 10,
  background: "#0f172a",
  color: "#ffffff",
  border: "1px solid #334155",
  textDecoration: "none",
  fontWeight: 700,
};

const card: React.CSSProperties = {
  marginTop: 22,
  background: "#0f172a",
  border: "1px solid #334155",
  borderRadius: 16,
  padding: 18,
};

const mainButton: React.CSSProperties = {
  marginTop: 12,
  padding: "12px 18px",
  borderRadius: 10,
  background: "#ffffff",
  color: "#020617",
  border: "none",
  fontWeight: 800,
  cursor: "pointer",
};

const section: React.CSSProperties = {
  background: "#020617",
  padding: 16,
  borderRadius: 12,
  marginBottom: 16,
  border: "1px solid #334155",
};

const targetCard: React.CSSProperties = {
  marginTop: 14,
  background: "#020617",
  border: "1px solid #334155",
  borderRadius: 12,
  padding: 14,
};

const muted: React.CSSProperties = {
  color: "#94a3b8",
};

const stage: React.CSSProperties = {
  color: "#facc15",
  fontWeight: 700,
};

const profileLink: React.CSSProperties = {
  display: "inline-block",
  marginBottom: 10,
  color: "#93c5fd",
};

const messageBox: React.CSSProperties = {
  marginTop: 10,
  background: "#0f172a",
  border: "1px solid #334155",
  borderRadius: 10,
  padding: 14,
  whiteSpace: "pre-wrap",
  lineHeight: 1.6,
};

const copyButton: React.CSSProperties = {
  marginTop: 10,
  marginRight: 10,
  padding: "7px 10px",
  borderRadius: 8,
  background: "#ffffff",
  color: "#020617",
  border: "none",
  fontWeight: 700,
  cursor: "pointer",
};

const sentButton: React.CSSProperties = {
  marginTop: 10,
  padding: "7px 10px",
  borderRadius: 8,
  background: "#22c55e",
  color: "#020617",
  border: "none",
  fontWeight: 800,
  cursor: "pointer",
};
