"use client";
import { useRef, useState } from "react";
import type { PersonalPerformance } from "@/lib/personalDistribution";

const labels: Record<string, string> = { capacity_check_viewed: "Capacity Check viewed", capacity_check_started: "Capacity Check started", capacity_check_completed: "Capacity Check completed", signup_started: "Signup started", signup_completed: "Signup completed", subscription_started: "Subscriber (paid)" };
export default function PersonalDistributionPanel({ itemId, organisationId, initialDraft, performance, searchAsset = false, brief, canRoute = true }: {
  itemId: string; organisationId: string; initialDraft: string; performance?: PersonalPerformance | null; searchAsset?: boolean; brief?: string; canRoute?: boolean;
}) {
  const [message, setMessage] = useState(initialDraft);
  const [platform, setPlatform] = useState("linkedin");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [postId, setPostId] = useState<string | null>(performance?.publishing?.id || null);
  const inFlight = useRef(false);
  async function save() {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setStatus("Creating publishing draft…");
    try {
      const response = await fetch(`/api/growth/acquisition/${itemId}/action`, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organisationId, action: "route_publishing", idempotencyKey: crypto.randomUUID(), publication: { message, platform } }) });
      const data = await response.json();
      if (!response.ok || !data.scheduledPostId) throw new Error(data.error || "Unable to create publishing draft.");
      setPostId(data.scheduledPostId); setStatus(data.duplicate ? "Existing publishing draft retained — no duplicate was created." : "Publishing draft saved — pending approval. Nothing was published.");
    } catch (error) { setStatus(error instanceof Error ? error.message : "Save failed. Your draft has been retained."); }
    finally { inFlight.current = false; setBusy(false); }
  }
  return <section className="space-y-3 rounded-xl border border-emerald-400/20 bg-emerald-400/5 p-3 text-sm">
    <h3 className="font-semibold">{searchAsset ? "Search asset · manual website/article brief" : "Social content · existing Publishing"}</h3>
    {searchAsset ? <p className="whitespace-pre-wrap text-slate-300">{brief || "Prepare an educational brief using the content handoff below. Website/article publication requires manual editorial review and publication; no automatic website publisher is connected."}</p> :
      postId ? <p>Routed to Publishing · {performance?.publishing?.status || "pending"} · {performance?.publishing?.approval || "pending approval"}</p> : <>
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
