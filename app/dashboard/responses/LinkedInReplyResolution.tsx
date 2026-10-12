"use client";
import {useState} from "react";
export default function LinkedInReplyResolution({organisationId,id,notificationId,onComplete}:{organisationId:string;id:string;notificationId:string;onComplete:()=>Promise<void>}) {
  const [confirmed,setConfirmed]=useState(false),[evidence,setEvidence]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null);
  async function save() {
    if(busy || !confirmed || evidence.trim().length<10) return;
    setBusy(true);setError(null);
    try {
      const result=await fetch("/api/responses/linkedin-notification/resolve",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({organisationId,id,notificationId,confirmed,evidence})});
      const data=await result.json();if(!result.ok || !data.success) throw Error(data.error || "Reply was not marked handled.");
      await onComplete();
    } catch(err) {setError(err instanceof Error ? err.message : "Reply was not marked handled. Retry.");}
    finally {setBusy(false);}
  }
  return <details className="mt-3 text-sm"><summary>After handling the reply in LinkedIn</summary>
    <label className="mt-2 flex gap-2"><input type="checkbox" checked={confirmed} disabled={busy} onChange={event=>setConfirmed(event.target.checked)} />I have read and handled this reply; no response is now due.</label>
    <label className="mt-2 block">What did you do?<textarea value={evidence} disabled={busy} onChange={event=>setEvidence(event.target.value)} rows={2} className="mt-1 block w-full rounded-lg bg-slate-950 p-2" /></label>
    <button type="button" disabled={busy || !confirmed || evidence.trim().length<10} onClick={()=>void save()} className="mt-2 rounded-lg border border-slate-500 px-3 py-2 disabled:opacity-50">{busy ? "Saving…" : "Mark reply handled"}</button>
    {error && <p role="alert" className="mt-2 text-red-300">{error}</p>}
  </details>;
}
