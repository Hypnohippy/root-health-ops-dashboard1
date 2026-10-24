import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { AccessError } from "@/lib/tenantAuth";
import { requireFounderIntelligence } from "@/lib/founderIntelligenceAuth.server";
import { relationshipContext, type RelationshipTenant } from "@/lib/relationshipWorkspace.server";
import { readTenantHistory } from "@/lib/opsSearch.server";
import { readOperationalIntelligence } from "@/lib/operationalIntelligence.server";
import { resolveRelationshipIntake } from "@/lib/relationshipIntake";
import { relationshipDiscoveryInventory } from "@/lib/relationshipDiscovery";
import type { IdentityLedgerRow } from "@/lib/relationshipIdentityLedger";
import { identitySourceFacts } from "@/lib/relationshipIdentityEvidence";
import { relationshipPublicInput, publicResearchSources, publicResearchFacts, publicResearchScopeNotice } from "@/lib/relationshipResearch";
import { researchManualOpportunity } from "@/lib/manualAcquisitionResearch.server";
import { openIdentityReview, sealIdentityReview } from "@/lib/reviewedIdentityToken.server";
import { selectedPublicEvidence, type ReviewedDecision, type ReviewedSourceTable } from "@/lib/reviewedIdentity";
import { object, words } from "@/lib/relationshipWorkspace";
import type { TruthInput, TruthRef, TruthRow } from "@/lib/relationshipTruth";

const uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const secret=()=>process.env.SUPABASE_SERVICE_ROLE_KEY||"";
const refKey=(r:TruthRef)=>r.table+":"+r.id;
export class ReviewedStateChanged extends AccessError {
 constructor(message:string,public currentReview:Record<string,unknown>){super(message,409);}
}
async function snapshot(tenant:RelationshipTenant) {
 const {data,error}=await supabaseAdmin.rpc("relationship_review_snapshot",{p_org:tenant.organisationId,p_actor:tenant.userId});
 if(error||typeof data!=="string")throw new AccessError("Reviewed identity storage is unavailable. No action was taken.",503);
 return data;
}
async function context(tenant:RelationshipTenant) {
 const ctx=await relationshipContext(tenant),ledger=await readTenantHistory("relationship_identity_decisions",tenant.organisationId,"*",["sequence"]) as IdentityLedgerRow[];
 const input:TruthInput={lifecycle:ctx.input,founder:ctx.founder as TruthRow[],workspaces:ctx.workspaces as TruthRow[],links:ctx.links as TruthRow[],activities:[],tasks:[],emailMessages:[],linkedinMessages:[],founderActivities:[],acquisitionEvents:[],responseEvents:[]};
 return {input,policy:{organisationId:tenant.organisationId,founderAllowed:ctx.canFounder,asOf:new Date().toISOString()},ledger,ctx};
}
function envelope(tenant:RelationshipTenant,stamp:string,key:string,decision:Omit<ReviewedDecision,"version"|"organisationId"|"actor"|"snapshot"|"key"|"expiresAt">):ReviewedDecision {
 if(!uuid.test(key))throw new AccessError("A stable review receipt is required.",400);
 return {...decision,version:1,organisationId:tenant.organisationId,actor:tenant.userId,snapshot:stamp,key,expiresAt:Date.now()+15*60_000};
}
function presented(value:ReviewedDecision) {
 return {reviewToken:sealIdentityReview(value,secret()),review:{action:value.action,label:value.label,refs:value.refs||[],row:value.row,endpointSummary:value.endpointSummary||[],sources:value.sources||[],facts:value.facts||[],matched:value.matched,consequence:value.action==="create"?value.separations?.length?"Creates this reviewed source as a distinct identity, attaches its workspace and records KEEP SEPARATE against every listed source atomically. No message is sent.":"Creates this exact source and one linked canonical workspace atomically. No message is sent.":value.action==="keep_separate"?"Records your symmetric separation decision. Neither source nor lifecycle will be changed.":"Saves only your selected matched public evidence in protected Founder research and links it to this canonical relationship. No identity fact or lifecycle is overwritten."}};
}
function sourceSummary(ref:TruthRef,row:TruthRow,aliases:{type:"linkedin"|"email";value:string}[]) {
 return {ref,name:words(row.person)||words(row.person_name)||words(row.author_name)||words(row.target_name)||words(row.company)||words(row.entity)||"Recorded source",company:words(row.company)||null,status:words(row.response_state)||words(row.status)||words(row.stage)||null,aliases};
}
export async function previewSourceCreation(tenant:RelationshipTenant,table:ReviewedSourceTable,row:TruthRow,kind:"person"|"company",key:string,keepSeparate=false) {
 if(![row.person,row.person_name,row.author_name,row.target_name,row.company].some(value=>words(value)))throw new AccessError("Record a person or organisation name before creating a canonical identity. Your source draft is retained.",400);
 if(identitySourceFacts({table,id:key},row).kind!==kind)throw new AccessError("Recorded source kind requires review before canonical creation.",409);
 const stamp=await snapshot(tenant),state=await context(tenant);
 if(table==="founder_research_records"&&!state.ctx.canFounder)throw new AccessError("Protected review unavailable.");
 const intake=resolveRelationshipIntake(state,{entityKind:kind,sourceType:table,row});
 const candidateRefs=[...new Map(intake.candidates.flatMap(c=>c.refs).map(ref=>[refKey(ref),ref])).values()];
 if(keepSeparate&&!["owner","admin"].includes(tenant.role.toLowerCase()))throw new AccessError("Identity reviewer required.");
 const separate=keepSeparate&&intake.decision==="REVIEW_REQUIRED"&&candidateRefs.length>0&&candidateRefs.length<=20;
 if(!intake.creationPermitted&&!separate)return {intake};
 const aliasesFor=(ref:TruthRef,row:TruthRow)=>{const facts=identitySourceFacts(ref,row);return [...facts.profiles.map(value=>({type:"linkedin" as const,value})),...facts.emails.map(value=>({type:"email" as const,value}))];};
 const separations=separate?candidateRefs.map(ref=>{const current=(ref.table==="founder_research_records"?state.input.founder:state.input.lifecycle[ref.table as keyof typeof state.input.lifecycle]).find(r=>r.id===ref.id);if(!current)throw new AccessError("Review source unavailable.",409);return {ref,aliases:aliasesFor(ref,current)};}):[];
 const endpointSummary=separations.map(s=>{const current=(s.ref.table==="founder_research_records"?state.input.founder:state.input.lifecycle[s.ref.table as keyof typeof state.input.lifecycle]).find(row=>row.id===s.ref.id)!;return sourceSummary(s.ref,current,s.aliases);});
 return {...presented(envelope(tenant,stamp,key,{action:"create",table,row:{...row,id:key,organisation_id:tenant.organisationId},kind,separations,endpointSummary,createdAliases:aliasesFor({table,id:key},row),refs:separations.map(s=>s.ref),label:words(row.person)||words(row.person_name)||words(row.author_name)||words(row.company)||words(row.entity)||"New recorded source"})),intake};
}
export async function previewSeparation(tenant:RelationshipTenant,refs:unknown,key:string) {
 if(!["owner","admin"].includes(tenant.role.toLowerCase()))throw new AccessError("Identity reviewer required.");
 if(!Array.isArray(refs)||refs.length!==2)throw new AccessError("Choose two exact recorded sources.",400);
 const exact=refs.map(r=>({table:words(object(r).table),id:words(object(r).id)})).sort((a,b)=>refKey(a).localeCompare(refKey(b)));
 if(refKey(exact[0])===refKey(exact[1])||exact.some(r=>!uuid.test(r.id)))throw new AccessError("Choose two distinct sources.",400);
 const stamp=await snapshot(tenant),state=await context(tenant),inventory=relationshipDiscoveryInventory(state);
 const rows=exact.map(ref=>({ref,row:(ref.table==="founder_research_records"?state.input.founder:state.input.lifecycle[ref.table as keyof typeof state.input.lifecycle])?.find(r=>r.id===ref.id)}));
 if(rows.some(r=>!r.row)||inventory.partition.byRef.get(refKey(exact[0]))===inventory.partition.byRef.get(refKey(exact[1])))throw new AccessError("Review unavailable for this pair. Existing canonical associations cannot be split here.",409);
 const aliases=rows.map(({ref,row})=>{const facts=identitySourceFacts(ref,row!);return [...facts.profiles.map(value=>({type:"linkedin" as const,value})),...facts.emails.map(value=>({type:"email" as const,value}))];});
 return presented(envelope(tenant,stamp,key,{action:"keep_separate",refs:exact,aliases:{a:aliases[0],b:aliases[1]},endpointSummary:rows.map((r,index)=>sourceSummary(r.ref,r.row!,aliases[index])),label:rows.map(r=>words(r.row?.person)||words(r.row?.author_name)||words(r.row?.person_name)||words(r.row?.company)||refKey(r.ref)).join(" / ")}));
}
export async function previewResearchSave(tenant:RelationshipTenant,locator:string,key:string) {
 const stamp=await snapshot(tenant),data=await readOperationalIntelligence(tenant,locator);
 if(!data.researchAccess||!["owner","admin"].includes(tenant.role.toLowerCase()))throw new AccessError("Protected research review required.");
 if(data.intelligence.identity.humanReviewRequired)throw new AccessError("Resolve the exact relationship destination before saving research.",409);
 const input=relationshipPublicInput(data.relationship,data.sourceDetails);
 const recordedProfiles=[...new Set(data.intelligence.identity.verifiedAliases.filter(alias=>alias.type==="linkedin").map(alias=>alias.value))];
 if(data.relationship.kind==="person"&&recordedProfiles.length===1)input.linkedin=`https://${recordedProfiles[0]}`;
 const review=await researchManualOpportunity(tenant.organisationId,input),notice=publicResearchScopeNotice(input,review);
 const sources=publicResearchSources(review),facts=notice?[]:publicResearchFacts(review,sources);
 const matched=review.research.status==="completed"&&!notice&&facts.length>0;
 return {...presented(envelope(tenant,stamp,key,{action:"save_research",label:data.relationship.name,locator,refs:data.relationship.refs,kind:data.relationship.kind,workspaceId:data.workspace?.id?String(data.workspace.id):null,workspaceRevision:data.workspace?Number(data.workspace.revision):null,sources,facts,matched})),notice:notice||(!matched?"No matched attributed findings are available to save.":null)};
}
/** Confirm is never called by render/research/Ask Root. The token binds the exact
 * reviewed proposal to tenant/actor; DB snapshots and locked Founder authorization
 * protect the transaction against stale review and revoked eligibility. */
