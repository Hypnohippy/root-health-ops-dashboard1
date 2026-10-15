"use client";

import { OpsIntelligenceCard, OpsSurface } from "../../components/visual/OpsSurface";
import { OverviewIcon } from "../relationships/components/RelationshipOverviewVisuals";
import "./import.css";

import { tenantFetch } from "@/lib/tenantFetch";

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

    const res = await tenantFetch("/api/growth/import-targets", {
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
    <div className="growth-import" style={page}>
      <header className="import-header"><div><p className="import-eyebrow">Growth Operations Centre · Import</p>
      <h1 style={title}><OverviewIcon kind="research"/>Import Growth Targets</h1>

      <p style={subtitle}>
        Upload a CSV from any lead list. The system will keep the useful fields and ignore the rest.
      </p>

      </div><span className="import-view-chip">{loading ? "Import in progress" : message.startsWith("✅") ? "Import completed" : "CSV target import"}</span></header>
      <section className="import-intelligence" aria-label="Import briefing"><OpsIntelligenceCard title="What you are bringing in" tone="blue"><p>{file ? file.name : "No file queued"}</p><p>Your chosen CSV is sent only when you select Import Targets.</p></OpsIntelligenceCard><OpsIntelligenceCard title="Before you import" tone="violet"><p>CSV format · names required</p><p>File size, row limits and required names are checked when you import.</p></OpsIntelligenceCard><OpsIntelligenceCard title="What comes next" tone="green"><p>Review the result, then open Targets</p><p>Importing records does not send outreach.</p></OpsIntelligenceCard></section>
      <section className="import-metrics" aria-label="Import requirements and current state">{[["research","CSV","Supported file type"],["task","2 MB","Maximum file size"],["person","1,000","Maximum rows"],["opportunity",loading ? "Importing…" : message.startsWith("✅") ? "Completed" : "Not established","Current import result"]].map(([icon,value,label])=><OpsSurface key={String(label)}><OverviewIcon kind={String(icon)}/><div><strong>{value}</strong><span>{label}</span></div></OpsSurface>)}</section>
      <div className="import-shortcuts" style={{ marginTop: 16 }}>
        <a href="/dashboard/growth" style={button}>← Cockpit</a>{" "}
        <a href="/dashboard/growth/followups" style={button}>🎯 Follow-Ups</a>
      </div>

      <div className="import-workspace"><section className="import-upload" style={card}>
        <h2><OverviewIcon kind="research"/>Upload CSV</h2><p className="import-hint">Choose your source file. Review the result after importing.</p><div className="import-file-panel"><span className="import-file-symbol" aria-hidden="true"><OverviewIcon kind="research"/></span><label htmlFor="growth-import-file">Choose a CSV file</label><p>{file ? file.name : "Select a file to begin"}</p>

        <input
          id="growth-import-file"
          type="file"
          accept=".csv"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          style={input}
        />

        </div>
        <button onClick={upload} disabled={loading} style={greenButton}>
          {loading ? "Importing..." : "Import Targets"}
        </button>

        <div className="import-status" aria-live="polite" aria-atomic="true" data-status={loading ? "loading" : message.startsWith("✅") ? "success" : message ? "error" : "idle"}><OverviewIcon kind={message.startsWith("✅") ? "check" : "task"}/><div><strong>{loading ? "Importing…" : message ? "Import result" : "Ready when you are"}</strong>{message ? <p style={result}>{message}</p> : <p>No import has been confirmed in this session.</p>}</div></div>
      </section>

      <aside className="import-context"><section style={card}>
        <h2><OverviewIcon kind="task"/>Columns it understands</h2>

        <p style={text}>
          Name, Full Name, First Name, Last Name, Company, Company Name, Job Title,
          Title, Role, Position, LinkedIn URL, Profile URL.
        </p>

        <p style={text}>
          Extra columns are not lost — they are saved into the target notes.
        </p>
      </section><OpsSurface className="import-validation"><h2><OverviewIcon kind="opportunity"/>Validation &amp; next steps</h2><ol><li><span>1</span><div><strong>Choose the source</strong><p>Select the CSV you want to bring into Growth.</p></div></li><li><span>2</span><div><strong>Import &amp; check the result</strong><p>Rows need a name to become targets. Check the import result before continuing.</p></div></li><li><span>3</span><div><strong>Review in Targets</strong><p>Review the imported contacts before outreach.</p></div></li></ol></OpsSurface></aside></div>
    </div>
  );
}

const page: React.CSSProperties = {
  padding: 0,
  color: "#12213e",
  background: "#f3f7ff",
  minHeight: "100%",
};

const title: React.CSSProperties = {
  fontSize: 30,
  fontWeight: 800,
};

const subtitle: React.CSSProperties = {
  color: "#53627b",
};

const button: React.CSSProperties = {
  display: "inline-block",
  padding: "8px 12px",
  borderRadius: 10,
  background: "#ffffff",
  color: "#12213e",
  border: "1px solid #d4ddec",
  textDecoration: "none",
  fontWeight: 700,
};

const card: React.CSSProperties = {
  marginTop: 22,
  background: "#ffffff",
  border: "1px solid #d4ddec",
  borderRadius: 16,
  padding: 18,
};

const input: React.CSSProperties = {
  display: "block",
  marginTop: 12,
  padding: 10,
  background: "#f3f7ff",
  color: "#12213e",
  border: "1px solid #d4ddec",
  borderRadius: 8,
  width: "100%",
};

const greenButton: React.CSSProperties = {
  marginTop: 14,
  padding: "10px 14px",
  borderRadius: 8,
  background: "#087a50",
  color: "#ffffff",
  border: "none",
  fontWeight: 800,
  cursor: "pointer",
};

const result: React.CSSProperties = {
  marginTop: 14,
  color: "#087a50",
  fontWeight: 700,
};

const text: React.CSSProperties = {
  color: "#334965",
  lineHeight: 1.6,
};
