"use client";
import { useState } from "react";
import { tenantFetch } from "@/lib/tenantFetch";
import { isB2BEngineOwned } from "@/lib/operationalGovernor";
import { projectEngineState, type EngineState } from "@/lib/engineState";
import ManualTakeover from "../../components/ManualTakeover";

export type OutreachTarget = {
  id: string; organisation_id: string; target_name: string; company?: string; role_title?: string;
  email?: string; linkedin_url?: string; notes?: string; suggested_message?: string; source_type?: string;
  lifecycle?: { currentStage: string; nextAction?: string; nextDueDate?: string; lastAction?: { action: string; at?: string }; actionRecord?: { table: string; id: string } };
  acquisition?: { id: string; evidence?: string; source_engine?: string; source_record_id?: string; engine_state?: unknown; metadata?: Record<string, unknown> }[];
};
const drafts = ["prepared_outreach", "outreach_draft", "prepared_draft", "content_draft", "reply_draft", "draft"];
function b2bPresentation(target: OutreachTarget) {
  const sources = target.acquisition?.filter(a => isB2BEngineOwned({}, [a])) || [];
  const states = sources.map(source => {
    const state = source.engine_state && typeof source.engine_state === "object" ? source.engine_state as EngineState : null;
    const projected = state ? projectEngineState(state) : null;
    const normal = (value: unknown) => typeof value === "string" ? value.toLowerCase().trim().replace(/[\s/-]+/g, "_") : "";
    const issue = projected && (["delivery_issue", "redirect", "failed", "blocked", "error"].includes(projected.operationalState) || normal(state?.follow_up_status) === "blocked");
    const reply = projected && ["needs_reply", "engaged"].includes(projected.stage);
    const label = issue ? "Needs attention" : reply ? "Reply requires attention" : projected?.stage === "meeting" ? "Meeting booked"
      : projected?.stage === "follow_up" ? "Follow-up scheduled"
      : projected?.stage === "waiting" && (state?.last_outbound_at || ["sent", "contacted"].includes(normal(state?.status))) ? "Outreach sent - waiting for response"
      : projected?.stage === "waiting" ? "Waiting for response"
      : ["queued", "scheduled", "ready", "outreach_ready", "accepted"].includes(normal(state?.status)) ? "Automated outreach queued"
      : projected && ["converted", "lost", "nurture", "no_reply_needed"].includes(projected.stage) ? ({ converted: "Converted", lost: "Closed / lost", nurture: "Nurture", no_reply_needed: "No outreach action needed" } as Record<string, string>)[projected.stage]
      : "Owned by Root B2B engine - awaiting source status";
    return { source, label, issue, reply, priority: issue ? 4 : reply ? 3 : projected?.stage === "meeting" ? 2 : state ? 1 : 0 };
  }).sort((a, b) => b.priority - a.priority);
  const current = states[0];
  const label = current?.label || "Owned by Root B2B engine - awaiting source status";
  const awaiting = label.includes("awaiting source status");
  const review = current?.issue || current?.reply || label === "Meeting booked";
  const href = `/dashboard/growth/acquisition?${new URLSearchParams({ organisationId: target.organisation_id, ...(current ? { itemId: current.source.id } : { record_type: "b2b_lead" }) })}`;
  return { label, href, cta: current?.issue ? "Resolve issue" : current?.reply ? "Open response" : "View outreach status",
    action: review ? "Review the recorded source evidence before taking any action." : "No action is required from you right now. Do not send outreach manually.",
    next: current?.issue ? "Next: Check the recorded issue and resolve it through the existing source workflow. Do not retry a send without verifying its outcome."
      : current?.reply ? "Next: Review the reply in the source evidence and continue through the existing source conversation workflow."
      : label === "Meeting booked" ? "Next: Review the recorded meeting details in the source workflow."
      : awaiting ? "Next: Await the source engine's status update. No send or schedule is confirmed here."
      : ["Converted", "Closed / lost", "Nurture", "No outreach action needed"].includes(label) ? "Next: Review source status for any later change; no new outreach is implied."
      : "Next: Root's B2B engine continues outreach according to its source workflow. Replies or delivery issues will appear here when attention is required." };
}
export default function OutreachWorkspace({ target, onComplete }: { target: OutreachTarget; onComplete: () => Promise<void> }) {
  const prepared = target.suggested_message || target.acquisition?.flatMap(a => drafts.map(k => a.metadata?.[k])).find(v => typeof v === "string" && v.trim()) as string || "";
  const [message, setMessage] = useState(prepared), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const stage = target.lifecycle?.currentStage || "unknown";
  const ready = stage === "outreach_ready";
  const b2bOwned = isB2BEngineOwned(target, target.acquisition);
  const b2b = b2bOwned ? b2bPresentation(target) : null;
  const sourceOwned = b2bOwned || target.acquisition?.some(a => a.source_engine === "root_health_personal") ||
    (target.lifecycle?.actionRecord && (target.lifecycle.actionRecord.table !== "growth_targets" || target.lifecycle.actionRecord.id !== target.id));
  const actionable = !sourceOwned && (ready || stage === "follow_up");
  const labels: Record<string, string> = { outreach_ready: "Outreach ready", waiting: "Contacted / waiting", follow_up: "Contacted / waiting", needs_reply: "Reply requires attention", engaged: "Active opportunity", nurture: "Nurture", lost: "Closed / lost", unknown: "Review contact state" };
  async function generate() {
    setBusy(true); setError("");
    try {
      const res = await tenantFetch("/api/growth/generate-message", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetId: target.id, messageType: `${ready ? "first" : "next"} ${target.linkedin_url ? "LinkedIn" : "business email"} message for human review` }) });
      const data = await res.json(); if (!res.ok || !data.success) throw Error(data.error || "Unable to prepare message.");
      setMessage(data.message || "");
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to prepare message."); } finally { setBusy(false); }
  }
  return <section className="space-y-4" aria-label="Outreach workspace">
    <h3 className="font-semibold text-emerald-200">{b2b?.label || labels[stage] || stage.replaceAll("_", " ")}</h3>
    {b2b ? <>
      <p>Automated outreach owned by Root B2B engine. Root&apos;s B2B engine owns this contact.</p>
      <p>{b2b.action}</p><p>{b2b.next}</p>
      <a className="block underline" href={b2b.href}>{b2b.cta}</a>
    </> : sourceOwned && <p>The next action is owned by the existing source workflow. Review its current evidence before taking over.</p>}
    {target.email && <p>Business email: <a href={`mailto:${target.email}`} className="underline">{target.email}</a></p>}
    {target.linkedin_url && /^https:\/\/(?:www\.)?linkedin\.com\/in\//i.test(target.linkedin_url) && <a className="block underline" href={target.linkedin_url} target="_blank" rel="noreferrer">Open LinkedIn profile</a>}
    {target.lifecycle?.lastAction && <p>Last action: {target.lifecycle.lastAction.action.replaceAll("_", " ")}{target.lifecycle.lastAction.at ? ` (${new Date(target.lifecycle.lastAction.at).toLocaleString()})` : ""}</p>}
    {target.lifecycle?.nextDueDate && <p>Next due: {new Date(target.lifecycle.nextDueDate).toLocaleString()}</p>}
    {target.notes && <p className="whitespace-pre-wrap">{target.notes}</p>}
    {target.acquisition?.map(a => <details key={a.id}><summary>Acquisition evidence</summary>
      <p className="whitespace-pre-wrap">{a.evidence}</p><p>{a.source_engine} · {a.source_record_id}</p>
      {b2bOwned && <pre className="whitespace-pre-wrap break-words">Source engine state: {a.engine_state ? JSON.stringify(a.engine_state, null, 2) : "Not recorded; engine ownership still applies."}</pre>}
      {typeof a.metadata?.email_verification === "string" && <p>Source email verification: {a.metadata.email_verification}</p>}
      <a className="underline" href={`/dashboard/growth/acquisition?${new URLSearchParams({ organisationId: target.organisation_id, itemId: a.id })}`}>Back to acquisition evidence/history</a>
    </details>)}
    {actionable && <button disabled={busy} onClick={() => void generate()} className="rounded border border-emerald-400/30 px-3 py-2 disabled:opacity-50">{busy ? "Preparing..." : ready ? "Prepare first message" : "Prepare follow-up"}</button>}
    {message && b2bOwned ? <p className="whitespace-pre-wrap">Source prepared message (monitor only): {message}</p> : message && <><label className="block">Message for review<textarea value={message} onChange={e => setMessage(e.target.value)} className="mt-2 min-h-40 w-full rounded border border-white/20 bg-slate-950 p-3" /></label>
      <button className="underline" onClick={() => void navigator.clipboard.writeText(message).catch(() => setError("Copy unavailable; select the text manually."))}>Copy message</button></>}
    {actionable && <ManualTakeover organisationId={target.organisation_id} table="growth_targets" id={target.id} onComplete={onComplete} />}
    {!b2bOwned && stage === "needs_reply" && <a className="block underline" href={`/dashboard/responses?organisationId=${encodeURIComponent(target.organisation_id)}`}>Open Responses</a>}
    {error && <p role="alert">{error}</p>}
  </section>;
}
