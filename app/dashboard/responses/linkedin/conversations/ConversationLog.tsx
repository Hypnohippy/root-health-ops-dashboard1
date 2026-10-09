"use client";
import { useRef,useState } from "react";
import { useRouter } from "next/navigation";
import { tenantFetch } from "@/lib/tenantFetch";
import { localSendDate } from "@/lib/linkedinSendEvidence";
type Entry=Record<string,unknown>;
export default function ConversationLog({organisationId,revision,contacts,selectedId,schemaAvailable,messages}:{organisationId:string;revision:string;contacts:{id:string;name:string}[];selectedId:string;schemaAvailable:boolean;messages:{dated:Entry[];undated:Entry[]}}){
 const router=useRouter();const [direction,setDirection]=useState("inbound"),[message,setMessage]=useState(""),[dateKnown,setDateKnown]=useState(false),[date,setDate]=useState(""),[time,setTime]=useState(""),[timezone,setTimezone]=useState("Europe/London"),[confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState("");
 const pending=useRef<Record<string,unknown>|null>(null);
 async function append(){setBusy(true);setError("");try{
  if(!confirmed||!message.trim())throw Error("Confirm this exact message and direction.");
  pending.current||={contactId:selectedId,revision,key:crypto.randomUUID(),direction,message,dateKnown,messageAt:dateKnown?localSendDate(date,time,timezone):null,timeKnown:!!time,timezone,confirmed:true};
  const response=await tenantFetch("/api/growth/linkedin-conversation",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...pending.current,revision,organisationId})});const result=await response.json();if(!response.ok)throw Error(result.error||"Append failed.");
  pending.current=null;setMessage("");setConfirmed(false);router.refresh();
 }catch(e){setError(`${e instanceof Error?e.message:"Append failed."} Retry with the same details; do not repeat the external message.`);router.refresh();}finally{setBusy(false);}}
 function trail(entries:Entry[]){return <ol className="space-y-3">{entries.map(e=><li key={String(e.id)} className="rounded border border-white/20 p-3"><p>{String(e.direction)==="inbound"?"Inbound reply":"Outbound message"} · {e.message_at?new Date(String(e.message_at)).toLocaleString("en-GB",{timeZone:String(e.timezone||"UTC")})+" "+String(e.timezone||"UTC")+" ("+String(e.time_precision)+" precision)":"Actual message date unknown"}</p><blockquote className="whitespace-pre-wrap">{String(e.message)}</blockquote><p className="text-sm">Recorded: {String(e.confirmed_at)} · Actor: {String(e.actor)} · Source: {String(e.source)}</p></li>)}</ol>;}
 return <section className="space-y-4"><label className="block">Contact <select disabled={busy||!!pending.current} value={selectedId} onChange={e=>router.push(`/dashboard/responses/linkedin/conversations?organisationId=${encodeURIComponent(organisationId)}&contactId=${encodeURIComponent(e.target.value)}`)} className="bg-slate-900 p-2"><option value="">Select a LinkedIn contact</option>{contacts.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
 <h2 className="text-xl font-semibold">Messages with verified dates — chronological</h2>{trail(messages.dated)}
 <h2 className="text-xl font-semibold">Actual dates unknown — recording order</h2><p>Recording order is an audit trail, not an inferred external conversation chronology.</p>{trail(messages.undated)}
 {!schemaAvailable&&<p role="status">Conversation storage migration has not been applied. You can review this screen, but saving is unavailable.</p>}
 <fieldset disabled={!selectedId||!schemaAvailable||busy||!!pending.current} className="space-y-3 rounded border p-4"><legend>Append one message</legend><p>Paste each inbound or outbound message as its own entry. Existing pasted audit trails and messages are never replaced.</p>
 <label className="block">Direction <select className="bg-slate-900 p-2" value={direction} onChange={e=>{setDirection(e.target.value);setConfirmed(false);}}><option value="inbound">Inbound — received from contact</option><option value="outbound">Outbound — sent by you</option></select></label>
 <label className="block">Exact message <textarea className="block w-full bg-slate-900 p-2" value={message} onChange={e=>{setMessage(e.target.value);setConfirmed(false);}} /></label>
 <label className="block"><input type="checkbox" checked={dateKnown} onChange={e=>{setDateKnown(e.target.checked);setConfirmed(false);}} /> Actual message date known</label>
 {dateKnown&&<><label className="block">Actual message date <input type="date" value={date} onChange={e=>{setDate(e.target.value);setConfirmed(false);}} /></label><label className="block">Time, if known <input type="time" value={time} onChange={e=>{setTime(e.target.value);setConfirmed(false);}} /></label><label className="block">Timezone <input className="bg-slate-900 p-2" value={timezone} onChange={e=>{setTimezone(e.target.value);setConfirmed(false);}} /></label>{!time&&<p>Date-only precision uses the start of the selected local day; no exact time is claimed.</p>}</>}
 <label className="block"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)} /> I confirm this message, its direction and any date supplied from LinkedIn history.</label></fieldset>
 {error&&<p role="alert">{error}</p>}<button className="rounded border p-2" disabled={!selectedId||!schemaAvailable||busy||!confirmed||!message.trim()} onClick={()=>void append()}>{busy?"Appending…":pending.current?"Retry append safely":"Append message"}</button>
 <p>Source: manually reconciled from LinkedIn conversation. Saving an inbound reply suspends the silent cadence in the same transaction.</p>
 </section>;
}
