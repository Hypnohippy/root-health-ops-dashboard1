"use client";

import { useEffect, useMemo, useState } from "react";

export default function GrowthPipelinePage() {
  const [targets, setTargets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [generatedMessages, setGeneratedMessages] = useState<Record<string, string>>({});
  const [generatingFor, setGeneratingFor] = useState<string | null>(null);

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

  async function updateDeal(targetId: string) {
    const callDate = (
      document.getElementById(`call-date-${targetId}`) as HTMLInputElement | null
    )?.value;

    const dealValue = (
      document.getElementById(`deal-value-${targetId}`) as HTMLInputElement | null
    )?.value;

    const dealStage = (
      document.getElementById(`deal-stage-${targetId}`) as HTMLSelectElement | null
    )?.value;

    const res = await fetch("/api/growth/update-deal", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        id: targetId,
        call_date: callDate || null,
        deal_value: dealValue || 1500,
        deal_stage: dealStage || "lead",
      }),
    });

    const json = await res.json();

    if (!json.success) {
      alert(json.error || "Could not update deal.");
      return;
    }

    alert("Deal updated ✅");
    await loadPipeline();
  }

  async function generateMessage(targetId: string) {
    const messageType = (
      document.getElementById(`message-type-${targetId}`) as HTMLSelectElement | null
    )?.value || "next_best_message";

    setGeneratingFor(targetId);

    const res = await fetch("/api/growth/generate-message", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        targetId,
        messageType,
      }),
    });

    const json = await res.json();

    if (!json.success) {
      alert(json.error || "Could not generate message.");
      setGeneratingFor(null);
      return;
    }

    setGeneratedMessages((prev) => ({
      ...prev,
      [targetId]: json.message || "",
    }));

    setGeneratingFor(null);
  }

  function updateGeneratedMessage(targetId: string, value: string) {
    setGeneratedMessages((prev) => ({
      ...prev,
      [targetId]: value,
    }));
  }

  function copy(text: string) {
    navigator.clipboard.writeText(text || "");
    alert("Copied ✅");
  }

  const warm = targets.filter((t) => t.reply_status === "warm_lead");
  const calls = targets.filter((t) => t.reply_status === "call_booked");
  const replied = targets.filter((t) => t.reply_status === "replied");
  const noReply = targets.filter((t) => !t.reply_status || t.reply_status === "no_reply");
  const notInterested = targets.filter((t) => t.reply_status === "not_interested");

  const hotLeads = useMemo(() => {
    const recentReplies = targets.filter((t) => {
      if (!t.replied_at) return false;
      const diff = Date.now() - new Date(t.replied_at).getTime();
      return diff < 1000 * 60 * 60 * 48;
    });

    const combined = [...warm, ...calls, ...recentReplies];

    return combined.filter(
      (target, index, self) =>
        index === self.findIndex((t) => t.id === target.id)
    );
  }, [targets]);

  const pipelineValue = targets
    .filter((t) =>
      ["warm_lead", "call_booked"].includes(t.reply_status || "")
    )
    .reduce((sum, t) => sum + Number(t.deal_value || 1500), 0);

  const bookedValue = targets
    .filter((t) => t.reply_status === "call_booked")
    .reduce((sum, t) => sum + Number(t.deal_value || 1500), 0);

  return (
    <main style={page}>
      <h1 style={title}>💼 Growth Pipeline</h1>

      <p style={subtitle}>
        Track replies, calls booked, deal value and generate editable client-specific messages.
      </p>

      <div style={{ marginTop: 16 }}>
        <a href="/dashboard/growth" style={button}>← Cockpit</a>{" "}
        <a href="/dashboard/growth/followups" style={button}>🎯 Follow-Ups</a>{" "}
        <a href="/dashboard/growth/tracker" style={button}>📊 Tracker</a>
      </div>

      {loading ? (
        <p style={muted}>Loading pipeline...</p>
      ) : (
        <>
          <div style={statsGrid}>
            <Stat label="Warm Leads" value={warm.length} />
            <Stat label="Calls Booked" value={calls.length} />
            <Stat label="Pipeline Value" value={`£${pipelineValue.toLocaleString()}`} />
            <Stat label="Booked Value" value={`£${bookedValue.toLocaleString()}`} />
          </div>

          <PipelineSection
            title="🔥 Hot Leads / Focus Today"
            targets={hotLeads}
            onSave={updateDeal}
            onGenerate={generateMessage}
            generatingFor={generatingFor}
            generatedMessages={generatedMessages}
            onMessageChange={updateGeneratedMessage}
            onCopy={copy}
          />

          <PipelineSection
            title="🔥 Warm Leads"
            targets={warm}
            onSave={updateDeal}
            onGenerate={generateMessage}
            generatingFor={generatingFor}
            generatedMessages={generatedMessages}
            onMessageChange={updateGeneratedMessage}
            onCopy={copy}
          />

          <PipelineSection
            title="📅 Calls Booked"
            targets={calls}
            onSave={updateDeal}
            onGenerate={generateMessage}
            generatingFor={generatingFor}
            generatedMessages={generatedMessages}
            onMessageChange={updateGeneratedMessage}
            onCopy={copy}
          />

          <PipelineSection
            title="💬 Replied"
            targets={replied}
            onSave={updateDeal}
            onGenerate={generateMessage}
            generatingFor={generatingFor}
            generatedMessages={generatedMessages}
            onMessageChange={updateGeneratedMessage}
            onCopy={copy}
          />

          <PipelineSection
            title="⏳ No Reply Yet"
            targets={noReply}
            onSave={updateDeal}
            onGenerate={generateMessage}
            generatingFor={generatingFor}
            generatedMessages={generatedMessages}
            onMessageChange={updateGeneratedMessage}
            onCopy={copy}
          />

          <PipelineSection
            title="🚫 Not Interested"
            targets={notInterested}
            onSave={updateDeal}
            onGenerate={generateMessage}
            generatingFor={generatingFor}
            generatedMessages={generatedMessages}
            onMessageChange={updateGeneratedMessage}
            onCopy={copy}
          />
        </>
      )}
    </main>
  );
}

