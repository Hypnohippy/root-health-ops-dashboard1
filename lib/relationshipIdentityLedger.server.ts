import {supabaseAdmin} from '@/lib/supabaseAdmin';
import {AccessError} from '@/lib/tenantAuth';
import {founderAllowed,type RelationshipTenant} from '@/lib/relationshipWorkspace.server';
import {readTenantHistory} from '@/lib/opsSearch.server';
import {readIdentityReview,identityReviewPayload,requireIdentityReviewer,type IdentityPreviewRequest} from '@/lib/relationshipIdentityReconciliation.server';
import {hypotheticalDecision,identityDecisionPartition,truthWithIdentityDecisions} from '@/lib/relationshipIdentityReconciliation';
import {ledgerDecisions,ledgerStatus,type IdentityLedgerRow} from '@/lib/relationshipIdentityLedger';
import {relationshipEntityShape} from '@/lib/relationshipEntityShape';
export const identityPersistenceEnabled=()=>process.env.IDENTITY_RECONCILIATION_ENABLED==='true';
const pair=(a:{table:string;id:string},b:{table:string;id:string})=>[a.table+':'+a.id,b.table+':'+b.id].sort().join('|');
export async function identityLedgerReview(tenant:RelationshipTenant,example=false){
 requireIdentityReviewer(tenant);const ctx=await readIdentityReview(tenant,undefined,example);
 const capturedRows=identityPersistenceEnabled()&&!example?await readTenantHistory('relationship_identity_decisions',tenant.organisationId,'*',['sequence']) as IdentityLedgerRow[]:[];
 const rows=capturedRows.filter(r=>r.organisation_id===tenant.organisationId);
 const visible=rows.filter(r=>r.organisation_id===tenant.organisationId&&(!r.founder_only||ctx.policy.founderAllowed)&&ctx.partition.byRef.has(r.source_ref_a.table+':'+r.source_ref_a.id)&&ctx.partition.byRef.has(r.source_ref_b.table+':'+r.source_ref_b.id));
 const history=visible.map(r=>({id:r.id,pair:pair(r.source_ref_a,r.source_ref_b),decision:r.decision,actor:r.actor_user_id,decidedAt:r.decided_at,revision:r.revision,note:r.note,supersedes:r.supersedes_decision_id,illustrative:false}));
 if(example&&ctx.candidates[0])history.push({id:'fictional-history-example',pair:ctx.candidates[0].id,decision:'review_later',actor:'Fictional reviewer',decidedAt:'2026-10-16T12:00:00Z',revision:1,note:'Illustrative history only — no saved decision.',supersedes:null,illustrative:true});
 return {ctx,rows,visible,payload:{...identityReviewPayload(ctx),simulation:!identityPersistenceEnabled()||example,persistenceEnabled:identityPersistenceEnabled()&&!example,history}};
}
/** Single explicit append only. The gate is checked before any source/ledger read. */
export async function saveIdentityDecision(tenant:RelationshipTenant,req:IdentityPreviewRequest&{previousDecisionId:string|null}){
 requireIdentityReviewer(tenant);if(!identityPersistenceEnabled())throw new AccessError('Identity reconciliation is not activated. Rehearsal remains available.',403);
 if(!req||!/^[a-f0-9-]{36}$/i.test(req.requestId)||typeof req.confirmed!=='boolean'||!req.confirmed||req.note!==undefined&&typeof req.note!=='string')throw new AccessError('Explicit confirmation is required for a recorded decision.',400);
 const refs=typeof req.candidateId==='string'?req.candidateId.split('|').map(k=>{const [table,id]=k.split(':');return {table,id};}):[];
 if(refs.length!==2||refs.some(r=>!['inbox_items','growth_targets','acquisition_items','founder_research_records'].includes(r.table)||!/^[a-f0-9-]{36}$/i.test(r.id||'')))throw new AccessError('Invalid source pair.',400);
 const founderPermission=refs.some(r=>r.table==='founder_research_records')?await founderAllowed(tenant.organisationId):false;
 const versionRead=await supabaseAdmin.rpc('identity_decision_source_versions',{p_org:tenant.organisationId,p_actor:tenant.userId,p_a:refs[0],p_b:refs[1],p_founder:founderPermission});
 if(versionRead.error||!versionRead.data)throw new AccessError('Review evidence unavailable.',409);
 const {ctx,rows,visible}=await identityLedgerReview(tenant);
 const candidate=ctx.candidates.find(c=>c.id===req.candidateId);if(!candidate)throw new AccessError('Review candidate unavailable.',409);
 const history=ledgerStatus(rows,candidate.left.ref,candidate.right.ref),previous=history[0];
 if(previous?.founder_only&&!ctx.policy.founderAllowed)throw new AccessError('Review candidate unavailable.',403);
 const receipt=rows.find(r=>r.idempotency_key===req.requestId);
 if(receipt){if(receipt.actor_user_id!==tenant.userId||receipt.decision!==req.choice||pair(receipt.source_ref_a,receipt.source_ref_b)!==candidate.id||receipt.candidate_revision!==req.candidateRevision||JSON.stringify([...receipt.reviewed_evidence_ids].sort())!==JSON.stringify([...(req.evidenceIdsShown||[])].sort())||(receipt.note||'')!==(req.note||'').trim())throw new AccessError('Receipt payload differs.',409);return {persisted:true,decision:receipt,operationalAction:'Existing workflows unchanged'};}
 if((previous?.id||null)!==req.previousDecisionId)throw new AccessError('Decision history changed. Refresh before reviewing.',409);
 let proposal;
 try{proposal=hypotheticalDecision(candidate,req.choice,{organisationId:tenant.organisationId,userId:tenant.userId},ctx.policy.asOf,{id:'hypothetical:'+req.requestId,revision:(previous?.revision||0)+1,confirmed:true,candidateRevision:req.candidateRevision,evidenceIdsShown:req.evidenceIdsShown,note:req.note});}catch{throw new AccessError('Evidence or eligibility changed. Refresh before reviewing.',409);}
 const existing=ledgerDecisions(visible,ctx.policy);
 try{
  const decisions=[...existing,proposal],partition=identityDecisionPartition(ctx.input,ctx.policy,decisions);
  if(proposal.decision==='same_relationship'){
   const truth=truthWithIdentityDecisions(ctx.input,proposal.sourceRefA,ctx.policy,decisions,partition);
   if(relationshipEntityShape(truth).entity_kind==='ambiguous')throw Error('Entity association review required');
  }
 }catch{throw new AccessError('Identity constraints prevent this decision. Keep separate or review later.',409);}
 const ordered=[proposal.sourceRefA,proposal.sourceRefB].sort((a,b)=>(a.table+':'+a.id).localeCompare(b.table+':'+b.id));
 const reversed=ordered[0].id!==proposal.sourceRefA.id||ordered[0].table!==proposal.sourceRefA.table;
 const privateDecision=!!previous?.founder_only||candidate.evidenceIds.some(id=>id.startsWith('founder_'))||[candidate.left,candidate.right].some(s=>s.ref.table==='founder_research_records');
 if(privateDecision&&!ctx.policy.founderAllowed)throw new AccessError('Review candidate unavailable.',403);
 const {data,error}=await supabaseAdmin.rpc('append_relationship_identity_decision',{p_org:tenant.organisationId,p_actor:tenant.userId,p_a:ordered[0],p_b:ordered[1],p_decision:proposal.decision,p_evidence:proposal.evidenceIdsShown,p_summary:proposal.evidenceSummary,p_candidate:proposal.candidateRevision,p_aliases:reversed?{a:proposal.aliasBindings.b,b:proposal.aliasBindings.a}:proposal.aliasBindings,p_note:proposal.note,p_request:req.requestId,p_expected_head:rows.at(-1)?.id||null,p_previous:previous?.id||null,p_versions:versionRead.data,p_founder:privateDecision});
 if(error||!data)throw new AccessError('Decision was not confirmed. Refresh and retry with the same receipt.',409);
 return {persisted:true,decision:data as IdentityLedgerRow,operationalAction:'Existing workflows unchanged'};
}
