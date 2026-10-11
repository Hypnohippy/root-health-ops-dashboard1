"use client";
import { useRef, useState } from "react";
import { personalFunnel, planPersonalSignalAction, type PersonalSignalItem } from "@/lib/personalSignal";
import { openAndCopyLinkedIn } from "@/lib/linkedinClipboard";
import { safePublicDraft } from "@/lib/socialCommentOpportunity";
type Signal={platform:string;theme:string;context:string;original:string;reply:string|null;url:string};
const button="rounded-xl border border-emerald-400/25 bg-emerald-400/10 px-3 py-2 text-sm font-semibold text-emerald-100 hover:bg-emerald-400/20 disabled:opacity-50";
export default function PersonalSignalCard({item,signal,organisationId,onSaved,onDismiss,onLater,embedded=false}:{item:PersonalSignalItem&{id:string};signal:Signal;organisationId:string;onSaved:()=>Promise<void>;onDismiss:()=>void;onLater?:()=>void;embedded?:boolean}){
 const [message,setMessage]=useState(signal.reply||"");
 const [notice,setNotice]=useState("");const [busy,setBusy]=useState(false);const [confirmed,setConfirmed]=useState(false);const submitting=useRef(false);const pending=useRef<{action:string;key:string}|null>(null);
 async function copy(open=false){setNotice("");let blocked=false;try{
  if(!message.trim())throw Error("Type or prepare a response first.");
  if(open)await openAndCopyLinkedIn(message,signal.url,{open:url=>{try{const tab=window.open("about:blank","_blank");if(!tab){blocked=true;return false;}tab.opener=null;tab.location.replace(url);return true;}catch{blocked=true;return false;}},copy:text=>navigator.clipboard.writeText(text)});
  else await navigator.clipboard.writeText(message);
  setNotice(blocked?"Response copied. The popup was blocked; use Open original post below.":open?"Response copied and post opened. Reply manually, then confirm Responded.":"Response copied. No funnel status changed.");
 }catch{setNotice("Clipboard or navigation failed. Select and copy the AI response manually, and use Open original post below. No funnel status changed.");}}
 async function save(action:string){if(submitting.current)return;submitting.current=true;setBusy(true);setNotice("");try{
  planPersonalSignalAction(item,action,confirmed);
  pending.current||={action,key:crypto.randomUUID()};
      const res=await fetch(`/api/growth/acquisition/${encodeURIComponent(item.id)}/action`,{method:"POST",signal:AbortSignal.timeout(30000),headers:{"Content-Type":"application/json"},body:JSON.stringify({organisationId,action:pending.current.action,confirmed:true,idempotencyKey:pending.current.key,personalPresentation:true,message})});
  const result=await res.json();if(!res.ok||result.success!==true)throw Error(result.error||"Not confirmed.");
  pending.current=null;setConfirmed(false);setNotice("Funnel confirmation saved.");await onSaved();
 }catch(e){setNotice(`Not saved — ${e instanceof Error?e.message:"please retry"}. Retry the same confirmation; do not repeat the external reply.`);}finally{submitting.current=false;setBusy(false);}}
 const milestones=[{action:"personal_responded",label:"Responded"},{action:"personal_engaged",label:"Engaged"},{action:"personal_capacity_check",label:"Capacity Check"},{action:"personal_signup",label:"Signup"},{action:"personal_subscriber",label:"Subscriber"}].filter(a=>{try{planPersonalSignalAction(item,a.action,true);return true;}catch{return false;}});
 async function generate(){if(submitting.current)return;submitting.current=true;setBusy(true);setNotice("Preparing response…");try{const res=await fetch("/api/growth/acquisition/personal/draft",{method:"POST",signal:AbortSignal.timeout(30000),headers:{"Content-Type":"application/json"},body:JSON.stringify({organisationId,itemId:item.id})});const data=await res.json();if(!res.ok||!data.draft)throw Error(data.error||"No response returned.");setMessage(data.draft);setNotice("Response prepared. Review and edit before posting.");}catch(e){setNotice(`${e instanceof Error?e.message:"Preparation failed"} Your text has been retained. You can type or retry.`);}finally{submitting.current=false;setBusy(false);}}
 const Container=embedded?"section":"article";
 return <Container className={embedded?"space-y-4":"space-y-4 rounded-2xl border border-violet-400/30 bg-slate-900 p-4 text-slate-100"}>
 <header>{!embedded&&<><p className="text-xs font-semibold text-violet-200">Personal Signal</p><h2 className="text-lg font-semibold">{signal.platform} · {signal.theme}</h2></>}<p className="font-semibold text-emerald-200">{personalFunnel(item)==="Found"?"Ready for your review":personalFunnel(item)}</p></header>
 <section><h3 className="font-semibold">Context</h3><p className="whitespace-pre-wrap text-sm text-slate-300">{signal.context||"Review the verified public discussion."}</p></section>
 <section><h3 className="font-semibold">Original post</h3><blockquote className="whitespace-pre-wrap rounded-xl border border-white/10 bg-slate-950 p-3 text-sm">{signal.original}</blockquote></section>
 <section><label className="grid gap-2 font-semibold">Response<textarea rows={6} maxLength={1800} value={message} disabled={busy||!!pending.current} onChange={e=>setMessage(e.target.value)} className="rounded-xl border border-white/10 bg-slate-950 p-3 text-sm font-normal"/></label><button className={button} disabled={busy||!!pending.current||!["new","reviewing","accepted"].includes(item.status)} onClick={()=>void generate()}>{busy?"Working…":"Prepare response"}</button></section>
 <div className="flex flex-wrap gap-2"><button className={button} disabled={!message.trim()||busy} onClick={()=>void copy()}>Copy current text</button><button className={button} disabled={!message.trim()||busy} onClick={()=>void copy(true)}>Open post &amp; copy</button><a className={button} href={signal.url} target="_blank" rel="noopener noreferrer">Open source ↗</a></div>
 {milestones.length>0&&<div className="space-y-2"><label className="block text-sm"><input type="checkbox" disabled={busy||!!pending.current} checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/> I confirm the reply was posted externally or the named milestone actually occurred.</label><div className="flex flex-wrap gap-2">{milestones.map(a=><button className={button} key={a.action} disabled={busy||!confirmed||(a.action==="personal_responded"&&!safePublicDraft(message))||(!!pending.current&&pending.current.action!==a.action)} onClick={()=>void save(a.action)}>{busy?"Saving…":a.action==="personal_responded"?"Mark responded":a.label}</button>)}</div></div>}
 {onLater&&<button className={button} disabled={busy||!!pending.current} onClick={onLater}>Save for later</button>}
 {!embedded&&["new","reviewing","accepted","nurture"].includes(item.status)&&<button className={button} disabled={busy||!!pending.current} onClick={onDismiss}>Dismiss / Skip</button>}
 {notice&&<p role="status" className="rounded-xl border border-white/20 bg-black/20 p-3 font-semibold">{notice}</p>}
 <details><summary>Acquisition history</summary><ol>{[...(item.acquisition_item_events||[])].sort((a,b)=>b.created_at.localeCompare(a.created_at)).map((e,i)=><li key={i}>{e.created_at}: {e.action.replaceAll("personal_","").replaceAll("_"," ")}{e.previous_status&&e.new_status?` (${e.previous_status} → ${e.new_status})`:""}{e.note?` — ${e.note}`:""}{e.outcome?` · ${e.outcome}`:""}</li>)}</ol></details>
 </Container>;
}