function Stat({ label, value }: { label: string; value: any }) {
  return (
    <div style={statCard}>
      <div style={statValue}>{value}</div>
      <div style={statLabel}>{label}</div>
    </div>
  );
}

function PipelineSection({
  title,
  targets,
  onSave,
  onGenerate,
  generatingFor,
  generatedMessages,
  onMessageChange,
  onCopy,
}: {
  title: string;
  targets: any[];
  onSave: (id: string) => void;
  onGenerate: (id: string) => void;
  generatingFor: string | null;
  generatedMessages: Record<string, string>;
  onMessageChange: (id: string, value: string) => void;
  onCopy: (text: string) => void;
}) {
  return (
    <section style={section}>
      <h2>{title}</h2>

      {targets.length === 0 ? (
        <p style={muted}>Nothing here yet.</p>
      ) : (
        targets.map((target: any) => (
          <article key={target.id} style={card}>
            <h3 style={{ margin: 0 }}>{target.target_name}</h3>

            <p style={muted}>
              {target.role_title || "Role not added"} · {target.company || "Company not added"}
            </p>

            <p style={stage}>Outreach stage: {target.stage || "connection"}</p>
            <p style={greenText}>Reply status: {target.reply_status || "no_reply"}</p>

            {target.linkedin_url && (
              <p>
                <a href={target.linkedin_url} target="_blank" style={link}>
                  Open LinkedIn profile
                </a>
              </p>
            )}

            {target.reply_notes && (
              <>
                <h4 style={smallTitle}>Reply Notes</h4>
                <p style={text}>{target.reply_notes}</p>
              </>
            )}

            <div style={messageGeneratorBox}>
              <h4 style={{ marginTop: 0 }}>Generate Editable Message</h4>

              <label style={label}>Message type</label>
              <select
                id={`message-type-${target.id}`}
                defaultValue="next_best_message"
                style={input}
              >
                <option value="next_best_message">Next best message</option>
                <option value="linkedin_follow_up">LinkedIn follow-up</option>
                <option value="email_intro">Email intro</option>
                <option value="pilot_proposal_intro">Pilot proposal intro</option>
                <option value="call_booking_message">Call booking message</option>
                <option value="post_call_follow_up">Post-call follow-up</option>
                <option value="gentle_nudge">Gentle nudge</option>
              </select>

              <button
                onClick={() => onGenerate(target.id)}
                style={generateButton}
                disabled={generatingFor === target.id}
              >
                {generatingFor === target.id ? "Generating..." : "Generate Message"}
              </button>

              {generatedMessages[target.id] && (
                <>
                  <label style={label}>Editable finished message</label>
                  <textarea
                    value={generatedMessages[target.id]}
                    onChange={(e) => onMessageChange(target.id, e.target.value)}
                    style={editableMessage}
                  />

                  <button
                    onClick={() => onCopy(generatedMessages[target.id])}
                    style={copyButton}
                  >
                    Copy Edited Message
                  </button>
                </>
              )}
            </div>

            <div style={dealBox}>
              <h4 style={{ marginTop: 0 }}>Deal Tracking</h4>

              <label style={label}>Call date</label>
              <input
                id={`call-date-${target.id}`}
                type="datetime-local"
                defaultValue={target.call_date ? target.call_date.slice(0, 16) : ""}
                style={input}
              />

              <label style={label}>Deal value (£)</label>
              <input
                id={`deal-value-${target.id}`}
                type="number"
                defaultValue={target.deal_value || 1500}
                style={input}
              />

              <label style={label}>Deal stage</label>
              <select
                id={`deal-stage-${target.id}`}
                defaultValue={target.deal_stage || "lead"}
                style={input}
              >
                <option value="lead">Lead</option>
                <option value="discovery_booked">Discovery booked</option>
                <option value="proposal_needed">Proposal needed</option>
                <option value="proposal_sent">Proposal sent</option>
                <option value="won">Won</option>
                <option value="lost">Lost</option>
              </select>

              <button onClick={() => onSave(target.id)} style={saveButton}>
                Save Deal
              </button>
            </div>

            {target.replied_at && (
              <p style={date}>
                Reply updated: {new Date(target.replied_at).toLocaleString("en-GB")}
              </p>
            )}
          </article>
        ))
      )}
    </section>
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

const statsGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
  gap: 12,
  marginTop: 22,
};

const statCard: React.CSSProperties = {
  background: "#0f172a",
  border: "1px solid #334155",
  borderRadius: 14,
  padding: 16,
};

const statValue: React.CSSProperties = {
  fontSize: 28,
  fontWeight: 800,
};

const statLabel: React.CSSProperties = {
  color: "#94a3b8",
};

const section: React.CSSProperties = {
  marginTop: 24,
  background: "#0f172a",
  border: "1px solid #334155",
  borderRadius: 16,
  padding: 18,
};

const card: React.CSSProperties = {
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

const greenText: React.CSSProperties = {
  color: "#86efac",
  fontWeight: 700,
};

const link: React.CSSProperties = {
  color: "#93c5fd",
};

const smallTitle: React.CSSProperties = {
  marginTop: 12,
  marginBottom: 6,
};

const text: React.CSSProperties = {
  whiteSpace: "pre-wrap",
  lineHeight: 1.6,
};

const messageGeneratorBox: React.CSSProperties = {
  marginTop: 16,
  padding: 14,
  borderRadius: 12,
  background: "#0f172a",
  border: "1px solid #334155",
};

const dealBox: React.CSSProperties = {
  marginTop: 16,
  padding: 14,
  borderRadius: 12,
  background: "#0f172a",
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
  padding: 9,
  borderRadius: 8,
  background: "#020617",
  color: "#ffffff",
  border: "1px solid #334155",
};

const editableMessage: React.CSSProperties = {
  width: "100%",
  minHeight: 180,
  marginTop: 8,
  padding: 12,
  borderRadius: 10,
  background: "#020617",
  color: "#ffffff",
  border: "1px solid #334155",
  whiteSpace: "pre-wrap",
  lineHeight: 1.6,
};

const generateButton: React.CSSProperties = {
  marginTop: 12,
  padding: "8px 12px",
  borderRadius: 8,
  background: "#facc15",
  color: "#020617",
  border: "none",
  fontWeight: 800,
  cursor: "pointer",
};

const copyButton: React.CSSProperties = {
  marginTop: 10,
  padding: "8px 12px",
  borderRadius: 8,
  background: "#ffffff",
  color: "#020617",
  border: "none",
  fontWeight: 800,
  cursor: "pointer",
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

const date: React.CSSProperties = {
  color: "#94a3b8",
  fontSize: 13,
};
