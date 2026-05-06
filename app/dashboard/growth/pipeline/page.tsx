"use client";

import { useEffect, useState } from "react";

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

  async function saveCallOutcome(targetId: string) {
    const callOutcome = (
      document.getElementById(`call-outcome-${targetId}`) as HTMLSelectElement | null
    )?.value;

    const callNotes = (
      document.getElementById(`call-notes-${targetId}`) as HTMLTextAreaElement | null
    )?.value;

    const nextStep = (
      document.getElementById(`next-step-${targetId}`) as HTMLInputElement | null
    )?.value;

    const nextStepDate = (
      document.getElementById(`next-step-date-${targetId}`) as HTMLInputElement | null
    )?.value;

    const res = await fetch("/api/growth/update-call-outcome", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        id: targetId,
        call_outcome: callOutcome || "",
        call_notes: callNotes || "",
        next_step: nextStep || "",
        next_step_date: nextStepDate || null,
      }),
    });

    const json = await res.json();

    if (!json.success) {
      alert(json.error || "Could not save call outcome.");
      return;
    }

    alert("Call outcome saved ✅");
    await loadPipeline();
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
        Prepare for booked calls, record outcomes, and set the next step.
      </p>

      <div style={{ marginTop: 16 }}>
        <a href="/dashboard/growth" style={button}>← Cockpit</a>{" "}
        <a href="/dashboard/growth/followups" style={button}>🎯 Follow-Ups</a>{" "}
        <a href="/dashboard/growth/tracker" style={button}>📊 Tracker</a>
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
                Call date: {new Date(target.call_date).toLocaleString("en-GB")}
              </p>
            )}

            <button
              onClick={() => generateCallPrep(target.id)}
              style={generateButton}
            >
              {loadingPrep === target.id ? "Generating..." : "Generate Call Prep"}
            </button>

            {callPrep[target.id] && (
              <>
                <textarea
                  value={callPrep[target.id]}
                  onChange={(e) => updatePrep(target.id, e.target.value)}
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

            <section style={outcomeBox}>
              <h3 style={{ marginTop: 0 }}>Call Outcome</h3>

              <label style={label}>Outcome</label>
              <select
                id={`call-outcome-${target.id}`}
                defaultValue={target.call_outcome || ""}
                style={input}
              >
                <option value="">Select outcome</option>
                <option value="good_call">Good call</option>
                <option value="proposal_needed">Proposal needed</option>
                <option value="proposal_sent">Proposal sent</option>
                <option value="follow_up_needed">Follow-up needed</option>
                <option value="won">Won</option>
                <option value="lost">Lost</option>
                <option value="no_show">No show</option>
              </select>

              <label style={label}>Call notes</label>
              <textarea
                id={`call-notes-${target.id}`}
                defaultValue={target.call_notes || ""}
                placeholder="What did they say? What matters to them? Any objections?"
                style={textareaSmall}
              />

              <label style={label}>Next step</label>
              <input
                id={`next-step-${target.id}`}
                defaultValue={target.next_step || ""}
                placeholder="e.g. Send pilot proposal, book second call, send pricing"
                style={input}
              />

              <label style={label}>Next step date</label>
              <input
                id={`next-step-date-${target.id}`}
                type="datetime-local"
                defaultValue={
                  target.next_step_date ? target.next_step_date.slice(0, 16) : ""
                }
                style={input}
              />

              <button
                onClick={() => saveCallOutcome(target.id)}
                style={saveButton}
              >
                Save Call Outcome
              </button>
            </section>
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

const outcomeBox: React.CSSProperties = {
  marginTop: 18,
  padding: 14,
  borderRadius: 12,
  background: "#020617",
  border: "1px solid #334155",
};

const label: React.CSSProperties = {
  display: "block",
  marginTop: 10,
  marginBottom: 4,
  color: "#cbd5e1",
};

const input: React.CSSProperties = {
  width: "100%",
  padding: 10,
  borderRadius: 8,
  background: "#0f172a",
  color: "#ffffff",
  border: "1px solid #334155",
};

const textareaSmall: React.CSSProperties = {
  width: "100%",
  minHeight: 90,
  padding: 10,
  borderRadius: 8,
  background: "#0f172a",
  color: "#ffffff",
  border: "1px solid #334155",
};

const saveButton: React.CSSProperties = {
  marginTop: 12,
  padding: "8px 12px",
  borderRadius: 8,
  background: "#38bdf8",
  color: "#020617",
  border: "none",
  fontWeight: 800,
  cursor: "pointer",
};
