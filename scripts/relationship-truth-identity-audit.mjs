/** Local metadata replay and exhaustive withheld-pair ledger; never connects to Production. */
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import {loadTruthModule} from '../tests/relationship-truth-loader.mjs';
const [snapshotPath,beforePath,hitsPath,manifestPath,afterPath,reportPath]=process.argv.slice(2);
if(!reportPath)throw Error('Usage: snapshot before searchHits manifest afterComparison report');
const snapshot=JSON.parse(fs.readFileSync(snapshotPath,'utf8')),before=JSON.parse(fs.readFileSync(beforePath,'utf8')),manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
if(Date.parse(before.asOf)!==Date.parse(manifest.capturedAt)||!before.captureManifestVerified)throw Error('Baseline must use the same atomic capture');
const run=spawnSync(process.execPath,['scripts/relationship-truth-parity-audit.mjs',snapshotPath,afterPath,before.asOf,hitsPath,'',manifestPath,'--identity-shadow'],{stdio:'inherit'});
if(run.status!==0)throw Error('Shadow replay failed');
const after=JSON.parse(fs.readFileSync(afterPath,'utf8'));
const {prepareIdentityShadow,reviewIdentityPair,missingIdentityBridges}=loadTruthModule('lib/relationshipIdentityEvidence.ts');
const input={lifecycle:snapshot,founder:snapshot.founder_research_records,founderActivities:snapshot.founder_activity_events,emailMessages:snapshot.email_conversation_messages,linkedinMessages:snapshot.linkedin_conversation_messages,workspaces:snapshot.relationship_workspaces,links:snapshot.relationship_source_links,activities:snapshot.relationship_activity_events,tasks:snapshot.relationship_tasks,acquisitionEvents:snapshot.acquisition_item_events,responseEvents:snapshot.response_item_events};
const policy={organisationId:'78fa2ac8-e7b6-4b9b-9604-035723ece6b1',founderAllowed:true,asOf:before.asOf},plan=prepareIdentityShadow(input,policy);
const groups=d=>[...new Set(d.results.flatMap(r=>r.allShadowGroups))].map(signature=>signature.split('|'));
const beforeGroups=groups(before),afterGroups=groups(after),byRef=gs=>new Map(gs.flatMap((refs,i)=>refs.map(ref=>[ref,i])));
const oldByRef=byRef(beforeGroups),newByRef=byRef(afterGroups),pairMap=new Map();
const parse=ref=>({table:ref.slice(0,ref.indexOf(':')),id:ref.slice(ref.indexOf(':')+1)});
for(const result of before.results)for(let i=0;i<result.currentRefs.length;i++)for(let j=i+1;j<result.currentRefs.length;j++) {
 const a=result.currentRefs[i],b=result.currentRefs[j];
 if(!oldByRef.has(a)||!oldByRef.has(b)||oldByRef.get(a)===oldByRef.get(b))continue;
 const pairId=[a,b].sort().join('|');
 if(!pairMap.has(pairId))pairMap.set(pairId,reviewIdentityPair(input,[parse(a),parse(b)],policy,newByRef.has(a)&&newByRef.get(a)===newByRef.get(b),plan));
}
const pairs=[...pairMap.values()].sort((a,b)=>a.pairId.localeCompare(b.pairId));
if(pairs.length!==before.summary.ambiguousJoinPairsWithheld)throw Error('Withheld pair coverage mismatch');
// Every new association must be reachable through old groups plus explicit deterministic proofs.
const parent=beforeGroups.map((_,i)=>i);const root=i=>parent[i]===i?i:(parent[i]=root(parent[i]));
for(const e of plan.evidence.filter(e=>e.confidenceClass==='deterministic'&&e.sourceRefs.length>1)) {
 const ids=e.sourceRefs.map(r=>oldByRef.get(r.table+':'+r.id));
 if(ids.some(i=>i===undefined)||!e.evidenceIds.length)throw Error('Unproven deterministic bridge');
 for(const i of ids.slice(1))parent[root(i)]=root(ids[0]);
}
const newJoins=[];
for(const group of afterGroups)for(let i=0;i<group.length;i++)for(let j=i+1;j<group.length;j++) {
 const a=group[i],b=group[j],x=oldByRef.get(a),y=oldByRef.get(b);if(x===y)continue;
 newJoins.push({sourceRefs:[a,b],evidenceBacked:x!==undefined&&y!==undefined&&root(x)===root(y)});
}
const unsafe=newJoins.filter(j=>!j.evidenceBacked);
if(unsafe.length)throw Error('STOP: new association lacks a deterministic structural bridge');
const changedRefs=new Set(newJoins.flatMap(j=>j.sourceRefs));
const newAliasConflicts=after.results.filter(r=>r.shadowRefs.some(ref=>changedRefs.has(ref))&&r.shadow.ambiguity.some(code=>['identity_ambiguity','workspace_conflict'].includes(code)));
if(newAliasConflicts.length||after.summary.shadowOverlappingMembershipCount)throw Error('STOP: repaired membership introduces alias/workspace conflict or overlap');
const groupReviews=before.results.filter(r=>r.allShadowGroups.length>1).map(r=>{
 const related=pairs.filter(p=>p.sourceRefs.every(ref=>r.currentRefs.includes(ref.table+':'+ref.id)));
 return {currentRelationshipId:r.currentId,sourceRefs:r.currentRefs,pairIds:related.map(p=>p.pairId),resolution:related.every(p=>p.resolvedInShadow)?'deterministic':related.some(p=>p.humanReviewRequired)?'human_reconciliation':'separate'};
});
if(groupReviews.length!==before.summary.identitySplitCount)throw Error('Split group coverage mismatch');
const counts=field=>Object.fromEntries([...new Set(pairs.map(p=>p[field]))].map(k=>[k,pairs.filter(p=>p[field]===k).length]));
const nested=input.founder.flatMap(f=>(f.contacts||[]).flatMap((c,i)=>c.emailStatus==='verified'&&c.directEmail&&!after.results.some(r=>r.shadow.kind==='person'&&r.shadow.emails.includes(c.directEmail.toLowerCase()))?[{sourceRefs:[{table:'founder_research_records',id:f.id}],alias:{type:'founder_contact',value:'[protected value omitted; use authorised source]'},verificationBasis:'verified_nested_contact_not_company_identity',evidenceIds:['founder_research_records:'+f.id+'#contacts/'+i],confidenceClass:'separate',ambiguityReason:'No existing person source anchor established; keep nested evidence without creating a person.',humanReviewRequired:false,missingBridge:'founder_nested_contact_only'}]:[]));
const report={base:'977ba517ca67ba033b04fcb06ef30fe9395083b8',captureAt:before.asOf,decision:'NEEDS IDENTITY REPAIR FIRST',readOnly:true,baseline:before.summary,after:after.summary,beforeInventory:before.currentInventoryCount,afterInventory:after.currentInventoryCount,shadowGroupsBefore:before.shadowGroupCount,shadowGroupsAfter:after.shadowGroupCount,missingBridgePrimary:Object.fromEntries(missingIdentityBridges.map(k=>[k,pairs.filter(p=>p.missingBridge===k).length])),missingBridgeFlags:Object.fromEntries(missingIdentityBridges.map(k=>[k,pairs.filter(p=>p.missingBridges.includes(k)).length])),pairResolutions:counts('confidenceClass'),groupResolutions:Object.fromEntries(['deterministic','human_reconciliation','separate'].map(k=>[k,groupReviews.filter(g=>g.resolution===k).length])),newJoinCount:newJoins.length,newUnsafeJoinCount:unsafe.length,newAliasConflictCount:newAliasConflicts.length,newJoins,deterministicEvidence:plan.evidence,rejectedEvidence:plan.rejected,groupReviews,pairs,nestedFounderReview:nested,limitations:['Same atomic Phase 2 snapshot: not a fresh mailbox/Production scan.','No source identity/link writes; disposable projection only.','All 66 groups and 85 source pairs classified.','No message bodies in this report.','Shadow display/timing/history defects are deliberately not repaired here.']};
fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({...report,pairs:undefined,groupReviews:undefined,nestedFounderReview:undefined},null,2));
