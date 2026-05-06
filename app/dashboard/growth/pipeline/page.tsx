"use client";

import { useEffect, useMemo, useState } from "react";

export default function GrowthPipelinePage() {
  const [targets, setTargets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [callPrep, setCallPrep] = useState<Record<string, string>>({});
  const [loadingPrep, setLoadingPrep] = useState<string | null>(null);

  useEffect(() => {
    loadPipeline();
  }, []);

  async function loadPipeline() {
    setLoading(true);

    const res = await fetch("/api/growth/pipeline");
    const json = await res.json();

    if (json.success) {
      setTargets(json.data || []);
    }

    setLoading(false);
  }

  async function generateCallPrep(targetId: string) {
    setLoadingPrep(targetId);

    const res = await fetch("/api/growth/generate-call-prep", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ targetId }),
    });

    const json = await res.json();

    if (!json.success) {
      alert(json.error || "Failed to generate call prep.");
      setLoadingPrep(null);
      return;
    }

    setCallPrep((prev) => ({
      ...prev,
      [targetId]: json.prep || "",
    }));

    setLoadingPrep(null);
  }

  function updatePrep(targetId: string, value: string) {
    setCallPrep((prev) => ({
      ...prev,
      [targetId]: value,
    }));
  }

  function copy(text: string) {
    navigator.clipboard.writeText(text || "");
    alert("Copied ✅");
  }

  const calls = targets.filter((t) => t.reply_status === "call_booked");

  return (
    <main style={page}>
      <h1 style={title}>📅 Calls & Call Prep</h1>

      <p style={subtitle}>
        Prepare for booked calls with structured, editable AI-generated prep.
      </p>

      <div style={{ marginTop: 16 }}>
        <a href="/dashboard/growth" style={button}>← Cockpit</a>{" "}
        <a href="/dashboard/growth/pipeline" style={button}>💼 Pipeline</a>
      </div>

      {loading ? (
        <p style={muted}>Loading calls...</p>
      ) : calls.length === 0 ? (
        <p style={muted}>No calls booked yet.</p>
      ) : (
        calls.map((target) => (
          <article key={target.id} style={card}>
            <h2 style={{ marginBottom: 4 }}>{target.target_name}</h2>

            <p style={muted}>
              {target.role_title || "Role not added"} ·{" "}
              {target.company || "Company not added"}
            </p>

            <p style={green}>
              Deal value: £{Number(target.deal_value || 1500).toLocaleString()}
            </p>

            {target.call_date && (
              <p style={date}>
                Call date:{" "}
                {new Date(target.call_date).toLocaleString("en-GB")}
              </p>
            )}

            <button
              onClick={() => generateCallPrep(target.id)}
              style={generateButton}
            >
              {loadingPrep === target.id
                ? "Generating..."
                : "Generate Call Prep"}
            </button>

            {callPrep[target.id] && (
              <>
                <textarea
                  value={callPrep[target.id]}
                  onChange={(e) =>
                    updatePrep(target.id, e.target.value)
                  }
                  style={textarea}
                />

                <button
                  onClick={() => copy(callPrep[target.id])}
                  style={copyButton}
                >
                  Copy Call Prep
                </button>
              </>
            )}
          </article>
        ))
      )}
    </main>
  );
}

const page: React.CSSProperties = {
  padding: 24,
  color: "#ffffff",
  background: "#020617",
  minHeight: "100vh",
};

const title: React.CSSProperties = {
  fontSize: 28,
  fontWeight: 800,
};

const subtitle: React.CSSProperties = {
  color: "#cbd5e1",
};

const button: React.CSSProperties = {
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
  marginTop: 16,
  padding: 16,
  borderRadius: 12,
  background: "#0f172a",
  border: "1px solid #334155",
};

const muted: React.CSSProperties = {
  color: "#94a3b8",
};

const green: React.CSSProperties = {
  color: "#86efac",
  fontWeight: 700,
};

const date: React.CSSProperties = {
  color: "#93c5fd",
};

const generateButton: React.CSSProperties = {
  marginTop: 10,
  padding: "8px 12px",
  borderRadius: 8,
  background: "#facc15",
  color: "#020617",
  border: "none",
  fontWeight: 800,
  cursor: "pointer",
};

const textarea: React.CSSProperties = {
  width: "100%",
  minHeight: 200,
  marginTop: 12,
  padding: 12,
  borderRadius: 10,
  background: "#020617",
  color: "#ffffff",
  border: "1px solid #334155",
  whiteSpace: "pre-wrap",
  lineHeight: 1.6,
};

const copyButton: React.CSSProperties = {
  marginTop: 10,
  padding: "8px 12px",
  borderRadius: 8,
  background: "#22c55e",
  color: "#020617",
  border: "none",
  fontWeight: 800,
  cursor: "pointer",
};
