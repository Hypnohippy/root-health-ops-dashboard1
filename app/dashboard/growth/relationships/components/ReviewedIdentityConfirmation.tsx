"use client";
import { useRef,useState } from "react";
import type { PublicResearchSource } from "@/lib/relationshipResearch";
type Review={reviewToken:string;notice?:string;review:{action:string;label:string;consequence:string;row?:Record<string,unknown>;refs:{table:string;id:string}[];endpointSummary?:{ref:{table:string;id:string};name:string;company:string|null;status:string|null;aliases:{type:string;value:string}[]}[];sources:PublicResearchSource[];facts:{claim:string;sourceUrls:string[]}[];matched?:boolean}};
type Result=Record<string,unknown>;
/** One explicit confirmation surface shared by source intake and relationship
 * review. Receipt stays fixed after an uncertain response; never retries itself. */
export function useReviewedIdentity(organisationId:string,onSaved:(value:Result)=>void) {
 const [pending,setPending]=useState<Review|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(""),[confirmed,setConfirmed]=useState(false),[locked,setLocked]=useState(false),[selected,setSelected]=useState<string[]>([]),[currentDestination,setCurrentDestination]=useState<string|null>(null);
 const receipt=useRef<{token:string;urls:string[]}|null>(null);
 async function request(endpoint:string,body:Record<string,unknown>):Promise<Result|null> {
  if(receipt.current)throw Error("Retry the pending confirmation before starting another review.");
  const response=await fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({organisationId,...body})}),data=await response.json();
  if(!response.ok)throw Error(data.error||"Review could not be loaded.");
  if(data.reviewToken){setPending(data);setConfirmed(false);setSelected([]);setError("");setCurrentDestination(null);return null;}
  return data;
 }
 async function commit() {
  if(!pending||!confirmed||busy)return;
  const fixed=receipt.current||{token:pending.reviewToken,urls:selected};receipt.current=fixed;setLocked(true);setBusy(true);setError("");
  try {
   const response=await fetch("/api/growth/relationships/reviewed",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({organisationId,action:"confirm",reviewToken:fixed.token,confirmed:true,sourceUrls:fixed.urls})}),data=await response.json();
   if(!response.ok){if(typeof data.currentReview?.destination==="string"&&data.currentReview.destination.startsWith("/dashboard/")){const destination=new URL(data.currentReview.destination,"https://ops.invalid");if(destination.searchParams.get("organisationId")===organisationId)setCurrentDestination(data.currentReview.destination);}throw Error(data.error||"Confirmation was not verified. Your receipt is retained.");}
   receipt.current=null;setLocked(false);setPending(null);onSaved(data);
  }catch(e){setError(e instanceof Error?e.message:"Confirmation was not verified.");}finally{setBusy(false);}
 }
 const controls=pending?<section aria-label="Review identity decision" className="my-4 min-w-0 space-y-3 rounded-xl border border-slate-300 bg-white p-4 text-slate-900">
  <h2 className="text-lg font-semibold">Review: {pending.review.label}</h2><p>{pending.review.consequence}</p>
  {pending.notice&&<p role="status">{pending.notice}</p>}
  {pending.review.row&&<dl className="grid min-w-0 gap-2 sm:grid-cols-2">{Object.entries(pending.review.row).filter(([key])=>["person","person_name","company","author_name","entity","text","evidence","linkedin_url","source_engine","source_record_id"].includes(key)).map(([key,value])=><div key={key} className="min-w-0"><dt className="font-semibold">{key.replaceAll("_"," ")}</dt><dd className="whitespace-pre-wrap break-words">{String(value??"Not recorded")}</dd></div>)}</dl>}
  {pending.review.refs.map(ref=><p key={ref.table+ref.id} className="break-all text-sm">Recorded source: {ref.table} · {ref.id}</p>)}
  {pending.review.endpointSummary?.map(source=><article key={source.ref.table+source.ref.id} className="min-w-0 space-y-1 rounded border border-slate-200 p-3"><h3 className="font-semibold">{source.name}</h3><p>{source.company||"Company not recorded"} · {source.status||"State not recorded"}</p>{source.aliases.map(alias=><p key={alias.type+alias.value} className="break-all">Recorded {alias.type}: {alias.value}</p>)}</article>)}
  {pending.review.action==="save_research"&&<><p>Saved public evidence remains distinct from internal facts. Unverified candidates cannot be selected.</p>{pending.review.sources.map(source=><label key={source.url} className="flex items-start gap-2 break-all"><input type="checkbox" disabled={!pending.review.matched||busy||locked} checked={selected.includes(source.url)} onChange={e=>setSelected(e.target.checked?[...selected,source.url]:selected.filter(url=>url!==source.url))}/><span><a href={source.url} target="_blank" rel="noopener noreferrer" className="underline">{source.title}</a><br/>Published {source.publishedAt||"unknown"} · Retrieved {source.retrievedAt}</span></label>)}{pending.review.facts.map((fact,index)=><p key={index}>{fact.claim}</p>)}</>}
  <label className="flex items-start gap-2"><input type="checkbox" checked={confirmed} disabled={busy||locked} onChange={e=>setConfirmed(e.target.checked)}/>I have reviewed these exact sources and explicitly confirm this decision.</label>
  <div className="flex flex-wrap gap-3"><button type="button" className="rounded border px-4 py-2" disabled={!confirmed||busy||pending.review.action==="save_research"&&(!pending.review.matched||!selected.length)} onClick={()=>void commit()}>{busy?"Confirming…":locked?"Retry this confirmation safely":pending.review.action==="keep_separate"?"Confirm keep separate":pending.review.action==="save_research"?"Save selected public evidence":"Confirm create & attach"}</button><button type="button" className="underline" disabled={busy||locked} onClick={()=>setPending(null)}>Cancel review</button></div>
  {error&&<p role="alert">{error} No automatic retry has occurred. If state changed, reload and review again.</p>}
  {currentDestination&&<a className="inline-block underline" href={currentDestination}>Open current safe destination / review</a>}
 </section>:null;
 return {request,controls};
}
