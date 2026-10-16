/** Whole-inventory local replay. Reads only a body-free SELECT export; no Production client. */
import fs from 'node:fs';
import {loadTruthModule} from '../tests/relationship-truth-loader.mjs';
const [snapshotPath,outputPath,asOf,hitsPath,probesPath,manifestPath,identityMode,decisionPath]=process.argv.slice(2);
if(identityMode&&!['--identity-shadow','--human-shadow'].includes(identityMode))throw Error('Unsupported isolated shadow mode');
if(!snapshotPath||!outputPath||!Number.isFinite(Date.parse(asOf)))throw Error('Usage: snapshot output asOf [source-token-hits.json] [probe-output.json]');
const snapshot=JSON.parse(fs.readFileSync(snapshotPath,'utf8'));
const org='78fa2ac8-e7b6-4b9b-9604-035723ece6b1';
const raw={inbox_items:snapshot.inbox_items,growth_targets:snapshot.growth_targets,acquisition_items:snapshot.acquisition_items};
const tables=['inbox_items','growth_targets','acquisition_items'];
const db={from(table){let rows=snapshot[table];if(!Array.isArray(rows))throw Error('Uncaptured source '+table);const q={select(){return q;},eq(k,v){rows=rows.filter(r=>r[k]===v);return q;},in(k,v){rows=rows.filter(r=>v.includes(r[k]));return q;},order(){return q;},range(a,b){return Promise.resolve({data:structuredClone(rows.slice(a,b+1)),error:null});}};return new Proxy(q,{get(t,k){if(k in t)return t[k];throw Error('Read-only replay prohibits '+String(k));}});}};
const {readLifecycleInput}=loadTruthModule('lib/lifecycleSnapshot.server.ts',{'@/lib/supabaseAdmin':{supabaseAdmin:db}});
const projected=await readLifecycleInput(org,true);
const {lifecycleLinkedInIdentity}=loadTruthModule('lib/contactLifecycle.ts');
const {projectRelationships,matchingWorkspace}=loadTruthModule('lib/relationshipWorkspace.ts');
const {listRelationships}=loadTruthModule('lib/relationshipWorkspace.server.ts',{'@/lib/supabaseAdmin':{supabaseAdmin:db},'@/lib/founderIntelligenceAuth.server':{requireFounderIntelligence(){throw Error('No live auth');}},'@/lib/tenantAuth':{AccessError:Error},'@/lib/lifecycleSnapshot.server':{readLifecycleInput(){throw Error('Unexpected read');}},'@/lib/opsSearch.server':{readTenantHistory(){throw Error('Unexpected read');}}});
const {relationshipTruth}=loadTruthModule('lib/relationshipTruth.ts');
const {externalSentAt,sendReceipts}=loadTruthModule('lib/linkedinSendEvidence.ts');
const {cadenceDays,legacyCadenceStages}=loadTruthModule('lib/growthOutreach.ts');
const parity=loadTruthModule('lib/relationshipTruthParity.ts');
const policy={organisationId:org,founderAllowed:true,asOf,partialSources:['mailbox completeness not established; body-free replay']};
const input={lifecycle:raw,founder:snapshot.founder_research_records,founderActivities:snapshot.founder_activity_events,emailMessages:snapshot.email_conversation_messages,linkedinMessages:snapshot.linkedin_conversation_messages,workspaces:snapshot.relationship_workspaces,links:snapshot.relationship_source_links,activities:snapshot.relationship_activity_events,tasks:snapshot.relationship_tasks,acquisitionEvents:snapshot.acquisition_item_events,responseEvents:snapshot.response_item_events};
const identity=identityMode==='--identity-shadow'?loadTruthModule('lib/relationshipIdentityEvidence.ts'):null;
const identityPlan=identity?.prepareIdentityShadow(input,policy);
const human=identityMode==='--human-shadow'?loadTruthModule('lib/relationshipIdentityReconciliation.ts'):null;
const decisions=human?JSON.parse(fs.readFileSync(decisionPath,'utf8')):[];
const humanPlan=human?.identityDecisionPartition(input,policy,decisions);
const projectTruth=anchor=>human?human.truthWithIdentityDecisions(input,anchor,policy,decisions,humanPlan):identity?identity.relationshipTruthIdentityShadow(input,anchor,policy,identityPlan).truth:relationshipTruth(input,anchor,policy);

