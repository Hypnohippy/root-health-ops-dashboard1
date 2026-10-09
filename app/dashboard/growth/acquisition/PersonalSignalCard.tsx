"use client";
import { useRef, useState } from "react";
import { personalFunnel, planPersonalSignalAction, type PersonalSignalItem } from "@/lib/personalSignal";
import { openAndCopyLinkedIn } from "@/lib/linkedinClipboard";
type Signal={platform:string;theme:string;context:string;original:string;reply:string|null;url:string};
const button="rounded-xl border border-emerald-400/25 bg-emerald-400/10 px-3 py-2 text-sm font-semibold text-emerald-100 hover:bg-emerald-400/20 disabled:opacity-50";
export default function PersonalSignalCard({item,signal,organisationId,onSaved,onDismiss}:{item:PersonalSignalItem&{id:string};signal:Signal;organisationId:string;onSaved:()=>Promise<void>;onDismiss:()=>void}){
 const [notice,setNotice]=useState("");const [busy,setBusy]=useState(false);const [confirmed,setConfirmed]=useState(false);const submitting=useRef(false);const pending=useRef<{action:string;key:string}|null>(null);
 async function copy(open=false){setNotice("");let blocked=false;try{
  if(!signal.reply)throw Error("No reviewed response is available.");
  if(open)await openAndCopyLinkedIn(signal.reply,signal.url,{open:url=>{try{const tab=window.open("about:blank","_blank");if(!tab){blocked=true;return false;}tab.opener=null;tab.location.replace(url);return true;}catch{blocked=true;return false;}},copy:text=>navigator.clipboard.writeText(text)});
  else await navigator.clipboard.writeText(signal.reply);
  setNotice(blocked?"Response copied. The popup was blocked; use Open original post below.":open?"Response copied and post opened. Reply manually, then confirm Responded.":"Response copied. No funnel status changed.");
 }catch{setNotice("Clipboard or navigation failed. Select and copy the AI response manually, and use Open original post below. No funnel status changed.");}}
 async function save(action:string){if(submitting.current)return;submitting.current=true;setBusy(true);setNotice("");try{
  planPersonalSignalAction(item,action,confirmed);
  pending.current||={action,key:crypto.randomUUID()};
  const res=await fetch(`/api/growth/acquisition/${encodeURIComponent(item.id)}/action`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({organisationId,action:pending.current.action,confirmed:true,idempotencyKey:pending.current.key})});
  const result=await res.json();if(!res.ok||result.success!==true)throw Error(result.error||"Not confirmed.");
  pending.current=null;setConfirmed(false);setNotice("Funnel confirmation saved.");await onSaved();
 }catch(e){setNotice(`Not saved — ${e instanceof Error?e.message:"please retry"}. Retry the same confirmation; do not repeat the external reply.`);}finally{submitting.current=false;setBusy(false);}}
 const milestones=[{action:"personal_responded",label:"Responded"},{action:"personal_engaged",label:"Engaged"},{action:"personal_capacity_check",label:"Capacity Check"},{action:"personal_signup",label:"Signup"},{action:"personal_subscriber",label:"Subscriber"}].filter(a=>{try{planPersonalSignalAction(item,a.action,true);return true;}catch{return false;}});
 return <article className="space-y-4 rounded-2xl border border-violet-400/30 bg-slate-900 p-4 text-slate-100">
 <header><p className="text-xs font-semibold text-violet-200">Personal Signal</p><h2 className="text-lg font-semibold">{signal.platform} · {signal.theme}</h2><p className="mt-2 text-sm text-slate-300">Found → Responded → Engaged → Capacity Check → Signup → Subscriber</p><p className="font-semibold text-emerald-200">Current: {personalFunnel(item)}</p></header>
 <section><h3 className="font-semibold">Context</h3><p className="whitespace-pre-wrap text-sm text-slate-300">{signal.context||"Review the verified public discussion."}</p></section>
 <section><h3 className="font-semibold">Original post</h3><blockquote className="whitespace-pre-wrap rounded-xl border border-white/10 bg-slate-950 p-3 text-sm">{signal.original}</blockquote></section>
 <section><h3 className="font-semibold">AI response</h3>{signal.reply?<p className="whitespace-pre-wrap rounded-xl border border-white/10 bg-slate-950 p-3 text-sm">{signal.reply}</p>:<p>No safe prepared public response is available. Review the source; no reply is inferred or generated here.</p>}</section>
 <div className="flex flex-wrap gap-2"><button className={button} disabled={!signal.reply||busy} onClick={()=>void copy()}>Copy response</button><button className={button} disabled={!signal.reply||busy} onClick={()=>void copy(true)}>Open post &amp; copy</button><a className={button} href={signal.url} target="_blank" rel="noopener noreferrer">Open original post ↗</a></div>
 {milestones.length>0&&<div className="space-y-2"><label className="block text-sm"><input type="checkbox" disabled={busy||!!pending.current} checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/> I confirm the reply was posted externally or the named milestone actually occurred.</label><div className="flex flex-wrap gap-2">{milestones.map(a=><button className={button} key={a.action} disabled={busy||!confirmed||(!!pending.current&&pending.current.action!==a.action)} onClick={()=>void save(a.action)}>{busy?"Saving…":a.label}</button>)}</div></div>}
 {["new","reviewing","accepted","nurture"].includes(item.status)&&<button className={button} disabled={busy||!!pending.current} onClick={onDismiss}>Dismiss / Skip</button>}
 {notice&&<p role="status" className="rounded-xl border border-white/20 bg-black/20 p-3 font-semibold">{notice}</p>}
 <details><summary>Acquisition history</summary><ol>{[...(item.acquisition_item_events||[])].sort((a,b)=>b.created_at.localeCompare(a.created_at)).map((e,i)=><li key={i}>{e.created_at}: {e.action.replaceAll("personal_","").replaceAll("_"," ")}{e.previous_status&&e.new_status?` (${e.previous_status} → ${e.new_status})`:""}{e.note?` — ${e.note}`:""}{e.outcome?` · ${e.outcome}`:""}</li>)}</ol></details>
 </article>;
}
