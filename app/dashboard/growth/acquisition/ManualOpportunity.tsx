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
  const [emailFormatHint]=useState("");
  async function requestReview(research:boolean) {
    setBusy(true);setError("");
    try {
      const res=await fetch("/api/growth/acquisition/manual",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({organisationId,action:"review",input,requestedResearch:research})});
      const data=await res.json();if(!res.ok)throw Error(data.error||"Unable to review input.");setReview(data.review);setRequestedResearch(research);setRecordType("");setConfirmed(false);
    } catch(e){setError(e instanceof Error?e.message:"Unable to review input.");} finally{setBusy(false);}
  }
  async function findPeople() {
    if(!review)return;setBusy(true);setError("");
    try {
      const res=await fetch("/api/growth/acquisition/manual",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({organisationId,action:"people",input:review.userProvided,review})});
      const data=await res.json();if(!res.ok)throw Error(data.error||"Unable to search decision-makers.");setReview(data.review);
    } catch(e){setError(e instanceof Error?e.message:"Unable to search decision-makers.");} finally{setBusy(false);}
  }
  async function findContact(personName:string,personRole:string) {
    if(!review)return;setBusy(true);setError("");
    try {
      const res=await fetch("/api/growth/acquisition/manual",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({organisationId,action:"contact",input:review.userProvided,review,personName,personRole,emailFormatHint})});
      const data=await res.json();if(!res.ok)throw Error(data.error||"Unable to research contact route.");setReview(data.review);
    } catch(e){setError(e instanceof Error?e.message:"Unable to research contact route.");} finally{setBusy(false);}
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
      {(review.strategicAlignment||review.operationalGap||review.rootFit)&&<div className="space-y-3 rounded-lg border border-emerald-400/20 bg-emerald-400/[0.03] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h4 className="font-semibold">Strategic opportunity</h4><p className="text-sm text-slate-400">Separates long-term fit from a current buying signal.</p></div><div className="flex gap-2 text-xs">{review.opportunityScore!==undefined&&<span className="rounded-full border border-white/10 px-2 py-1">Opportunity {Math.round(review.opportunityScore)}/100</span>}{review.evidenceConfidence&&<span className="rounded-full border border-white/10 px-2 py-1">{review.evidenceConfidence} evidence confidence</span>}</div></div>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div><dt className="font-semibold">Strategic alignment</dt><dd>{review.strategicAlignment||"Not established."}{review.strategicAlignmentScore!==undefined&&<span className="ml-2 text-slate-400">({Math.round(review.strategicAlignmentScore)}/100)</span>}</dd></div>
          <div><dt className="font-semibold">Strategic continuity</dt><dd>{review.strategicContinuity?.summary||"Not established."}{(review.strategicContinuity?.fromYear||review.strategicContinuity?.toYear)&&<span className="ml-2 text-slate-400">({review.strategicContinuity.fromYear||"?"}–{review.strategicContinuity.toYear||"present"})</span>}</dd></div>
          <div><dt className="font-semibold">Organisational change signal</dt><dd>{review.organisationalChange?.summary||"No material structural change established."}{review.organisationalChange?.type&&<span className="ml-2 text-slate-400">({review.organisationalChange.type})</span>}{review.organisationalChange?.relevance&&<p className="mt-1 text-slate-400">{review.organisationalChange.relevance}</p>}</dd></div>
          <div><dt className="font-semibold">Likely operational burden / gap</dt><dd>{review.operationalGap||"Not established."}</dd></div>
          <div><dt className="font-semibold">Why Root fits</dt><dd>{review.rootFit||"Not established."}</dd></div>
        </dl>
        {review.scoreBreakdown&&<p className="text-xs text-slate-400">Score: alignment {Math.round(review.scoreBreakdown.strategicAlignment)}/30 · problem relevance {Math.round(review.scoreBreakdown.problemRelevance)}/25 · operational opportunity {Math.round(review.scoreBreakdown.operationalOpportunity)}/20 · decision-maker {Math.round(review.scoreBreakdown.decisionMakerQuality)}/15 · current signal {Math.round(review.scoreBreakdown.currentSignal)}/10</p>}
        {review.outreachAngle&&<div><h5 className="font-semibold">Best outreach angle</h5><p className="mt-1 text-sm">{review.outreachAngle}</p></div>}
        {!!review.researchQuestions?.length&&<div><h5 className="font-semibold">Questions that could still change the decision</h5><ul className="mt-1 list-disc space-y-1 pl-5 text-sm">{review.researchQuestions.map((q,i)=><li key={i}>{q}</li>)}</ul></div>}
      </div>}
      {!!review.verifiedFacts.length&&<div><h4 className="font-semibold">What we verified</h4><ul className="mt-1 list-disc space-y-1 pl-5 text-sm">{review.verifiedFacts.map((fact,i)=><li key={i}>{fact.claim}</li>)}</ul></div>}
      {!!review.contraryEvidence?.length&&<div><h4 className="font-semibold">Why not to approach</h4><ul className="mt-1 list-disc space-y-1 pl-5 text-sm">{review.contraryEvidence.map((v,i)=><li key={i}>{v}</li>)}</ul></div>}
      {!!review.missingEvidence?.length&&<div><h4 className="font-semibold">Still missing</h4><ul className="mt-1 list-disc space-y-1 pl-5 text-sm">{review.missingEvidence.map((v,i)=><li key={i}>{v}</li>)}</ul></div>}
      {requestedResearch&&<div className="space-y-3 rounded-lg border border-white/10 bg-white/[0.02] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h4 className="font-semibold">Decision-makers</h4><p className="text-sm text-slate-400">Ranked by geography, functional ownership and buying proximity — not seniority alone.</p></div><button type="button" disabled={busy} onClick={()=>void findPeople()} className="rounded border border-emerald-400/30 px-3 py-2">{busy?"Searching…":review.people?.length?"Search again":"Find decision-makers"}</button></div>
        Use placeholders, not somebody else&apos;s address. This is used only to infer a likely work email and is not saved as a verified address.
        {!!review.people?.length&&<div className="grid gap-3 md:grid-cols-2">{review.people.map((person,i)=><article key={`${person.name}-${person.role}-${i}`} className="rounded border border-white/10 p-3">
          <div className="flex items-start justify-between gap-3"><div><div className="font-semibold">{person.name}</div><div className="text-sm text-slate-300">{person.role}</div></div><div className="rounded-full border border-white/10 px-2 py-1 text-xs">{person.score}/100</div></div>
          <div className="mt-2 flex flex-wrap gap-2 text-xs uppercase tracking-wide text-slate-500"><span>{person.geography.replaceAll("_"," ")}</span><span>· {person.functionalFit} fit</span><span>· {person.buyingProximity}</span><span>· {person.seniority.replaceAll("_"," ")}</span></div>
          <p className="mt-2 text-sm">{person.relevance}</p>
          {person.contact&&<div className="mt-3 rounded border border-white/10 bg-black/10 p-3 text-sm">
            {person.contact.emailStatus==="verified"&&person.contact.directEmail&&<p><strong>Verified work email:</strong> {person.contact.directEmail}</p>}
            {person.contact.emailStatus==="inferred_pattern"&&person.contact.inferredEmail&&<p><strong>Likely work email:</strong> {person.contact.inferredEmail} <span className="text-slate-400">(inferred from supplied company format; not independently verified)</span></p>}
            {person.contact.emailStatus==="not_found"&&<p><strong>Direct email:</strong> Not publicly verified</p>}
            {person.contact.personLocation&&<p><strong>Publicly evidenced work location:</strong> {person.contact.personLocation}</p>}
            {!!person.contact.phoneRoutes?.length&&<div className="mt-2 space-y-1"><strong>Public phone routes:</strong>{person.contact.phoneRoutes.map((phone,j)=><p key={`${phone.number}-${j}`} className="ml-2"><span className="font-medium">{phone.number}</span> · {phone.routeType.replaceAll("_"," ")}{phone.location?` · ${phone.location}`:""} · {phone.geographyMatch==="matched"?"location match":phone.geographyMatch==="mismatch"?"location mismatch":"location unverified"}{phone.forwardingStatus==="verified"?" · forwarding verified":""}</p>)}</div>}
            {!person.contact.phoneRoutes?.length&&person.contact.publicPhone&&<p><strong>Public business phone:</strong> {person.contact.publicPhone}</p>}
            {person.contact.note&&<p className="mt-1 text-slate-300">{person.contact.note}</p>}
            <div className="mt-2 flex flex-wrap gap-3">{person.contact.linkedinUrl&&<a className="text-sky-300 underline" href={person.contact.linkedinUrl} target="_blank" rel="noopener noreferrer">LinkedIn</a>}{person.contact.officialContactUrl&&<a className="text-sky-300 underline" href={person.contact.officialContactUrl} target="_blank" rel="noopener noreferrer">Official contact route</a>}</div>
          </div>}
          <div className="mt-3 flex flex-wrap gap-3 text-sm"><button type="button" disabled={busy} onClick={()=>void findContact(person.name,person.role)} className="rounded border border-emerald-400/30 px-2 py-1">{person.contact?"Research contact again":"Find contact route"}</button>{person.publicProfileUrl&&<a className="text-sky-300 underline" href={person.publicProfileUrl} target="_blank" rel="noopener noreferrer">Public profile</a>}{person.sourceUrls.map((url,j)=><a key={url} className="text-sky-300 underline" href={url} target="_blank" rel="noopener noreferrer">Source {j+1}</a>)}</div>
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