const current=projectRelationships(org,projected,input.founder);
const ctx={tenant:{organisationId:org,userId:'owner-audit',role:'owner'},input:projected,founder:input.founder,canFounder:true,items:current,workspaces:input.workspaces,links:input.links,models:[],values:[],storageAvailable:true};
const refs=new Map([...tables.flatMap(t=>raw[t].map(r=>[t+':'+r.id,r])),...input.founder.map(r=>['founder_research_records:'+r.id,r])]);

const tokenHits=hitsPath?JSON.parse(fs.readFileSync(hitsPath,'utf8')):null;
const tokenSets=new Map(Object.entries(tokenHits||{}).map(([k,v])=>[k,new Set(v)]));
const shadowBySource=new Map(),groups=new Map(),errors=[],overlaps=[];
let computed=0;
for(const [source,row] of refs){
 if(shadowBySource.has(source))continue;
 const table=source.slice(0,source.indexOf(':'));
 try{
  const truth=projectTruth({table,id:row.id}),signature=truth.sourceRecords.map(parity.refKey).sort().join('|');
  if(!groups.has(signature))groups.set(signature,truth);
  for(const ref of truth.sourceRecords){const k=parity.refKey(ref);if(shadowBySource.has(k)&&shadowBySource.get(k)!==signature)overlaps.push(k);else shadowBySource.set(k,signature);}
  computed++;if(computed%200===0)console.error('Shadow groups evaluated: '+computed);
 }catch(e){errors.push({source,error:e.message});}
}
const allTokens=new Set(),results=[],unavailable=[];
const currentGroupMap=new Map(),splitPairs=new Set(),refused=new Set(),splits=new Set();
const termHits=(r,q)=>{
 const terms=q.trim().normalize('NFKC').toLowerCase().split(/\s+/);
 const header=[r.name,r.company,r.role].filter(Boolean).join(' ').normalize('NFKC').toLowerCase();
 return terms.every(t=>header.includes(t)||r.refs.some(ref=>tokenSets.get(parity.refKey(ref))?.has(t)));
};
for(const r of current){
 const candidates=r.refs.map(ref=>shadowBySource.get(parity.refKey(ref))).filter(Boolean);
 const signatures=[...new Set(candidates)];
 if(signatures.length>1)splits.add(r.locator);
 const sourceKeys=r.refs.map(parity.refKey).sort();
 if(!signatures.some(sig=>sourceKeys.every(k=>sig.split('|').includes(k))))refused.add(r.locator);
 for(let i=0;i<sourceKeys.length;i++)for(let j=i+1;j<sourceKeys.length;j++)if(shadowBySource.get(sourceKeys[i])&&shadowBySource.get(sourceKeys[j])&&shadowBySource.get(sourceKeys[i])!==shadowBySource.get(sourceKeys[j]))splitPairs.add([sourceKeys[i],sourceKeys[j]].sort().join('|'));
 if(!signatures.length){unavailable.push({id:r.locator,refs:sourceKeys,reason:'No safe persisted shadow anchor'});continue;}
 // Compare each legacy inventory row once, against its displayed source anchor; retain every split separately.
 const primary=r.refs.find(ref=>r.locator.endsWith(ref.id)&&shadowBySource.has(parity.refKey(ref)))||r.refs.find(ref=>shadowBySource.has(parity.refKey(ref)));
 const truth=groups.get(shadowBySource.get(parity.refKey(primary)));
 if(!truth){unavailable.push({id:r.locator,refs:sourceKeys,reason:'Displayed anchor unavailable'});continue;}
 const rows=r.refs.map(ref=>refs.get(parity.refKey(ref))).filter(Boolean);
 let canonical=null;try{const [tenant,identity]=JSON.parse(r.contactId||'[]');if(tenant===org&&identity?.startsWith('linkedin:'))canonical=lifecycleLinkedInIdentity(identity.slice(9));}catch{/* Unestablished identity remains unknown. */}
 let conflict=false;try{matchingWorkspace(r.refs,input.links);}catch{conflict=true;}
 const view={id:r.locator,refs:sourceKeys,kind:r.kind,linkedin:canonical?[canonical]:[],emails:parity.reviewVerifiedEmails(rows),name:r.name==='Identity not established'?null:r.name,company:r.company,stage:r.stage,actionable:parity.currentActionable(r.stage,r.nextDueDate,asOf),nextAction:r.nextAction,due:r.nextDueDate,ambiguity:conflict?['workspace_conflict']:[],gaps:[],nameProbes:r.name&&!/^(Identity not established|Stored research)$/.test(r.name)?[r.name]:[],companyProbes:r.company?[r.company]:[],emailProbes:parity.reviewVerifiedEmails(rows),linkedinProbes:canonical?[canonical]:[],evidenceIds:sourceKeys,uncertainDisplay:false};
 const shadow=parity.shadowParityView(truth);
 view.confirmedAnchorEvidenceIds=rows.filter(row=>externalSentAt(row.linkedin_cadence_anchor,Date.parse(asOf))).map(row=>r.refs.find(ref=>ref.id===row.id)).filter(Boolean).map(parity.refKey);
 const rawMembers=truth.sourceRecords.map(ref=>refs.get(parity.refKey(ref))).filter(Boolean);
 const first=rawMembers.flatMap(row=>sendReceipts(row.manual_completion)).filter(receipt=>!receipt.stage||receipt.stage==='connection').map(receipt=>externalSentAt(receipt,Date.parse(asOf))).filter(Boolean).sort()[0];
 const instant=value=>value&&Number.isFinite(Date.parse(String(value)))?Date.parse(String(value)):null;
 view.timingEquivalent=truth.contradictions.some(c=>c.code==='followup_timing_disputed')&&!rawMembers.some(row=>{
  const stage=legacyCadenceStages[row.stage]||row.stage;
  return first&&cadenceDays[stage]&&((instant(row.first_outbound_at)!==null&&instant(row.first_outbound_at)!==instant(first))||(!row.manual_completion&&!row.linkedin_cadence_anchor&&instant(row.last_action_at)!==null&&instant(row.last_action_at)!==instant(first)));
 });
 view.evidenceIds=parity.uniqueStrings([...view.evidenceIds,...view.confirmedAnchorEvidenceIds]);
 for(const q of [...view.nameProbes,...view.companyProbes,...view.emailProbes,...view.linkedinProbes,...shadow.nameProbes,...shadow.companyProbes,...shadow.emailProbes,...shadow.linkedinProbes].filter(q=>q.length<=200))for(const term of q.trim().normalize('NFKC').toLowerCase().split(/\s+/))allTokens.add(term);
 const comparison=parity.compareInventoryParity(view,truth,q=>tokenHits?termHits(r,q):false);
 if(!tokenHits){comparison.checks=comparison.checks.filter(c=>!c.field.startsWith('discoverability_'));comparison.differences=comparison.differences.filter(c=>!c.field.startsWith('discoverability_'));comparison.newDiscovery=false;}
 results.push({...comparison,anchor:truth.anchor,shadowGroup:shadowBySource.get(parity.refKey(primary)),allShadowGroups:signatures,shadowIssues:{contradictions:truth.contradictions.map(i=>i.code),gaps:truth.missingEvidence.map(i=>i.code)}});
 for(const ref of r.refs){const k=parity.refKey(ref),set=currentGroupMap.get(k)||new Set();set.add(r.locator);currentGroupMap.set(k,set);}
}
if(probesPath)fs.writeFileSync(probesPath,JSON.stringify([...allTokens].sort()));
const mergedCandidates=[...groups.values()].filter(t=>new Set(t.sourceRecords.flatMap(ref=>[...(currentGroupMap.get(parity.refKey(ref))||[])])).size>1).map(t=>t.relationshipId);
const summary=parity.summarizeInventoryParity(results);
const identityMetrics=parity.identityParityMetrics(current.map(r=>({id:r.locator,refs:r.refs.map(parity.refKey)})),[...groups.values()].map(t=>({id:t.relationshipId,refs:t.sourceRecords.map(parity.refKey)})));
if(identityMetrics.identitySplitCount!==splits.size||identityMetrics.ambiguousJoinPairsWithheld!==splitPairs.size||identityMetrics.currentRelationshipsShadowRefusesToAssociate!==refused.size)throw Error('Identity metric cross-check failed');
// Deduplicate discovery gains across the entire current inventory, not only one legacy row.
const globalDiscoveryRecords=new Set(),globalDiscoveryGroups=new Set();
if(tokenHits)for(const result of results){
 for(const difference of result.differences.filter(d=>d.field.startsWith('discoverability_'))){
  for(const probe of difference.shadow){
   if(probe.found&&!current.some(r=>r.refs.some(ref=>result.shadowRefs.includes(parity.refKey(ref)))&&termHits(r,probe.query))){result.shadowRefs.forEach(ref=>globalDiscoveryRecords.add(ref));globalDiscoveryGroups.add(result.shadowGroup);}
  }
 }
}
const founderContactCoverage=input.founder.flatMap(f=>(f.contacts||[]).filter(c=>c.emailStatus==='verified'&&c.directEmail).map(c=>({founderId:f.id,hasOperationalPerson:[...groups.values()].some(t=>t.entityKind==='person'&&t.verifiedAliases.some(a=>a.value.type==='email'&&a.value.value===c.directEmail.toLowerCase()))})));
// Verify the real list implementation across every page (not just the first 25).
let listed=0,listTotal=null;for(let page=0;;page++){const result=listRelationships(ctx,'','all',page);if(listTotal===null)listTotal=result.total;listed+=result.items.length;if(listed>=result.total||!result.items.length)break;}
// Calibrate our source-token search adapter against real listRelationships on a deterministic sample.
const calibrations=[];
const surrogateRows=(rows,table)=>rows.map(row=>parity.sourceSearchSurrogate(row,tokenHits?.[table+':'+row.id]||[]));
const searchCtx=tokenHits?{...ctx,input:Object.fromEntries(tables.map(t=>[t,surrogateRows(projected[t],t)])),founder:surrogateRows(input.founder,'founder_research_records')}:ctx;
if(tokenHits){for(const r of current.filter((_,i)=>i%Math.max(1,Math.floor(current.length/12))===0).slice(0,12)){
 const q=r.name||r.company;if(!q||q.length>200)continue;
 const expected=current.filter(c=>termHits(c,q)).map(c=>{let w;try{w=matchingWorkspace(c.refs,input.links);}catch{/* surfaced by baseline conflict */}return w?'workspace_'+w:c.locator;}).sort();
 const actual=[];for(let page=0;;page++){const result=listRelationships(searchCtx,q,'all',page);actual.push(...result.items.map(i=>i.locator));if(actual.length>=result.total||!result.items.length)break;}
 calibrations.push({queryRecord:r.locator,matches:JSON.stringify(expected)===JSON.stringify(actual.sort()),expected:expected.length,actual:actual.length});
}}
const manifest=manifestPath?JSON.parse(fs.readFileSync(manifestPath,'utf8')):null;
if(manifest&&(Date.parse(manifest.capturedAt)!==Date.parse(asOf)||[...allTokens].some(t=>!manifest.terms.includes(t))))throw Error('Snapshot timestamp or search probe coverage mismatch');
const output={captureManifestVerified:!!manifest,asOf,scope:'Whole captured tenant inventory; no mailbox import; no consumer changed; body-free metadata and SQL search-token hits.',sourceRows:Object.fromEntries(Object.entries(snapshot).map(([k,v])=>[k,v.length])),currentInventoryCount:current.length,shadowGroupCount:groups.size,persistedSourceCount:refs.size,listInventory:{total:listTotal,listed},summary:{...summary,...identityMetrics,newlyDiscoverableRecordCount:globalDiscoveryRecords.size,newlyDiscoverableRelationshipCount:globalDiscoveryGroups.size,proposedShadowJoinCount:mergedCandidates.length,shadowOverlappingMembershipCount:new Set(overlaps).size,unprojectedVerifiedFounderContacts:founderContactCoverage.filter(c=>!c.hasOperationalPerson).length},coverage:{tokenSearchCaptured:!!tokenHits,uniqueSearchTerms:allTokens.size,calibrations,unsafeOrUnavailable:unavailable,errors},results};
fs.writeFileSync(outputPath,JSON.stringify(output,null,2));
console.log(JSON.stringify({...output,results:undefined},null,2));