export async function confirmReviewedDecision(tenant:RelationshipTenant,token:unknown,confirmed:unknown,urls?:unknown) {
 if(confirmed!==true)throw new AccessError("Explicit reviewed confirmation is required.",400);
 const proposal=openIdentityReview(token,secret(),tenant.organisationId,tenant.userId);
 const payload:Record<string,unknown>={action:proposal.action,table:proposal.table,row:proposal.row,kind:proposal.kind,refs:proposal.refs,aliases:proposal.aliases,separations:proposal.separations,createdAliases:proposal.createdAliases,workspaceId:proposal.workspaceId,workspaceRevision:proposal.workspaceRevision};
 if(proposal.action==="save_research") {
  const approved=selectedPublicEvidence(proposal,urls);
  // No role/company/contact fields are inferred from public findings. This row
  // is explicitly public evidence, permission-protected, linked by reviewed refs.
  payload.table="founder_research_records";
  payload.row={id:proposal.key,organisation_id:tenant.organisationId,created_by:tenant.userId,entity_kind:proposal.kind,person_name:proposal.kind==="person"?proposal.label:null,company:proposal.kind==="company"?proposal.label:null,saved:true,lane:"open_intelligence",geography:"UK",
   research_snapshot:{name:proposal.label,phase2d:{verification:"matched_public",approvedBy:tenant.userId,sourceRefs:proposal.refs,sources:approved.sources,facts:approved.facts},recommendedApproach:"Approved historical public evidence; not an internal observation, identity decision or current intent."},sources:approved.sources};
 }
 const {data:receipt,error:receiptError}=await supabaseAdmin.from("relationship_review_receipts").select("payload_hash,result,actor").eq("organisation_id",tenant.organisationId).eq("request_id",proposal.key).maybeSingle();
 if(receiptError)throw new AccessError("Reviewed identity storage is unavailable.",503);
 if(!receipt) {
  if(await snapshot(tenant)!==proposal.snapshot) {
   const fallback={decision:"REVIEW_REQUIRED",destination:`/dashboard/growth/relationships/review?organisationId=${encodeURIComponent(tenant.organisationId)}`};
   const currentReview=proposal.action==="create"?resolveRelationshipIntake(await context(tenant),{entityKind:proposal.kind!,sourceType:proposal.table!,row:proposal.row!}):fallback;
   throw new ReviewedStateChanged("Review changed. Reload and review the current safe destination; nothing was saved.",currentReview);
  }
  if(proposal.action==="create") {
   const state=await context(tenant),intake=resolveRelationshipIntake(state,{entityKind:proposal.kind!,sourceType:proposal.table!,row:proposal.row!});
   const candidates=[...new Set(intake.candidates.flatMap(c=>c.refs.map(refKey)))].sort(),reviewed=(proposal.separations||[]).map(s=>refKey(s.ref)).sort();
   const reviewedSeparate=intake.decision==="REVIEW_REQUIRED"&&reviewed.length>0&&JSON.stringify(candidates)===JSON.stringify(reviewed);
   if(!intake.creationPermitted&&!reviewedSeparate)throw new AccessError("The new-identity decision changed. Review the existing destination.",409);
  } else if(proposal.action==="save_research") {
   const data=await readOperationalIntelligence(tenant,proposal.locator!);
   if(!data.researchAccess||data.intelligence.identity.humanReviewRequired||JSON.stringify(data.relationship.refs)!==JSON.stringify(proposal.refs))throw new AccessError("Research destination changed; review again.",409);
  }
 }
 if((proposal.action==="create"&&proposal.table==="founder_research_records")||proposal.action==="save_research") {
  const current=await requireFounderIntelligence(tenant.organisationId);
  if(current.userId!==tenant.userId||current.organisationId!==tenant.organisationId)throw new AccessError("Protected review unavailable.");
 }
 const {data,error}=await supabaseAdmin.rpc("commit_reviewed_relationship_decision",{p_org:tenant.organisationId,p_actor:tenant.userId,p_key:proposal.key,p_snapshot:proposal.snapshot,p_payload:JSON.parse(JSON.stringify(payload))});
 if(error||!data)throw new AccessError("Review was not confirmed. Retry the same receipt or reload and review again.",409);
 const result=object(data),locator=result.workspaceId?`workspace_${result.workspaceId}`:proposal.locator;
 const canonical=locator?await readOperationalIntelligence(tenant,locator):null;
 return {...result,canonical,destination:locator?`/dashboard/growth/relationships/${locator}?organisationId=${encodeURIComponent(tenant.organisationId)}`:null};
}
export const reviewRequestKey=(value:unknown)=>typeof value==="string"&&uuid.test(value)?value:randomUUID();
