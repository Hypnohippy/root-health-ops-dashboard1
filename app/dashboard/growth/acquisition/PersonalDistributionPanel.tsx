"use client";
import { useRef, useState } from "react";
import type { PersonalPerformance } from "@/lib/personalDistribution";

const labels: Record<string, string> = { capacity_check_viewed: "Capacity Check viewed", capacity_check_started: "Capacity Check started", capacity_check_completed: "Capacity Check completed", signup_started: "Signup started", signup_completed: "Signup completed", subscription_started: "Subscriber (paid)" };
export default function PersonalDistributionPanel({ itemId, organisationId, initialDraft, performance, searchAsset = false, brief, canRoute = true, personalMode = false, initialStatus }: {
  itemId: string; organisationId: string; initialDraft: string; performance?: PersonalPerformance | null; searchAsset?: boolean; brief?: string; canRoute?: boolean; personalMode?: boolean; initialStatus?: string;
}) {
  const [message, setMessage] = useState(searchAsset ? brief || initialDraft : initialDraft);
  const [platform, setPlatform] = useState("linkedin");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [postId, setPostId] = useState<string | null>(performance?.publishing?.id || null);
  const inFlight = useRef(false);
  const reviewed = useRef(initialStatus !== "new");
  const keys = useRef({ review: "", save: "" });
  const [savedBrief, setSavedBrief] = useState(false);
  async function save() {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setStatus("Creating publishing draft…");
    try {
      keys.current.review ||= crypto.randomUUID(); keys.current.save ||= crypto.randomUUID();
      if (personalMode && !reviewed.current) {
        const review = await fetch(`/api/growth/acquisition/${itemId}/action`, { method: "POST", signal: AbortSignal.timeout(30000), headers: { "Content-Type": "application/json" }, body: JSON.stringify({ organisationId, personalPresentation: true, action: "start_review", idempotencyKey: keys.current.review }) });
        const result = await review.json(); if (!review.ok) throw Error(result.error || "Unable to review this opportunity."); reviewed.current = true;
      }
      const response = await fetch(`/api/growth/acquisition/${itemId}/action`, { method: "POST", signal: AbortSignal.timeout(30000), headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organisationId, action: personalMode && searchAsset ? "create_content_draft" : "route_publishing", idempotencyKey: keys.current.save, ...(personalMode ? { personalPresentation: true, ...(searchAsset ? { brief: message } : {}) } : {}), publication: { message, platform } }) });
      const data = await response.json();
      if (personalMode && searchAsset) { if (!response.ok || !data.success) throw Error(data.error || "Unable to save brief."); setSavedBrief(true); setStatus("Editorial brief saved. It requires manual review and website publication; no asset was published."); return; }
      if (!response.ok || !data.scheduledPostId) throw new Error(data.error || "Unable to create publishing draft.");
      if (typeof data.savedDraft === "string") setMessage(data.savedDraft);
      setPostId(data.scheduledPostId); setStatus(data.duplicate ? "Existing publishing draft retained — no duplicate was created." : "Publishing draft saved — pending approval. Nothing was published.");
    } catch (error) { setStatus(error instanceof Error ? error.message : "Save failed. Your draft has been retained."); }
    finally { inFlight.current = false; setBusy(false); }
  }
  return <section className="space-y-3 rounded-xl border border-emerald-400/20 bg-emerald-400/5 p-3 text-sm">
    <h3 className="font-semibold">{searchAsset ? "Article / search brief" : "Create content"}</h3>
    {personalMode && <><label className="grid gap-1">Asset type<select className="rounded-lg bg-slate-950 p-2" value={searchAsset ? "brief" : "social"} disabled><option value={searchAsset ? "brief" : "social"}>{searchAsset ? "Article / search brief" : "Social post"}</option></select></label><p className="text-xs text-slate-300">{searchAsset ? "This source supports an editorial brief. Website publication remains manual." : "This source supports a pending social post. Video needs uploaded media and is completed in the existing Publishing composer."}</p></>}
    {searchAsset ? personalMode ? <><label className="grid gap-1">Editorial brief<textarea rows={8} value={message} disabled={busy||savedBrief} maxLength={12000} onChange={event=>setMessage(event.target.value)} className="rounded-xl border border-white/10 bg-slate-950 p-3"/></label><button className="rounded-xl border border-emerald-400/25 px-3 py-2 disabled:opacity-50" disabled={busy||savedBrief||!message.trim()||!canRoute} onClick={()=>void save()}>{busy?"Saving…":savedBrief?"Brief saved":"Save editorial brief"}</button></> : <p className="whitespace-pre-wrap text-slate-300">{brief || "Prepare an educational brief using the content handoff below. Website/article publication requires manual editorial review and publication; no automatic website publisher is connected."}</p> :
      postId ? <><p>Draft saved · {performance?.publishing?.status || "pending"} · {performance?.publishing?.approval || "pending approval"}</p><p className="whitespace-pre-wrap">{message}</p></> : <>
        <p className="text-slate-300">Standalone Root content, without addressing or quoting the original poster. A tagged Capacity Check link will be added.</p>
        <label className="grid gap-1">Content draft<textarea rows={6} value={message} disabled={busy} maxLength={platform === "threads" ? 350 : 2500} onChange={event => setMessage(event.target.value)} className="rounded-xl border border-white/10 bg-slate-950 p-3 text-white" /></label>
        <label className="flex items-center gap-2">Channel<select value={platform} disabled={busy} onChange={event => setPlatform(event.target.value)} className="rounded-lg bg-slate-950 p-2"><option value="linkedin">LinkedIn</option><option value="facebook">Facebook</option><option value="threads">Threads</option></select></label>
        {!canRoute && <p className="text-slate-300">Review or accept this opportunity before creating a publishing draft. Closed opportunities cannot be routed.</p>}
        <button type="button" disabled={busy || !message.trim() || !canRoute} onClick={() => void save()} className="rounded-xl border border-emerald-400/25 bg-emerald-400/10 px-3 py-2 font-semibold disabled:opacity-50">{busy ? "Saving…" : "Create draft in Publishing"}</button>
      </>}
    {status && <p role="status" aria-live="polite" className="font-semibold">{status}</p>}
    {postId && <a className="inline-block font-semibold text-emerald-300 underline" href={`/dashboard/approvals?${new URLSearchParams({ organisationId })}`}>Open existing Approvals</a>}
    <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">{Object.entries(labels).map(([key, label]) => <div key={key}><dt className="text-slate-400">{label}</dt><dd>{performance?.funnel?.[key] ?? "Unavailable"}</dd></div>)}<div><dt className="text-slate-400">Reach / impressions</dt><dd>Unavailable</dd></div><div><dt className="text-slate-400">Clicks</dt><dd>Unavailable</dd></div></dl>
    <p className="text-xs text-slate-400">Only connected first-party event counts appear here. Views, starts and signups are separate from paid subscribers.</p>
  </section>;
}
