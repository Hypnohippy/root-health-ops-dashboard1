import { readLifecycleInput } from "@/lib/lifecycleSnapshot.server";
import { buildContactLifecycle, lifecycleLinkedInIdentity, type LifecycleInput, type LifecycleRow, type LifecycleTable } from "@/lib/contactLifecycle";
import { sendReceipts, externalSentAt } from "@/lib/linkedinSendEvidence";
import { readTenantHistory } from "@/lib/opsSearch.server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { RelationshipTenant } from "@/lib/relationshipWorkspace.server";
import type { GuideAnswer, GuideLink, OpsCoachContext } from "@/lib/rootCoachGuide";

const text = (v: unknown, size=600) => typeof v === "string" ? v.trim().slice(0,size) : "";
const object = (v: unknown): Record<string,unknown> => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string,unknown> : {};
const normal = (v: unknown) => text(v,120).normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu," ").trim();
const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const prefixes = {inbox_items:"inbox",growth_targets:"target",acquisition_items:"acquisition"} as const;
export function companyLabels(row: LifecycleRow) {
  const raw=object(row.raw),meta=object(row.metadata),engine=object(row.engine_state);
  return [row.company,engine.company,raw.company,object(raw.metadata).company,meta.company].map(v=>text(v,120)).filter(Boolean);
}
/** Subject discovery only: these strings never establish or link a person identity. */
export function opsQuestionSubject(question: string): string | null {
  const patterns=[/(?:e-?mail|reply|response)\s+from\s+(.+?)[?.!]*$/i,/(?:what did|have we heard from)\s+(.+?)(?:\s+say)?[?.!]*$/i,/(?:happening with|latest (?:with|on)|happened with|prepare me for|where (?:do I find|is)|what should I do about)\s+(.+?)(?:\s+(?:reply|email|relationship))?[?.!]*$/i,/(?:is|was)\s+(?:the\s+)?(.+?)\s+(?:email|reply)\s+(?:saved|recorded)[?.!]*$/i];
  const value=patterns.map(p=>question.trim().match(p)?.[1]).find(Boolean)?.trim().replace(/[?.!]+$/,"");
  return value && value.length<=100 && /^[\p{L}][\p{L}\p{N} '&’.-]*$/u.test(value) && !/^(?:this|it|my|our|the|a|an|saved resources|replies|follow ups)$/i.test(value) ? value : null;
}
export const pageHelpQuestion = (q: string) => /what does this page do|how (?:do|can) I (?:create|edit|upload)|where (?:are|do I find) my replies|what is (?:a relationship|acquisition)|what does (?:this )?status mean|what is follow.up due/i.test(q);
export const contextFollowup = (q: string) => /\b(?:it|this|that|next|now|reply|draft|saved|record|due|say|do)\b/i.test(q);
export function parseOpsContext(value: unknown): OpsCoachContext | null {
  if(value===undefined || value===null)return null;
  const c=object(value);
  if(c.kind==="company" && typeof c.name==="string" && c.name.length<=100 && normal(c.name) && Object.keys(c).every(k=>["kind","name"].includes(k)))return {kind:"company",name:c.name};
  if(c.kind==="object" && ["resource_library","campaigns","sequences","scheduled_posts"].includes(String(c.table)) && typeof c.id==="string" && uuid.test(c.id) && Object.keys(c).every(k=>["kind","table","id"].includes(k)))return {kind:"object",table:c.table as "resource_library",id:c.id};
  if(c.kind==="source" && Object.keys(prefixes).includes(String(c.table)) && typeof c.id==="string" && uuid.test(c.id) && Object.keys(c).every(k=>["kind","table","id"].includes(k)))return {kind:"source",table:c.table as LifecycleTable,id:c.id};
  throw Error("Invalid context.");
}
const routeFor=(table:LifecycleTable,id:string,org:string):GuideLink => ({id:"relationships",label:`Review ${prefixes[table]} record`,href:`/dashboard/growth/relationships/${prefixes[table]}_${id}?organisationId=${encodeURIComponent(org)}`});
const uk=(at: unknown) => typeof at==="string" && Number.isFinite(Date.parse(at)) ? new Date(at).toLocaleString("en-GB",{timeZone:"Europe/London"})+" UK" : "actual time not recorded";
export function companyMatches(input:LifecycleInput,org:string,name:string) {
  const terms=normal(name).split(" ");
  return (Object.keys(prefixes) as LifecycleTable[]).flatMap(table=>input[table].filter(row=>row.organisation_id===org && companyLabels(row).some(label=>{const words=normal(label).split(" ");return terms.every(t=>words.includes(t));})).map(row=>({table,row})));
}
export async function opsCoachContextAnswer(tenant:RelationshipTenant,question:string,context:OpsCoachContext|null,subject:string|null,route:unknown):Promise<(GuideAnswer & {grounding?:string;stateSummary?:string})|null> {
  const org=tenant.organisationId;
  if(!subject && !context && pageHelpQuestion(question))return null;
  // Exact object IDs are references only; every read is independently tenant-scoped.
  const routeObject=typeof route==="string" ? route.match(/^\/dashboard\/resources\/(?:present|presenter)\/([a-f0-9-]{36})$/i) : null;
  const obj=!subject && (context?.kind==="object" ? context : routeObject ? {kind:"object" as const,table:"resource_library" as const,id:routeObject[1]} : null);
  if(obj && /saved|record|created|this|where|open|status/i.test(question)) {
    const columns=obj.table==="resource_library"?"id,organisation_id,title,created_at":"id,organisation_id,status,created_at";
    const {data,error}=await supabaseAdmin.from(obj.table).select(columns).eq("organisation_id",org).eq("id",obj.id).limit(1);
    if(error)throw Error("Recorded state unavailable.");
    const row=(data || []).find(r=>r.organisation_id===org && r.id===obj.id);
    if(!row)return {workspace:"Recorded state",message:"Cannot establish safely: that object is not available in your authorised persisted records. Browser content alone does not prove it is saved.",destinations:[]};
    const id=obj.table==="resource_library"?"resources":obj.table==="scheduled_posts"?"scheduled":"campaigns";
    const path=id==="resources"?"/dashboard/resources":id==="scheduled"?"/dashboard/scheduled":"/dashboard/sequences";
    return {workspace:"Recorded state",message:`Saved — this ${id==="resources"?"resource":"work item"} exists in your organisation’s persisted records.${"status" in row ? ` Recorded status: ${text(row.status,80)}.` : ""} This establishes storage, not delivery or an unsaved browser edit.`,context:obj,destinations:[{id,label:"Open recorded item",href:`${path}?organisationId=${org}${id==="resources"?`&resourceId=${obj.id}`:""}`} ]};
  }
  const selectedSource=!subject && context?.kind==="source" ? context : null;
  const contentTerm=!subject && !context ? question.match(/^who told us to contact (.{2,60})[?.!]*$/i)?.[1]?.replace(/[?.!]+$/,"").trim() : null;
  const wanted=subject || (context?.kind==="company" ? context.name : null);
  const attention=!wanted && !selectedSource && /what (?:should I|do I) do (?:next|now)|what.*(?:need.*attention|opportunities)|who should I contact next/i.test(question);
  if(!wanted && !attention && !selectedSource && !contentTerm) {
    if(/is (?:this|it) saved|did (?:that|the) (?:send|message).*record|did I already send|is this (?:contact|draft).*due|did.*(?:record|save)|why is this contact still showing/i.test(question))return {workspace:"Recorded state",message:"Cannot establish safely: no exact persisted object is selected. A click, copied message, opened tab or generated draft does not establish saving or sending. Open the relevant record to review its stored evidence.",destinations:[]};
    return null;
  }
  const input=await readLifecycleInput(org);
  // Defence in depth: even test fixtures/upstream adapters cannot widen the tenant.
  for(const table of Object.keys(prefixes) as LifecycleTable[]) input[table]=input[table].filter(r=>r.organisation_id===org);
  if(attention) {
    const contacts=buildContactLifecycle(org,input).filter(c=>c.currentStage==="needs_reply" || c.followUpStatus==="due").slice(0,5);
    return {workspace:"Recorded work needing attention",message:contacts.length ? `Existing reply/due-work evidence (up to five; not a new priority ranking):\n\n${contacts.map(c=>`${c.name||c.company||"Recorded contact"}: ${c.currentStage}; ${c.nextAction||"review source"}${c.nextDueDate?`; due ${uk(c.nextDueDate)}`:""}.`).join("\n\n")}` : "No reply-needed or currently due follow-up is established in this lifecycle snapshot. Waiting or future work is not due now; other workspaces may contain work outside this snapshot.",destinations:contacts.map(c=>routeFor(c.actionRecord.table,c.actionRecord.id,org))};
  }
  const companyRecords=selectedSource ? input[selectedSource.table].filter(row=>row.id===selectedSource.id).map(row=>({table:selectedSource.table,row})) : contentTerm ? (Object.keys(prefixes) as LifecycleTable[]).flatMap(table=>input[table].filter(row=>[row.text,row.last_reply_text,row.reply_notes,row.evidence].some(v=>normal(v).includes(normal(contentTerm)))).map(row=>({table,row}))) : companyMatches(input,org,wanted!);
  // Work evidence association only. An exact recorded mailbox may find its inbox
  // item, but never resolves a person, joins Truth entries or expands to a domain.
  const address=(v:unknown)=>typeof v==="string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim())?v.trim().toLowerCase():null;
  const addresses=new Set(companyRecords.flatMap(({row})=>[row.email,row.sender_email,object(row.engine_state).email,object(row.metadata).email].map(address).filter(Boolean)));
  const associated=input.inbox_items.filter(row=>[row.sender_email,row.author_handle,object(row.raw).email,object(row.raw).sender_email].map(address).some(v=>v && addresses.has(v)) && !companyRecords.some(r=>r.table==="inbox_items"&&r.row.id===row.id)).map(row=>({table:"inbox_items" as const,row}));
  const matches=[...companyRecords,...associated].sort((a,b)=>Number(b.table==="inbox_items")-Number(a.table==="inbox_items") || String(b.row.created_at||b.row.updated_at||"").localeCompare(String(a.row.created_at||a.row.updated_at||"")));
  if(!matches.length)return selectedSource || contentTerm ? {workspace:"Recorded evidence",message:"Cannot establish safely: no matching authorised recorded evidence was found. No mailbox was searched.",destinations:[]} : null;
  const selected=matches.slice(0,8), records=selected.map(({table,row})=>({table,id:row.id}));
  const threads=new Set(selected.flatMap(({row})=>[text(row.email_thread_id),text(row.email_sent_thread_id)]).filter(Boolean));
  const identities=new Set(selected.flatMap(({row})=>[row.linkedin_identity,row.linkedin_url].map(lifecycleLinkedInIdentity).filter(Boolean)));
  const [email,linkedin]=await Promise.all([threads.size?readTenantHistory("email_conversation_messages",org):[],identities.size?readTenantHistory("linkedin_conversation_messages",org):[]]);
  const messages=[...email.filter(r=>r.organisation_id===org && threads.has(String(r.gmail_thread_id))).map(r=>({at:text(r.sent_at),channel:"Email",direction:text(r.direction),body:text(r.body,1000)})),...linkedin.filter(r=>r.organisation_id===org && identities.has(lifecycleLinkedInIdentity(r.linkedin_identity))).map(r=>({at:text(r.message_at),channel:"LinkedIn",direction:text(r.direction),body:text(r.message,1000)}))].sort((a,b)=>b.at.localeCompare(a.at)).slice(0,8);
  const lines=selected.map(({table,row})=>{
    // Project each source separately: company discovery never collapses people or creates identity.
    const single:LifecycleInput={acquisition_items:[],inbox_items:[],growth_targets:[]};single[table]=[row];
    const state=buildContactLifecycle(org,single)[0];
    const engine=object(row.engine_state),receipt=sendReceipts(row.manual_completion)[0];
    const inbound=text(table==="inbox_items"?row.text:row.last_reply_text||row.reply_notes,1000);
    return `${text(row.person||row.target_name||row.author_name,100)||"Company work record"} [${table}:${row.id}]: recorded company/work association ${companyLabels(row)[0]||"exact recorded mailbox match; person identity not established"}; state ${state?.currentStage||"unknown"}; next action ${state?.nextAction||"not recorded"}; next due ${state?.nextDueDate?uk(state.nextDueDate):"not recorded"}.`+
      (engine.reply_state?` Recorded source reply classification: ${text(engine.reply_state,80)}.`:"")+
      (inbound?` Recorded ${table==="inbox_items"?text(row.platform,30)||"inbound":"reply notes"}: ${inbound}`:"")+
      (table==="acquisition_items"&&row.evidence?` Source evidence: ${text(row.evidence,1000)}`:"")+
      (receipt?.key?` Manual send receipt persisted: ${text(receipt.key,60)}; actual sent time ${uk(externalSentAt(receipt))}; confirmation ${uk(receipt.confirmed_at)}. A manual receipt is user-confirmed evidence, not independent delivery proof.`:" No manual send receipt is supplied for this source; this does not prove no external send occurred.");
  });
  const company=companyRecords.length ? companyLabels(companyRecords[0].row)[0] || "Selected work" : wanted!;
  const excerpts=messages.map(m=>`${m.channel} ${m.direction} ${uk(m.at)}: ${m.body}`);
  const concise=selected.map(({table,row})=>{
    const single:LifecycleInput={acquisition_items:[],inbox_items:[],growth_targets:[]};single[table]=[row];
    const state=buildContactLifecycle(org,single)[0],receipt=sendReceipts(row.manual_completion)[0];
    const label=text(row.person||row.target_name||row.author_name,100)||"Company work record";
    return `${label}${!companyLabels(row).length && associated.some(a=>a.row.id===row.id)?" (exact mailbox work match; person identity not established)":""}: ${state?.currentStage||"unknown"}; ${state?.nextAction?`recorded next action: ${state.nextAction}`:"no action recorded as due"}${state?.nextDueDate?`; next due ${uk(state.nextDueDate)}`:""}.`+
      (/record|send|saved/i.test(question)?receipt?` Manual send receipt persisted; actual sent time ${uk(externalSentAt(receipt))}; confirmation ${uk(receipt.confirmed_at)}. User-confirmed evidence, not independent delivery proof.`:" No manual send receipt is supplied for this source; this does not prove no external send occurred.":"");
  });
  const inbound=messages.find(m=>m.direction==="inbound")?.body || text(selected.find(r=>r.table==="inbox_items")?.row.text,1000);
  const outbound=messages.find(m=>m.direction==="outbound")?.body;
  const current=selected.find(r=>r.table==="inbox_items") || (selected.length===1?selected[0]:null);
  const currentInput:LifecycleInput={acquisition_items:[],inbox_items:[],growth_targets:[]};
  if(current)currentInput[current.table]=[current.row];
  const currentState=current?buildContactLifecycle(org,currentInput)[0]:null;
  const stateSummary=currentState?`Current recorded ${current?.table==="inbox_items"?"response":"work"} state: ${currentState.currentStage}; ${currentState.nextDueDate && Date.parse(currentState.nextDueDate)>Date.now()?`nothing due now; next due ${uk(currentState.nextDueDate)}`:currentState.nextAction?`next action: ${currentState.nextAction}`:"no action recorded as due"}.`:"Multiple distinct work records are present; no single contact or next action has been selected.";
  const persistence=/saved|did.*(?:record|send)|already sent/i.test(question);
  const savedLead=/saved/i.test(question)?/email|reply/i.test(question)&&!inbound&&!outbound?"Cannot establish a saved email from the supplied evidence; company work records exist.":"Saved — the selected work/evidence exists in your authorised Ops records. Browser edits and unrecorded external actions remain unverified.":"";
  const sendLead=/did.*(?:record|send)|already sent/i.test(question)?outbound?`An outbound message is recorded in the linked conversation at ${uk(messages.find(m=>m.direction==="outbound")?.at)}. This establishes that recorded message only, not that the current suggested draft was sent. It is not independent delivery proof.`:selected.some(r=>sendReceipts(r.row.manual_completion).length)?"Manual send evidence is recorded; review its actual send and confirmation times below.":"Cannot establish a send from the supplied persisted receipt/conversation evidence. This does not prove no external send occurred.":"";
  const message=[persistence?savedLead||sendLead:stateSummary,inbound?`Recorded reply: ${text(inbound,600)}`:"No recorded reply text is supplied for this company/work selection; unrecorded mailbox content cannot be established.",outbound?`Latest recorded outbound: ${outbound}`:"",...concise,`${matches.length} separate company/work records (showing up to eight); no person identity is inferred or merged. These items are saved Ops evidence. Only recorded excerpts are available; no mailbox was searched.`].filter(Boolean).join("\n\n");
  return {workspace:`Company work: ${company}`,stateSummary,context:selectedSource || (contentTerm ? {kind:"source",table:selected[0].table,id:selected[0].row.id} : {kind:"company",name:wanted!}),message,grounding:`${messages.find(m=>m.direction==="inbound")?.body ? `Latest linked inbound excerpt: ${messages.find(m=>m.direction==="inbound")!.body}\n\n` : selected.find(r=>r.table==="inbox_items") ? `Recorded response excerpt: ${text(selected.find(r=>r.table==="inbox_items")!.row.text,1000)}\n\n` : ""}${matches.length} recorded company/work ${matches.length===1?"item":"items"} for ${company}. These are separate source records; no person identity is inferred or merged. Showing up to eight.\n\n${lines.join("\n\n").slice(0,5200)}${excerpts.length?"\n\nRecorded conversation excerpts:\n"+excerpts.join("\n\n"):""}\n\nThese items are saved Ops evidence. Only recorded excerpts are available; no mailbox was searched. Source timestamps/classifications do not establish message content, delivery or a completed referral.`,destinations:records.map(r=>routeFor(r.table,r.id,org))};
}
