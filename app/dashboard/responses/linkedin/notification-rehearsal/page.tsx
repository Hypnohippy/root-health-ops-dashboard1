"use client";
import {useState} from "react";
import ResponseAttentionBadge from "../../../components/ResponseAttentionBadge";
import ResponseLifecycleDetails from "../../ResponseLifecycleDetails";
import type {ResponseLifecycle} from "@/lib/responseLifecycle";
type Result={item:{id:string;authorName:string;profileUrl:string;messageUrl:string;lifecycle:ResponseLifecycle};attention:{count:number;href:string}};
export default function NotificationRehearsal() {
  const [payload,setPayload]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null),[result,setResult]=useState<Result|null>(null);
  async function run() {
    if(busy)return;setBusy(true);setError(null);setResult(null);
    try {
      const org=new URLSearchParams(window.location.search).get("organisationId");
      const response=await fetch("/api/growth/linkedin-connections/message-notifications/rehearsal",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...JSON.parse(payload),organisationId:org})});
      const data=await response.json();if(!response.ok || !data.success) throw Error(data.error || "Rehearsal failed.");setResult(data);
    }catch(err){setError(err instanceof Error ? err.message : "Rehearsal failed.");}finally{setBusy(false);}
  }
  return <section className="mx-auto max-w-3xl space-y-4">
    <h1 className="text-2xl font-semibold">LinkedIn notification — read-only Preview rehearsal</h1>
    <p>Projects verified Gmail notification evidence onto the existing relationship. Nothing is saved, sent or classified. Available only in Preview.</p>
    <label className="block">Notification payload (remove email login tokens)<textarea value={payload} onChange={event=>setPayload(event.target.value)} rows={8} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 p-3 font-mono text-xs" /></label>
    <button disabled={busy || !payload.trim()} type="button" onClick={()=>void run()} className="rounded-xl bg-emerald-400 px-4 py-2 text-slate-950 disabled:opacity-50">{busy ? "Checking…" : "Run read-only rehearsal"}</button>
    {error && <p role="alert" className="text-red-300">{error}</p>}
    {result && <div className="space-y-4 rounded-xl border border-slate-700 p-4">
      <p className="text-amber-200">Projected result only — notification has not been ingested.</p>
      <div className="inline-flex items-center rounded-full bg-slate-800 px-4 py-2">Responses<ResponseAttentionBadge count={result.attention.count} /></div>
      <h2 className="text-xl font-semibold">{result.item.authorName} — {result.item.lifecycle.label}</h2>
      <ResponseLifecycleDetails lifecycle={result.item.lifecycle} />
      <p>Existing Responses record: {result.item.id}</p>
      <p>AI drafting: {result.item.lifecycle.canDraft ? "Available using recorded conversation" : "Blocked — actual reply text must be logged"}</p>
      <a href={result.item.messageUrl} target="_blank" rel="noreferrer" className="mr-4 text-emerald-300 underline">Open LinkedIn conversation</a>
      <a href={result.attention.href} className="text-emerald-300 underline">Projected attention destination (existing record)</a>
    </div>}
  </section>;
}
