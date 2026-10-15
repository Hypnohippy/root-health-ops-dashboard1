"use client";

import { OpsIntelligenceCard, OpsSurface } from "../../components/visual/OpsSurface";
import { OverviewIcon, RelationshipAvatar } from "../relationships/components/RelationshipOverviewVisuals";
import "./pipeline.css";

import { tenantFetch } from "@/lib/tenantFetch";

import { useCallback, useEffect, useState } from "react";
import OutreachWorkspace, { type OutreachTarget } from "./OutreachWorkspace";

type PipelineTarget = OutreachTarget & { reply_status?: string; deal_stage?: string; deal_value?: number | null;
  call_date?: string; call_outcome?: string; call_notes?: string; next_step?: string; next_step_date?: string };

export default function GrowthPipelinePage() {
  const [targets, setTargets] = useState<PipelineTarget[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [callPrep, setCallPrep] = useState<Record<string, string>>({});
  const [loadingPrep, setLoadingPrep] = useState<string | null>(null);
  const [view, setView] = useState<"warm" | "meetings">("meetings");
  const [targetId] = useState(() => typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("targetId"));

  const loadPipeline = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
    const res = await tenantFetch(`/api/growth/pipeline${targetId ? `?targetId=${encodeURIComponent(targetId)}` : ""}`);
    const json = await res.json();

    if (!res.ok || !json.success) throw Error(json.error || "Unable to load contacts.");
    setTargets(json.data || []);
    } catch (e) { setTargets([]); setError(e instanceof Error ? e.message : "Unable to load contacts."); }
    finally { setLoading(false); }
  }, [targetId]);

  useEffect(() => {
    setView(new URLSearchParams(window.location.search).get("view") === "warm" ? "warm" : "meetings");
    void loadPipeline();
  }, [loadPipeline]);

  async function generateCallPrep(targetId: string) {
    setLoadingPrep(targetId);

    const res = await tenantFetch("/api/growth/generate-call-prep", {
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

    const res = await tenantFetch("/api/growth/update-call-outcome", {
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

  const calls = targets.filter((t) => targetId ? t.id === targetId : view === "warm"
    ? ["positive", "interested", "engaged", "call_booked"].includes(t.reply_status || "") || ["engaged", "opportunity", "meeting"].includes(t.deal_stage || "")
    : t.reply_status === "call_booked" || ["meeting", "converted", "won"].includes(t.deal_stage || ""));

  return (
    <div className="growth-pipeline" style={page}>
      <header className="pipeline-header"><div><p className="pipeline-eyebrow">Growth Operations Centre · Pipeline</p>
      <h1 style={title}><OverviewIcon kind="opportunity"/>{targetId ? "Contact record" : view === "warm" ? "Active opportunities" : "📅 Meetings & outcomes"}</h1>

      <p style={subtitle}>
        {targetId ? "Outreach workspace" : view === "warm" ? "Keep warm replies and live opportunities moving." : "Prepare for booked calls, record outcomes, and set the next step."}
      </p>

      </div><span className="pipeline-view-chip">{targetId ? "Selected contact" : view === "warm" ? "Warm opportunities view" : "Meetings & outcomes view"}</span></header>
      <section className="pipeline-intelligence" aria-label="Pipeline briefing"><OpsIntelligenceCard title="Where we are now" tone="blue"><p>{loading ? "Loading recorded opportunities…" : error ? "Pipeline unavailable" : `${calls.length} contact${calls.length === 1 ? "" : "s"} in this view`}</p><p>Existing view filters remain authoritative.</p></OpsIntelligenceCard><OpsIntelligenceCard title="Recorded commercial context" tone="violet"><p>{loading ? "Loading…" : error ? "Unavailable" : `${calls.filter(t=>t.deal_value != null).length} with a recorded deal value`}</p><p>Recorded deal amounts only; no annualisation or probability weighting.</p></OpsIntelligenceCard><OpsIntelligenceCard title="What to do next" tone="green"><p>Review context, prepare and record the next step</p><p>Existing preparation and outcome controls remain explicit.</p></OpsIntelligenceCard></section>
      <section className="pipeline-metrics" aria-label="Current Pipeline view metrics">{[["person",calls.length,"Contacts in this view"],["meeting",calls.filter(t=>t.call_date).length,"Recorded call dates"],["task",calls.filter(t=>t.next_step).length,"Recorded next steps"],["won",calls.filter(t=>t.deal_value != null).length,"Recorded deal values"]].map(([icon,value,label])=><OpsSurface key={String(label)}><OverviewIcon kind={String(icon)}/><div><strong>{loading ? "Loading…" : error ? "Unavailable" : value}</strong><span>{label}</span></div></OpsSurface>)}</section>
      <div className="pipeline-evidence"><OpsSurface><h2><OverviewIcon kind="opportunity"/>Recorded deal stages</h2><div className="pipeline-stage-ribbon">{Array.from(new Set(calls.map(t=>t.deal_stage || "Not established"))).map((stageName,index)=><span key={stageName} data-tone={index%3}><OverviewIcon kind="opportunity"/><strong>{stageName.replaceAll("_"," ")}</strong><b>{calls.filter(t=>(t.deal_stage || "Not established")===stageName).length}</b></span>)}</div>{!calls.length&&<p>{loading ? "Loading stage evidence…" : error ? "Stage evidence unavailable." : "No recorded stages in this view."}</p>}<small>Current recorded state only · no earlier stages or stage history inferred.</small></OpsSurface><OpsSurface className="pipeline-value-context"><h2><OverviewIcon kind="won"/>Value basis</h2><strong>Recorded deal value</strong><p>Each card shows its stored amount where available. Potential, expected value and calculation basis are not established by this Pipeline view.</p><div aria-hidden="true"><span/><span/><span/></div></OpsSurface></div>
      <div className="pipeline-shortcuts" style={{ marginTop: 16 }}>
        <a href="/dashboard/growth" style={button}>← Cockpit</a>{" "}
        <a href="/dashboard/growth/followups" style={button}>🎯 Follow-Ups</a>{" "}
        <a href="/dashboard/growth/tracker" style={button}>📊 Tracker</a>
      </div>

      {error && <p role="alert">{error}</p>}
      {loading ? (
        <section className="pipeline-empty"><OverviewIcon kind="clock"/><p style={muted}>Loading contacts...</p></section>
      ) : calls.length === 0 ? (
        <section className="pipeline-empty"><OverviewIcon kind="meeting"/><h2>{targetId ? "Contact unavailable in this workspace." : "No calls booked yet."}</h2><p>The current Pipeline view has no matching records.</p></section>
      ) : (
        calls.map((target) => (
          <article key={target.id} className="pipeline-opportunity" style={card}>
            <div className="pipeline-identity"><RelationshipAvatar name={target.target_name || "Unknown"} kind="person"/><div>
            <h2 style={{ marginBottom: 4 }}>{target.target_name}</h2>

            <p style={muted}>
              {target.role_title || "Role not added"} ·{" "}
              {target.company || "Company not added"}
            </p>

            </div></div><div className="pipeline-status"><span>Deal stage<strong>{target.deal_stage || "Not established"}</strong></span><span>Relationship state<strong>{target.lifecycle?.currentStage || "Not established"}</strong></span><span>Reply status<strong>{target.reply_status || "Not established"}</strong></span></div><div className="pipeline-context"><span>Owner<strong>Not established</strong></span><span>Last activity<strong>{target.lifecycle?.lastAction ? `${target.lifecycle.lastAction.action}${target.lifecycle.lastAction.at ? ` · ${new Date(target.lifecycle.lastAction.at).toLocaleString("en-GB")}` : " · date not established"}` : "Not established"}</strong></span><span>Next action<strong>{target.lifecycle?.nextAction || target.next_step || "Not established"}</strong></span></div>
            {targetId && <OutreachWorkspace key={target.id} target={target} onComplete={loadPipeline} />}

            {(!targetId || ["meeting", "converted"].includes(target.lifecycle?.currentStage || "") || target.reply_status === "call_booked" || ["meeting", "converted", "won"].includes(target.deal_stage || "")) && <>
            <p className="pipeline-deal-value" style={green}>
              Deal value: {target.deal_value == null ? "Unknown" : `£${Number(target.deal_value).toLocaleString()}`}
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

            <section className="pipeline-outcome" style={outcomeBox}>
              <h3 style={{ marginTop: 0 }}><OverviewIcon kind="task"/>Call Outcome</h3>

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
            </>}
          </article>
        ))
      )}
    </div>
  );
}

const page: React.CSSProperties = {
  padding: 0,
  overflowWrap: "anywhere",
  color: "#12213e",
  background: "#f3f7ff",
  minHeight: "100%",
};

const title: React.CSSProperties = {
  fontSize: 28,
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
  marginTop: 16,
  padding: 16,
  borderRadius: 12,
  background: "#ffffff",
  border: "1px solid #d4ddec",
};

const muted: React.CSSProperties = {
  color: "#53627b",
};

const green: React.CSSProperties = {
  color: "#087a50",
  fontWeight: 700,
};

const date: React.CSSProperties = {
  color: "#164f98",
};

const generateButton: React.CSSProperties = {
  marginTop: 10,
  padding: "8px 12px",
  borderRadius: 8,
  background: "#7540ce",
  color: "#ffffff",
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
  background: "#f3f7ff",
  color: "#12213e",
  border: "1px solid #d4ddec",
  whiteSpace: "pre-wrap",
  lineHeight: 1.6,
};

const copyButton: React.CSSProperties = {
  marginTop: 10,
  padding: "8px 12px",
  borderRadius: 8,
  background: "#087a50",
  color: "#ffffff",
  border: "none",
  fontWeight: 800,
  cursor: "pointer",
};

const outcomeBox: React.CSSProperties = {
  marginTop: 18,
  padding: 14,
  borderRadius: 12,
  background: "#f3f7ff",
  border: "1px solid #d4ddec",
};

const label: React.CSSProperties = {
  display: "block",
  marginTop: 10,
  marginBottom: 4,
  color: "#53627b",
};

const input: React.CSSProperties = {
  width: "100%",
  padding: 10,
  borderRadius: 8,
  background: "#ffffff",
  color: "#12213e",
  border: "1px solid #d4ddec",
};

const textareaSmall: React.CSSProperties = {
  width: "100%",
  minHeight: 90,
  padding: 10,
  borderRadius: 8,
  background: "#ffffff",
  color: "#12213e",
  border: "1px solid #d4ddec",
};

const saveButton: React.CSSProperties = {
  marginTop: 12,
  padding: "8px 12px",
  borderRadius: 8,
  background: "#165db5",
  color: "#ffffff",
  border: "none",
  fontWeight: 800,
  cursor: "pointer",
};
