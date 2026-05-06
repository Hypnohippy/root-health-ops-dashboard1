"use client";

import { useState } from "react";

export default function ImportTargetsPage() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function upload() {
    if (!file) {
      setMessage("Please choose a CSV file first.");
      return;
    }

    setLoading(true);
    setMessage("");

    const formData = new FormData();
    formData.append("file", file);

    const res = await fetch("/api/growth/import-targets", {
      method: "POST",
      body: formData,
    });

    const json = await res.json();

    if (!json.success) {
      setMessage("❌ " + json.error);
    } else {
      setMessage(`✅ Imported ${json.imported} targets successfully.`);
      setFile(null);
    }

    setLoading(false);
  }

  return (
    <main style={page}>
      <h1 style={title}>📥 Import Growth Targets</h1>

      <p style={subtitle}>
        Upload a CSV from any lead list. The system will keep the useful fields and ignore the rest.
      </p>

      <div style={{ marginTop: 16 }}>
        <a href="/dashboard/growth" style={button}>← Cockpit</a>{" "}
        <a href="/dashboard/growth/followups" style={button}>🎯 Follow-Ups</a>
      </div>

      <section style={card}>
        <h2>Upload CSV</h2>

        <input
          type="file"
          accept=".csv"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          style={input}
        />

        <button onClick={upload} disabled={loading} style={greenButton}>
          {loading ? "Importing..." : "Import Targets"}
        </button>

        {message && <p style={result}>{message}</p>}
      </section>

      <section style={card}>
        <h2>Columns it understands</h2>

        <p style={text}>
          Name, Full Name, First Name, Last Name, Company, Company Name, Job Title,
          Title, Role, Position, LinkedIn URL, Profile URL.
        </p>

        <p style={text}>
          Extra columns are not lost — they are saved into the target notes.
        </p>
      </section>
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
  fontSize: 30,
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
  marginTop: 22,
  background: "#0f172a",
  border: "1px solid #334155",
  borderRadius: 16,
  padding: 18,
};

const input: React.CSSProperties = {
  display: "block",
  marginTop: 12,
  padding: 10,
  background: "#020617",
  color: "#ffffff",
  border: "1px solid #334155",
  borderRadius: 8,
  width: "100%",
};

const greenButton: React.CSSProperties = {
  marginTop: 14,
  padding: "10px 14px",
  borderRadius: 8,
  background: "#22c55e",
  color: "#020617",
  border: "none",
  fontWeight: 800,
  cursor: "pointer",
};

const result: React.CSSProperties = {
  marginTop: 14,
  color: "#86efac",
  fontWeight: 700,
};

const text: React.CSSProperties = {
  color: "#e5e7eb",
  lineHeight: 1.6,
};
