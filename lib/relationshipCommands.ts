import { object, words, type Row, type SourceRef, type EvidenceEvent } from "@/lib/relationshipWorkspace";

export const strategyPrompts = ["Understand latest response", "What are they looking for?", "What opportunities do you see?", "What are the risks?", "Recommend next move", "Prepare me for a call"] as const;
/** Avoid treating the generic words “a call” as a newly named subject in the existing coach parser. */
export function strategyQuestion(prompt:string){return prompt==="Prepare me for a call"?"Prepare a call briefing for this relationship using its recorded evidence.":prompt;}
export type CommandSnapshot = { actor:string; storageAvailable:boolean; workspace:{revision:unknown}|null; relationship:{name:string;refs:SourceRef[]}; founder:Row[]; tasks:Row[]; history?:{dated:EvidenceEvent[];undated:EvidenceEvent[]}; intelligence:{identity:{humanReviewRequired:boolean}} };
export type RelationshipProposal = { actionType:"note"|"activity"|"task_created"|"retention"; targetRelationship:string; organisationId:string; actor:string; revision:unknown; sourceRefs:SourceRef[]; request:string; details:Row; consequence:string; evidenceBasis:string; confirmationRequired:true };
export function recordedConnectionEvidence(data:Pick<CommandSnapshot,"relationship"|"history">) {
 return [...(data.history?.dated||[]),...(data.history?.undated||[])].find(e=>e.kind==="Connection accepted"&&e.channel==="LinkedIn"&&data.relationship.refs.some(ref=>ref.table==="inbox_items"&&e.id===`acceptance:${ref.id}`))||null;
}
export type ProposalAnswer = { proposals:RelationshipProposal[]; explanations:string[] };
/** Bounded intent adapter. No model tools, database calls or free-form execution. */
export function relationshipProposals(request:unknown,organisationId:string,locator:string,data:CommandSnapshot):ProposalAnswer {
 const text=words(request); if(!text || text.length>600)throw Error("Use a request of 1–600 characters.");
 const explanations:string[]=[],proposals:RelationshipProposal[]=[];
 const q=text.toLowerCase();
 if(/\b(?:send|publish|delete|merge|convert|mark (?:as )?(?:won|lost)|set (?:the )?(?:lifecycle|stage)|calendar|provider)\b/.test(q))return {proposals,explanations:["That action is unavailable through Ask Root. No action taken. Use the existing governed workflow."]};
 if(/research/.test(q))explanations.push(data.founder.length?"Linked Founder research is already recorded. Open its protected source to review it; no research stage will be changed.":"Research is not recorded on this exact source. Open Founder to start or review research; a statement cannot create research evidence or link identities.");
 if(/connected|connection|acceptance/.test(q))explanations.push(recordedConnectionEvidence(data)?"An accepted-connection source is already recorded on this exact relationship. Review its History/source provenance; no new acceptance, send receipt or date will be created.":"Manual contact is not connection acceptance. Review the recorded LinkedIn source evidence. A new user-confirmed connection requires a separately reviewed provenance contract; no acceptance date or receipt is created here.");
 const assertion=!/\?|^(?:have|has|did|do|does|can|should|what|why|when|how)\b|\b(?:not|never|haven.t|hasn.t|didn.t)\b/i.test(text);
 const manual= !assertion?null: /\b(?:emailed|email sent)\b/.test(q)?"emailed":/\b(?:linkedin contacted|messaged (?:them |her |him )?on linkedin)\b/.test(q)?"linkedin_contacted":/\b(?:called|phone call)\b/.test(q)?"called":/\b(?:had a meeting|record (?:a )?meeting)\b/.test(q)?"meeting":null;
 let action:RelationshipProposal["actionType"]|null=null,details:Row={},consequence="";
 if(manual){
  action="activity";
  const clause=text.split(/[,;]|\band\b/i).find(c=>manual==="emailed"?/emailed|email sent/i.test(c):manual==="called"?/called|phone call/i.test(c):manual==="meeting"?/meeting/i.test(c):/linkedin contacted|messaged/i.test(c))?.trim()||text;
  details={activityType:manual,message:clause,timeChoice:"unknown",occurredAt:null};
  consequence="Adds user-recorded relationship history with unknown actual time. It does not prove delivery, acceptance, meeting booking or cadence completion. Use Record activity to supply a known actual date/time.";
 } else if(/^(?:please )?(?:add|record|save) (?:a )?(?:note|observation|commitment)\s*:/i.test(text)) {
  action="note";details={message:text.slice(text.indexOf(":")+1).trim(),noteType:/commitment/i.test(text.split(":")[0])?"Commitment":"Observation",timeChoice:"now",occurredAt:null};consequence="Adds your typed note to relationship history. Your observation is not independent provider or recipient evidence.";
 } else if(/^(?:please )?(?:add|create) (?:a )?task\s*:/i.test(text)) {
  action="task_created";details={task:text.slice(text.indexOf(":")+1).trim(),owner:data.actor,dueAt:null,source:"User-confirmed Ask Root task proposal"};consequence="Creates one open task assigned to you, without a due date. It does not schedule or send anything.";
 } else if(/^(?:please )?(?:mark (?:this relationship )?stale|restore (?:this relationship )?(?:to )?active)[.!]?$/i.test(text)) {
  action="retention";details={retention:/stale/.test(q)?"stale":"active"};consequence=details.retention==="stale"?"Pauses proactive pursuit while preserving inbound work, history and due dates.":"Restores active retention. Existing send governors still determine eligibility; nothing is sent.";
 }
 if(action && (details.message===""||details.task===""))throw Error("Include the exact text to record.");
 if(action && (!data.storageAvailable || data.intelligence.identity.humanReviewRequired))explanations.push("A proposal cannot be confirmed until storage is available and this relationship identity is established. Use the exact source workflow or identity review; no records were changed.");
 else if(action)proposals.push({actionType:action,targetRelationship:locator,organisationId,actor:data.actor,revision:data.workspace?.revision??null,sourceRefs:data.relationship.refs,request:text,details,consequence,evidenceBasis:`Current canonical record: ${data.relationship.name}. Source: user statement; not independent verification.`,confirmationRequired:true});
 if(!action&&!explanations.length)explanations.push("Use ‘Add note: …’, ‘Add task: …’, ‘Record that I emailed them’, ‘Mark stale’ or ‘Restore active’. Other actions remain in the existing relationship controls.");
 return {proposals,explanations};
}
/** Rebuild the allowlisted proposal from its original request. Browser/model fields cannot widen it.
 * Revision is passed unchanged to the existing atomic/idempotent domain governor. */
export function validateRelationshipProposal(value:unknown,organisationId:string,locator:string,data:CommandSnapshot) {
 const proposed=object(value), current=relationshipProposals(proposed.request,organisationId,locator,data).proposals[0];
 if(!current)throw Error("Proposal unavailable. Reopen and review the relationship.");
 const expected={...current,revision:proposed.revision};
 if(JSON.stringify(proposed)!==JSON.stringify(expected))throw Error("Proposal changed. Request and review it again.");
 if(proposed.actor!==data.actor)throw Error("Proposal unavailable.");
 return expected;
}
