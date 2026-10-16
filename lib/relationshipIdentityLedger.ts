import type {TruthInput,TruthPolicy,TruthRef} from '@/lib/relationshipTruth';
import {identityDecisionPartition,truthWithIdentityDecisions,type RelationshipIdentityDecision,type IdentityAlias,type IdentityDecisionChoice} from '@/lib/relationshipIdentityReconciliation';
export type IdentityLedgerRow={id:string;organisation_id:string;source_ref_a:TruthRef;source_ref_b:TruthRef;decision:IdentityDecisionChoice;reviewed_evidence_ids:string[];evidence_summary:string;actor_user_id:string;created_at:string;decided_at:string;revision:number;note:string|null;supersedes_decision_id:string|null;candidate_revision:string;alias_bindings:{a:IdentityAlias[];b:IdentityAlias[]};founder_only:boolean;idempotency_key:string;sequence?:number};
export function ledgerDecisions(rows:IdentityLedgerRow[],policy:TruthPolicy):RelationshipIdentityDecision[]{
 return rows.filter(r=>r.organisation_id===policy.organisationId&&(!r.founder_only||policy.founderAllowed)).map(r=>({schemaVersion:1,id:`identity_decision:${r.id}`,organisationId:r.organisation_id,sourceRefA:r.source_ref_a,sourceRefB:r.source_ref_b,decision:r.decision,evidenceIdsShown:r.reviewed_evidence_ids,evidenceSummary:r.evidence_summary,actorUserId:r.actor_user_id,decidedAt:r.decided_at,note:r.note,revision:r.revision,candidateRevision:r.candidate_revision,aliasBindings:r.alias_bindings,simulation:false,authority:'persisted'}));
}
/** Only shadow evaluation imports this adapter. No live consumer or data writer. */
export function relationshipTruthWithLedger(input:TruthInput,anchor:TruthRef,policy:TruthPolicy,rows:IdentityLedgerRow[]){
 const decisions=ledgerDecisions(rows,policy),partition=identityDecisionPartition(input,policy,decisions);
 const truth=truthWithIdentityDecisions(input,anchor,policy,decisions,partition);
 const refs=new Set(truth.sourceRecords.map(r=>r.table+':'+r.id));
 for(const row of rows.filter(r=>r.organisation_id===policy.organisationId&&(!r.founder_only||policy.founderAllowed)&&(refs.has(r.source_ref_a.table+':'+r.source_ref_a.id)||refs.has(r.source_ref_b.table+':'+r.source_ref_b.id))))truth.evidenceTimeline.push({id:'identity_decision:'+row.id,source:{table:'relationship_identity_decisions',id:row.id},kind:'identity_decision',channel:'Ops',direction:null,at:row.decided_at,recordedAt:row.created_at,bodyAvailable:false,thread:null});
 truth.evidenceTimeline.sort((a,b)=>String(a.at||a.recordedAt).localeCompare(String(b.at||b.recordedAt))||a.id.localeCompare(b.id));
 return truth;
}
export function ledgerStatus(rows:IdentityLedgerRow[],a:TruthRef,b:TruthRef){const key=(r:TruthRef)=>r.table+':'+r.id;const pair=[key(a),key(b)].sort().join('|');return rows.filter(r=>[key(r.source_ref_a),key(r.source_ref_b)].sort().join('|')===pair).sort((a,b)=>b.revision-a.revision);}
