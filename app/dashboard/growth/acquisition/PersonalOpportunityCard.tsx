"use client";
import { useRef, useState } from "react";
import { opportunityProvenance, type OpportunityGroup } from "@/lib/acquisitionPresentation";
import { personalDistributionKind, type PersonalPerformance } from "@/lib/personalDistribution";
import { personalSignal } from "@/lib/personalSignal";
import PersonalSignalCard from "./PersonalSignalCard";
import PersonalDistributionPanel from "./PersonalDistributionPanel";
import PersonalOutreachPanel from "./PersonalOutreachPanel";
import PartnerConversation from "./PartnerConversation";

const button = "rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm font-semibold disabled:opacity-50";
export default function PersonalOpportunityCard({ group, organisationId, onSaved }: { group: OpportunityGroup & { personalPerformance?: PersonalPerformance; savedDraft?: string | null }; organisationId: string; onSaved: () => Promise<void> }) {
  const { item } = group, provenance = opportunityProvenance(item), kind = personalDistributionKind(item), signal = personalSignal(item);
  const [mode, setMode] = useState(""), [notice, setNotice] = useState(""), [busy, setBusy] = useState(false);
  const flight = useRef(false), pending = useRef<{ intent: string; actions: { action: string; key: string }[]; index: number } | null>(null);
  const closed = ["dismissed", "lost", "converted"].includes(item.status);
  const canChoose = !group.blocked && !closed;
  async function act(intent: string) {
    if (flight.current) return; flight.current = true; setBusy(true); setNotice("Saving…");
    pending.current ||= { intent, actions: (intent === "nurture" && item.status === "new" ? ["start_review", "nurture"] : [intent]).map(action => ({ action, key: crypto.randomUUID() })), index: 0 };
    try { while (pending.current.index < pending.current.actions.length) { const step = pending.current.actions[pending.current.index];
      const res = await fetch(`/api/growth/acquisition/${item.id}/action`, { method: "POST", signal: AbortSignal.timeout(30000), headers: { "Content-Type": "application/json" }, body: JSON.stringify({ organisationId, action: step.action, idempotencyKey: step.key, personalPresentation: true }) });
      const data = await res.json(); if (!res.ok || !data.success) throw Error(data.error || "Not saved."); pending.current.index++;
    } pending.current = null; setNotice(intent === "nurture" ? "Saved for later." : "Dismissed."); await onSaved(); }
    catch (e) { setNotice(`${e instanceof Error ? e.message : "Save failed"} Retry this same action; no external action was taken.`); }
    finally { flight.current = false; setBusy(false); }
  }
  const title = item.entity || item.company || item.signal || "Personal opportunity";
  const draft = group.savedDraft || (typeof item.metadata.content_draft === "string" ? item.metadata.content_draft : typeof item.metadata.content_angle === "string" ? item.metadata.content_angle : "");
  const brief = (item.metadata.personal_distribution as { brief?: string } | undefined)?.brief || `Educational article brief: ${item.signal || item.reason || "Review the source evidence"}. Explain the topic in general terms without diagnosis or guarantees. Requires editorial review and manual website publication.`;
  return <article className="space-y-4 rounded-2xl border border-white/10 bg-slate-900 p-5">
    <header><p className="text-xs text-emerald-200">{group.category === "content" ? "Content opportunity" : group.category === "people" ? "Public conversation" : group.category === "partners" ? "Partner / referrer" : "Needs source review"}</p><h2 className="text-lg font-semibold">{title}</h2><p className="text-sm text-slate-300">From {provenance.origin}</p><p className="mt-2">Why Root surfaced it: {provenance.reason}</p></header>
    {group.blocked && <p role="alert">Related outputs contain conflicting completion evidence. Review history before taking another action.</p>}
    {group.personalPerformance?.publishing && <p>Content draft saved · {group.personalPerformance.publishing.status} · {group.personalPerformance.publishing.approval || "pending approval"}</p>}
    {closed && <p>{item.status === "converted" ? "Completed" : item.status === "lost" ? "Closed" : "Dismissed"}</p>}
    <div className="flex flex-wrap gap-2">
      {signal && <button className={button} disabled={!canChoose || busy} onClick={() => setMode("response")}>Prepare response</button>}
      {["SOCIAL_CONTENT", "SEARCH_ASSET"].includes(kind || "") && <button className={button} disabled={!canChoose || busy} onClick={() => setMode("content")}>{group.personalPerformance?.publishing ? "View saved draft" : "Create content"}</button>}
      {group.category === "partners" && <button className={button} disabled={!canChoose || busy} onClick={() => setMode("outreach")}>Start outreach</button>}
      {["new", "reviewing", "accepted", "actioned", "engaged"].includes(item.status) && <button className={button} disabled={!canChoose || busy || !!pending.current && pending.current.intent !== "nurture"} onClick={() => void act("nurture")}>Save for later</button>}
      {["new", "reviewing", "accepted", "nurture"].includes(item.status) && <button className={button} disabled={!canChoose || busy || !!pending.current && pending.current.intent !== "dismiss"} onClick={() => void act("dismiss")}>Dismiss</button>}
    </div>
    {mode === "response" && signal && <PersonalSignalCard embedded item={item} signal={signal} organisationId={organisationId} onSaved={onSaved} onDismiss={() => void act("dismiss")}/>} 
    {mode === "content" && <PersonalDistributionPanel key={item.id} itemId={item.id} organisationId={organisationId} initialDraft={draft} brief={brief} searchAsset={kind === "SEARCH_ASSET"} performance={group.personalPerformance} personalMode initialStatus={item.status} canRoute={canChoose && ["new", "reviewing", "accepted", "nurture", "actioned"].includes(item.status)}/>} 
    {mode === "outreach" && <><PersonalOutreachPanel key={item.id} organisationId={organisationId} itemId={item.id}/><PartnerConversation organisationId={organisationId} itemId={item.id}/></>}
    {notice && <p role="status" aria-live="polite">{notice}</p>}
    <details><summary className="cursor-pointer text-sm text-slate-300">Source evidence &amp; history{group.members.length > 1 ? ` · ${group.members.length} related outputs` : ""}</summary>{group.members.map(member => <section key={member.id} className="mt-3 space-y-2 rounded-xl border border-white/10 p-3 text-sm"><p>{member.source_engine} · {member.source_record_id} · {member.status}</p>{member.source_url && /^https:\/\//.test(member.source_url) && <a className="underline" href={member.source_url} target="_blank" rel="noopener noreferrer">Open source ↗</a>}<p className="whitespace-pre-wrap">{typeof member.metadata.original_post === "string" ? member.metadata.original_post : member.evidence}</p><ol>{member.acquisition_item_events?.map((event, i) => <li key={i}>{event.created_at} · {event.action} · {event.note}</li>)}</ol></section>)}</details>
  </article>;
}
