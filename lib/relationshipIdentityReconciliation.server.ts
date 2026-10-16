import { AccessError } from "@/lib/tenantAuth";
import { founderAllowed, type RelationshipTenant } from "@/lib/relationshipWorkspace.server";
import { readLifecycleInput } from "@/lib/lifecycleSnapshot.server";
import { readTenantHistory } from "@/lib/opsSearch.server";
import type { TruthInput, TruthPolicy, TruthRow } from "@/lib/relationshipTruth";
import { hypotheticalDecision, reconciliationCandidates, identityDecisionPartition, truthWithIdentityDecisions, syntheticIdentityReviewInput, type IdentityDecisionChoice, type RelationshipIdentityDecision } from "@/lib/relationshipIdentityReconciliation";

export function requireIdentityReviewer(tenant:RelationshipTenant) {if(!["owner","admin"].includes(tenant.role.toLowerCase()))throw new AccessError("Identity review requires an organisation owner or admin.",403);}
export async function readIdentityReview(tenant:RelationshipTenant,asOf=new Date().toISOString(),example=false) {
 requireIdentityReviewer(tenant); // Deny before any source/evidence read.
 if(example){const input=syntheticIdentityReviewInput(tenant.organisationId),policy:TruthPolicy={organisationId:tenant.organisationId,founderAllowed:false,asOf};return {input,policy,...reconciliationCandidates(input,policy),example:true};}
 const canFounder=await founderAllowed(tenant.organisationId);
 const names=["email_conversation_messages","linkedin_conversation_messages","relationship_workspaces","relationship_source_links","relationship_activity_events","relationship_tasks","acquisition_item_events","response_item_events"];
 const [lifecycle,rows,founder,founderActivities]=await Promise.all([readLifecycleInput(tenant.organisationId,false),Promise.all(names.map(t=>readTenantHistory(t,tenant.organisationId,"*",t==="relationship_source_links"?["source_table","source_id"]:["id"]))),canFounder?readTenantHistory("founder_research_records",tenant.organisationId):Promise.resolve([]),canFounder?readTenantHistory("founder_activity_events",tenant.organisationId):Promise.resolve([])]);
 const [emailMessages,linkedinMessages,workspaces,links,activities,tasks,acquisitionEvents,responseEvents]=rows as TruthRow[][];
 const input:TruthInput={lifecycle,founder:founder as TruthRow[],founderActivities:founderActivities as TruthRow[],emailMessages,linkedinMessages,workspaces,links,activities,tasks,acquisitionEvents,responseEvents};
 const policy:TruthPolicy={organisationId:tenant.organisationId,founderAllowed:canFounder,asOf};
 return {input,policy,...reconciliationCandidates(input,policy),example:false};
}
export function identityReviewPayload(ctx:Awaited<ReturnType<typeof readIdentityReview>>) {return {candidates:ctx.candidates,groupCount:ctx.groupCount,sourceGroupCount:ctx.partition.groups.length,asOf:ctx.policy.asOf,simulation:true as const,persistenceEnabled:false as const,example:ctx.example};}
export type IdentityPreviewRequest={candidateId:string;candidateRevision:string;evidenceIdsShown:string[];choice:IdentityDecisionChoice;confirmed:boolean;requestId:string;note?:string};
export function previewIdentityReview(ctx:Awaited<ReturnType<typeof readIdentityReview>>,tenant:RelationshipTenant,requests:IdentityPreviewRequest[]) {
 requireIdentityReviewer(tenant);if(tenant.organisationId!==ctx.policy.organisationId||!Array.isArray(requests)||!requests.length||requests.length>100)throw new AccessError("Invalid bounded review preview.",400);
 const decisions:RelationshipIdentityDecision[]=[],revisions=new Map<string,number>();const seen=new Set<string>();
 for(const req of requests) {
  if(!req||typeof req.candidateId!=="string"||typeof req.requestId!=="string"||!/^[a-f0-9-]{36}$/i.test(req.requestId)||seen.has(req.requestId)||!Array.isArray(req.evidenceIdsShown)||req.evidenceIdsShown.length>100||req.evidenceIdsShown.some(id=>typeof id!=="string"))throw new AccessError("Invalid hypothetical review request.",400);
  const candidate=ctx.candidates.find(c=>c.id===req.candidateId);if(!candidate)throw new AccessError("Candidate is no longer available in this organisation.",409);
  const revision=(revisions.get(candidate.id)||0)+1;revisions.set(candidate.id,revision);seen.add(req.requestId);
  try{decisions.push(hypotheticalDecision(candidate,req.choice,{organisationId:tenant.organisationId,userId:tenant.userId},ctx.policy.asOf,{id:`hypothetical:${req.requestId}`,revision,confirmed:req.confirmed===true,note:req.note,candidateRevision:req.candidateRevision,evidenceIdsShown:req.evidenceIdsShown}));}catch(error){throw new AccessError(error instanceof Error?error.message:"Review evidence changed.",409);}
 }
 try{
  const partition=identityDecisionPartition(ctx.input,ctx.policy,decisions),last=decisions[decisions.length-1];
  const truth=truthWithIdentityDecisions(ctx.input,last.sourceRefA,ctx.policy,decisions,partition);
  const a=`${last.sourceRefA.table}:${last.sourceRefA.id}`,b=`${last.sourceRefB.table}:${last.sourceRefB.id}`;
  return {simulation:true,persisted:false,decision:last,reviewedPairs:new Set(decisions.filter(d=>d.decision!=="review_later").map(d=>[`${d.sourceRefA.table}:${d.sourceRefA.id}`,`${d.sourceRefB.table}:${d.sourceRefB.id}`].sort().join('|'))).size,deferredRequests:decisions.filter(d=>d.decision==="review_later").length,shadowSourceGroups:partition.groups.length,sameShadowRelationship:partition.byRef.get(a)===partition.byRef.get(b),affectedSourceCount:truth.sourceRecords.length,decisionEvidenceIds:truth.actionableState.evidenceIds,operationalAction:"Unchanged — this is a dry run",limitations:["Hypothetical only. No decision, source, link, workspace or history was saved.","Existing lifecycle, queues and operational actions are unchanged."]};
 }catch(error){throw new AccessError(error instanceof Error?error.message:"Hypothetical decisions conflict.",409);}
}
