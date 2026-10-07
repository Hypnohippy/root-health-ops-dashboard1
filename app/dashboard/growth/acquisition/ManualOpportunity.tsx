"use client";
import { useState } from "react";
import type { ManualInput, ManualReview } from "@/lib/manualAcquisition";

const empty: ManualInput = { person: "", company: "", linkedin: "", website: "", email: "", note: "" };
const labels = { person: "Person name (optional)", company: "Company / organisation (optional)", linkedin: "LinkedIn URL (optional)", website: "Website URL (optional)", email: "Email (optional)" };
const decisionLabel:Record<string,string>={ready:"Ready to approach",needs_verification:"Needs verification",hold:"Hold / not suitable"};
export default function ManualOpportunity({ organisationId }: { organisationId: string }) {
  const [open,setOpen]=useState(false),[input,setInput]=useState<ManualInput>(empty),[review,setReview]=useState<ManualReview|null>(null);
  const [recordType,setRecordType]=useState(""),[confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState("");
  const [submissionId,setSubmissionId]=useState(""),[requestedResearch,setRequestedResearch]=useState(false),[attempted,setAttempted]=useState(false);
  async function requestReview(research:boolean) {
    setBusy(true);setError("");
    try {
      const res=await fetch("/api/growth/acquisition/manual",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({organisationId,action:"review",input,requestedResearch:research})});
      const data=await res.json();if(!res.ok)throw Error(data.error||"Unable to review input.");setReview(data.review);setRequestedResearch(research);setRecordType("");setConfirmed(false);
    } catch(e){setError(e instanceof Error?e.message:"Unable to review input.");} finally{setBusy(false);}
  }
  async function findPeople() {
    if(!review)return;
    setBusy(true);setError("");
    try {
      const res=await fetch("/api/growth/acquisition/manual",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({organisationId,action:"people",input:review.userProvided,review})});
      const data=await res.json();if(!res.ok)throw Error(data.error||"Unable to search decision-makers.");setReview(data.review);
    } catch(e){setError(e instanceof Error?e.message:"Unable to search decision-makers.");} finally{setBusy(false);}
  }
  async function create() {
    setBusy(true);setError("");setAttempted(true);
    try {
      const res=await fetch("/api/growth/acquisition/manual",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({organisationId,action:"create",input:review?.userProvided,review,requestedResearch,recordType,confirmed:true,publicContextConfirmed:confirmed,submissionId})});
      const data=await res.json();if(!res.ok){if(res.status===400||res.status===403)setAttempted(false);throw Error(data.error||"Unable to create opportunity.");}window.location.assign(data.destination);
    } catch(e){setError(e instanceof Error?e.message:"Unable to create opportunity. Retry this submission.");} finally{setBusy(false);}
  }
  if(!open)return <button type="button" onClick={()=>{setOpen(true);setSubmissionId(crypto.randomUUID());}} className="inline-flex items-center gap-2 rounded-lg border border-emerald-400/30 px-3 py-2 text-sm"><span aria-hidden>+</span>Add opportunity</button>;
  return <section aria-label="Add opportunity" className="space-y-4 border-y border-white/10 py-4">
    <div className="flex items-center justify-between"><h2 className="text-lg font-semibold">Manual opportunity</h2><button type="button" aria-label="Cancel" title="Cancel" disabled={busy||attempted} onClick={()=>setOpen(false)}>×</button></div>
    {!review?<>
      <div className="grid gap-3 sm:grid-cols-2">{Object.entries(labels).map(([key,label])=><label key={key} className="grid gap-1 text-sm">{label}<input value={input[key as keyof ManualInput]} maxLength={key==="website"||key==="linkedin"?2048:500} onChange={e=>setInput({...input,[key]:e.target.value})} className="min-w-0 rounded border border-white/20 bg-slate-900 p-2"/></label>)}</div>
      <label className="grid gap-1 text-sm">What did you find? (one detail is enough)<textarea value={input.note} maxLength={6000} placeholder="Barnardo's, or ABC Care Homes - spoke with their People Director at an event" onChange={e=>setInput({...input,note:e.target.value})} className="min-h-24 rounded border border-white/20 bg-slate-900 p-2"/></label>
      <p className="text-xs text-slate-400">For public research, add a company, public website or LinkedIn profile where possible. Ops will not research private consumer-health prospects.</p>
      <div className="flex flex-wrap gap-3"><button type="button" disabled={busy} onClick={()=>void requestReview(true)} className="rounded border border-emerald-400/30 px-3 py-2">{busy?"Researching…":"Research & create opportunity"}</button><button type="button" disabled={busy} onClick={()=>void requestReview(false)} className="underline">Create without research</button></div>
    </>:<>
      <h3 className="font-semibold">Review before creation</h3><p role="status">{review.research.message}</p>
      {review.decision&&<p className="inline-flex rounded-full border border-white/15 bg-white/5 px-3 py-1 text-sm font-semibold">{decisionLabel[review.decision]||review.decision}</p>}
      <h4 className="font-semibold">User-provided information</h4><dl className="grid gap-2 sm:grid-cols-2">{Object.entries(review.userProvided).filter(([,v])=>v.trim()).map(([key,value])=><div key={key} className="min-w-0"><dt className="text-xs capitalize text-slate-400">{key}</dt><dd className="whitespace-pre-wrap break-words">{value}</dd></div>)}</dl>
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div><dt className="font-semibold">Organisation</dt><dd>{review.userProvided.company.trim()||review.verifiedFacts.find(f=>f.category==="identity")?.claim||"Not yet identified"}</dd></div>
        <div><dt className="font-semibold">Person</dt><dd>{review.userProvided.person.trim()||review.verifiedFacts.find(f=>f.category==="role")?.claim||"Not yet identified"}</dd></div>
        <div><dt className="font-semibold">Why it may matter</dt><dd>{review.fit||review.summary||"Not assessed."}</dd></div>
        <div><dt className="font-semibold">Current signal</dt><dd>{review.currentSignal||"No current signal verified."}</dd></div>
        <div><dt className="font-semibold">Recommended route</dt><dd>{review.recommendedRoute||"Review context and verify identity before considering outreach."}</dd></div>
        <div><dt className="font-semibold">Suggested type</dt><dd>{review.suggestedType?.replaceAll("_"," ")||"No type suggested — choose below."}</dd></div>
      </dl>
      {!!review.verifiedFacts.length&&<div><h4 className="font-semibold">What we verified</h4><ul className="mt-1 list-disc space-y-1 pl-5 text-sm">{review.verifiedFacts.map((fact,i)=><li key={i}>{fact.claim}</li>)}</ul></div>}
      {!!review.contraryEvidence?.length&&<div><h4 className="font-semibold">Why not to approach</h4><ul className="mt-1 list-disc space-y-1 pl-5 text-sm">{review.contraryEvidence.map((v,i)=><li key={i}>{v}</li>)}</ul></div>}
      {!!review.missingEvidence?.length&&<div><h4 className="font-semibold">Still missing</h4><ul className="mt-1 list-disc space-y-1 pl-5 text-sm">{review.missingEvidence.map((v,i)=><li key={i}>{v}</li>)}</ul></div>}
      {requestedResearch&&<div className="space-y-3 rounded-lg border border-white/10 bg-white/[0.02] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h4 className="font-semibold">Decision-makers</h4><p className="text-sm text-slate-400">Find several publicly verified professional candidates; Ops will not guess contact details.</p></div><button type="button" disabled={busy} onClick={()=>void findPeople()} className="rounded border border-emerald-400/30 px-3 py-2">{busy?"Searching…":review.people?.length?"Search again":"Find decision-makers"}</button></div>
        {!!review.people?.length&&<div className="grid gap-3 md:grid-cols-2">{review.people.map((person,i)=><article key={`${person.name}-${person.role}-${i}`} className="rounded border border-white/10 p-3">
          <div className="font-semibold">{person.name}</div><div className="text-sm text-slate-300">{person.role}</div><div className="mt-1 text-xs uppercase tracking-wide text-slate-500">{person.seniority.replaceAll("_"," ")}</div>
          <p className="mt-2 text-sm">{person.relevance}</p>
          <div className="mt-2 flex flex-wrap gap-3 text-sm">{person.publicProfileUrl&&<a className="text-sky-300 underline" href={person.publicProfileUrl} target="_blank" rel="noopener noreferrer">Public profile</a>}{person.sourceUrls.map((url,j)=><a key={url} className="text-sky-300 underline" href={url} target="_blank" rel="noopener noreferrer">Source {j+1}</a>)}</div>
        </article>)}</div>}
      </div>}
      <div><h4 className="font-semibold">Sources</h4>{review.publicSources.length?<ul className="mt-1 space-y-1 text-sm">{review.publicSources.map((source,i)=><li key={i}><a href={source.url} target="_blank" rel="noopener noreferrer" className="text-sky-300 underline">{source.title}</a> <span className="text-slate-400">· {source.sourceType}{source.publishedAt?` · ${source.publishedAt}`:""}</span></li>)}</ul>:<p className="text-sm text-slate-400">No public sources checked.</p>}</div>
      <label className="grid gap-1 text-sm">Confirm opportunity type<select value={recordType} disabled={attempted} onChange={e=>setRecordType(e.target.value)} className="rounded border border-white/20 bg-slate-900 p-2"><option value="">Choose a type</option><option value="b2b_lead">B2B lead</option><option value="partner_opportunity">Partner opportunity</option><option value="personal_opportunity">Personal public demand</option><option value="social_opportunity">Social/content opportunity</option></select></label>
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={confirmed} disabled={attempted} onChange={e=>setConfirmed(e.target.checked)}/>I have reviewed the evidence. This is public business/professional context or non-personal public demand, not sensitive health targeting or a consumer prospect list.</label>
      <div className="flex flex-wrap gap-3"><button type="button" disabled={busy||!recordType||!confirmed} onClick={()=>void create()} className="rounded border border-emerald-400/30 px-3 py-2">{busy?"Creating...":attempted?"Retry same submission":"Confirm & create"}</button><button type="button" disabled={busy||attempted} onClick={()=>setReview(null)} className="underline">Edit</button><button type="button" disabled={busy||attempted} onClick={()=>{setReview(null);setOpen(false);}} className="underline">Cancel</button></div>
    </>}
    {error&&<p role="alert">{error}</p>}
  </section>;
}
