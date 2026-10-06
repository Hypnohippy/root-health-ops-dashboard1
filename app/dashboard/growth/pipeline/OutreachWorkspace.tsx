"use client";
import { useState } from "react";
import { tenantFetch } from "@/lib/tenantFetch";
import ManualTakeover from "../../components/ManualTakeover";

export type OutreachTarget = {
  id: string; organisation_id: string; target_name: string; company?: string; role_title?: string;
  email?: string; linkedin_url?: string; notes?: string; suggested_message?: string;
  lifecycle?: { currentStage: string; nextAction?: string; nextDueDate?: string; lastAction?: { action: string; at?: string }; actionRecord?: { table: string; id: string } };
  acquisition?: { id: string; evidence?: string; source_engine?: string; source_record_id?: string; metadata?: Record<string, unknown> }[];
};
const drafts = ["prepared_outreach", "outreach_draft", "prepared_draft", "content_draft", "reply_draft", "draft"];
export default function OutreachWorkspace({ target, onComplete }: { target: OutreachTarget; onComplete: () => Promise<void> }) {
  const prepared = target.suggested_message || target.acquisition?.flatMap(a => drafts.map(k => a.metadata?.[k])).find(v => typeof v === "string" && v.trim()) as string || "";
  const [message, setMessage] = useState(prepared), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const stage = target.lifecycle?.currentStage || "unknown";
  const ready = stage === "outreach_ready";
  const sourceOwned = target.acquisition?.some(a => a.source_engine === "root_health_personal") ||
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
    <h3 className="font-semibold text-emerald-200">{labels[stage] || stage.replaceAll("_", " ")}</h3>
    {sourceOwned && <p>The next action is owned by the existing source workflow. Review its current evidence before taking over.</p>}
    {target.email && <p>Business email: <a href={`mailto:${target.email}`} className="underline">{target.email}</a></p>}
    {target.linkedin_url && /^https:\/\/(?:www\.)?linkedin\.com\/in\//i.test(target.linkedin_url) && <a className="block underline" href={target.linkedin_url} target="_blank" rel="noreferrer">Open LinkedIn profile</a>}
    {target.lifecycle?.lastAction && <p>Last action: {target.lifecycle.lastAction.action.replaceAll("_", " ")}{target.lifecycle.lastAction.at ? ` (${new Date(target.lifecycle.lastAction.at).toLocaleString()})` : ""}</p>}
    {target.lifecycle?.nextDueDate && <p>Next due: {new Date(target.lifecycle.nextDueDate).toLocaleString()}</p>}
    {target.notes && <p className="whitespace-pre-wrap">{target.notes}</p>}
    {target.acquisition?.map(a => <details key={a.id}><summary>Acquisition evidence</summary>
      <p className="whitespace-pre-wrap">{a.evidence}</p><p>{a.source_engine} · {a.source_record_id}</p>
      {typeof a.metadata?.email_verification === "string" && <p>Source email verification: {a.metadata.email_verification}</p>}
      <a className="underline" href={`/dashboard/growth/acquisition?${new URLSearchParams({ organisationId: target.organisation_id, itemId: a.id })}`}>Back to acquisition evidence/history</a>
    </details>)}
    {actionable && <button disabled={busy} onClick={() => void generate()} className="rounded border border-emerald-400/30 px-3 py-2 disabled:opacity-50">{busy ? "Preparing..." : ready ? "Prepare first message" : "Prepare follow-up"}</button>}
    {message && <><label className="block">Message for review<textarea value={message} onChange={e => setMessage(e.target.value)} className="mt-2 min-h-40 w-full rounded border border-white/20 bg-slate-950 p-3" /></label>
      <button className="underline" onClick={() => void navigator.clipboard.writeText(message).catch(() => setError("Copy unavailable; select the text manually."))}>Copy message</button></>}
    {actionable && <ManualTakeover organisationId={target.organisation_id} table="growth_targets" id={target.id} onComplete={onComplete} />}
    {stage === "needs_reply" && <a className="block underline" href={`/dashboard/responses?organisationId=${encodeURIComponent(target.organisation_id)}`}>Open Responses</a>}
    {error && <p role="alert">{error}</p>}
  </section>;
}
