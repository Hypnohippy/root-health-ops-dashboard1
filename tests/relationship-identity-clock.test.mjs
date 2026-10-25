import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTruthModule } from './relationship-truth-loader.mjs';
const m=loadTruthModule('lib/relationshipIdentityReconciliation.ts');
const policy={organisationId:'tenant-a',founderAllowed:false,asOf:'2026-10-24T10:15:09.476Z'};
function fixture(offset=0) {
 const input=m.syntheticIdentityReviewInput(policy.organisationId);
 const candidate=m.reconciliationCandidates(input,policy).candidates[0];
 const decision=m.hypotheticalDecision(candidate,'keep_separate',{organisationId:policy.organisationId,userId:'reviewer'},policy.asOf,
  {id:'hypothetical:clock-fixture',revision:1,confirmed:true,candidateRevision:candidate.revision,evidenceIdsShown:candidate.evidenceIds});
 return {input,decision:{...decision,id:'identity_decision:clock-fixture',simulation:false,authority:'persisted',decidedAt:new Date(Date.parse(policy.asOf)+offset).toISOString()}};
}
for(const [label,offset] of [['same timestamp',0],['small past',-1],['observed failure skew',667],['observed clock-probe skew',808],['just inside bound',1999],['exact bound',2000]]) {
 test('persisted KEEP_SEPARATE accepts '+label,()=>{
  const {input,decision}=fixture(offset),before=JSON.stringify({input,decision});
  const result=m.identityDecisionPartition(input,policy,[decision]);
  assert.equal(result.groups.length,2);assert.equal(result.activeDecisions[0].decision,'keep_separate');
  assert.equal(JSON.stringify({input,decision}),before);
 });
}
for(const [label,offset] of [['just outside bound',2001],['materially future',86_400_000]]) {
 test('persisted KEEP_SEPARATE rejects '+label,()=>{
  const {input,decision}=fixture(offset);assert.throws(()=>m.identityDecisionPartition(input,policy,[decision]),/Invalid identity decision/);
 });
}
test('hypothetical decisions receive no clock-skew allowance',()=>{
 const {input,decision}=fixture(1);assert.throws(()=>m.identityDecisionPartition(input,policy,[{...decision,simulation:true,authority:undefined}]),/Invalid identity decision/);
});
test('an untrusted persisted claim cannot opt into the allowance',()=>{
 const {input,decision}=fixture(808);assert.throws(()=>m.identityDecisionPartition(input,policy,[{...decision,authority:undefined}]),/Invalid identity decision/);
});
test('invalid decision and read timestamps fail closed',()=>{
 const {input,decision}=fixture();
 assert.throws(()=>m.identityDecisionPartition(input,policy,[{...decision,decidedAt:'invalid'}]),/Invalid identity decision/);
 assert.throws(()=>m.identityDecisionPartition(input,{...policy,asOf:'invalid'},[decision]),/Invalid identity decision/);
});
test('the clock bound cannot bypass tenant, actor or evidence requirements',()=>{
 const {input,decision}=fixture(808);
 for(const fields of [{organisationId:'foreign'},{actorUserId:''},{evidenceIdsShown:[]},{revision:0}]) {
  assert.throws(()=>m.identityDecisionPartition(input,policy,[{...decision,...fields}]),/Invalid identity decision/);
 }
});
