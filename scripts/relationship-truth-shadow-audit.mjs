/** Local, body-free audit runner. Reads an exported SELECT snapshot; cannot connect to Production. */
import fs from 'node:fs';
import {loadTruthModule} from '../tests/relationship-truth-loader.mjs';
const [snapshotPath,outputPath,asOf]=process.argv.slice(2);
if(!snapshotPath||!outputPath||!Number.isFinite(Date.parse(asOf)))throw Error('Usage: snapshot.json output.json asOf');
const snapshot=JSON.parse(fs.readFileSync(snapshotPath,'utf8'));
const org='78fa2ac8-e7b6-4b9b-9604-035723ece6b1';
const now=Date.parse(asOf);
const reads=[];
const db={from(table){if(!Array.isArray(snapshot[table]))throw Error('Uncaptured table '+table);let rows=snapshot[table];const q={select(){return q;},eq(k,v){rows=rows.filter(r=>r[k]===v);return q;},in(k,values){rows=rows.filter(r=>values.includes(r[k]));return q;},order(){return q;},range(a,b){reads.push({table,operation:'select',organisationId:org});return Promise.resolve({data:structuredClone(rows.slice(a,b+1)),error:null});}};return new Proxy(q,{get(target,k){if(k in target)return target[k];throw Error('Non-read database operation prohibited: '+String(k));}});}};
const snapshotReader=loadTruthModule('lib/lifecycleSnapshot.server.ts',{'@/lib/supabaseAdmin':{supabaseAdmin:db}});
const raw=await snapshotReader.readLifecycleInput(org,false);
const projected=await snapshotReader.readLifecycleInput(org,true);
const {relationshipTruth}=loadTruthModule('lib/relationshipTruth.ts');
const {compareRelationshipTruth}=loadTruthModule('lib/relationshipTruthComparison.ts');
const {buildContactLifecycle}=loadTruthModule('lib/contactLifecycle.ts');
const {linkedInOutreachQueue}=loadTruthModule('lib/linkedinOutreach.ts');
const {responseLifecycleMap}=loadTruthModule('lib/responseLifecycle.ts');
const {projectRelationships}=loadTruthModule('lib/relationshipWorkspace.ts');
const {lifecycleDueTargets}=loadTruthModule('lib/growthDue.server.ts',{'@/lib/lifecycleSnapshot.server':{readLifecycleInput(){throw Error('Unexpected read');}}});
const {listRelationships}=loadTruthModule('lib/relationshipWorkspace.server.ts',{
  '@/lib/supabaseAdmin':{supabaseAdmin:db},
  '@/lib/founderIntelligenceAuth.server':{requireFounderIntelligence(){throw Error('No live auth in metadata runner');}},
  '@/lib/tenantAuth':{AccessError:Error},
  '@/lib/lifecycleSnapshot.server':{readLifecycleInput(){throw Error('Unexpected read');}},
  '@/lib/opsSearch.server':{readTenantHistory(){throw Error('Unexpected read');}}
});
const input={lifecycle:raw,founder:snapshot.founder_research_records,founderActivities:snapshot.founder_activity_events,emailMessages:snapshot.email_conversation_messages,linkedinMessages:snapshot.linkedin_conversation_messages,workspaces:snapshot.relationship_workspaces,links:snapshot.relationship_source_links,activities:snapshot.relationship_activity_events,tasks:snapshot.relationship_tasks,acquisitionEvents:snapshot.acquisition_item_events,responseEvents:snapshot.response_item_events};
const contacts=buildContactLifecycle(org,projected,now),queue=linkedInOutreachQueue(org,projected,now,'all',[],10000),responses=responseLifecycleMap(org,projected,now),relationships=projectRelationships(org,projected,input.founder),due=lifecycleDueTargets(org,projected,now);
const ctx={tenant:{organisationId:org,userId:'audit',role:'owner'},input:projected,founder:input.founder,canFounder:true,items:relationships,workspaces:input.workspaces,links:input.links,models:[],values:[],storageAvailable:true};
const cases=[['Tracy','inbox_items','5243a6ec-485e-43fd-86a7-3627aa07cf23'],['Kate','inbox_items','d501ad1f-6679-434d-9909-5ff7592dc8c1'],['Historical LinkedIn / Mathew','inbox_items','e5d9b0bf-559e-4f91-b862-4eb3926d94d9'],['Multi-thread closure / Carole','inbox_items','1721cfdd-2eee-48c4-a3e1-70058a12f1d6'],['Founder nested contact / Simon','inbox_items','352ce7aa-fc70-429a-88e1-fb7f0a69e1a0']];
const results=[];
for(const [name,table,id] of cases){
 const truth=relationshipTruth(input,{table,id},{organisationId:org,founderAllowed:true,asOf,partialSources:['bounded case snapshot; mailbox not queried']});
 const current=contacts.find(c=>c.records.some(r=>r.table===table&&r.id===id));
 const outreach=queue.audit.find(a=>a.records.some(r=>r.table===table&&r.id===id));
 const response=responses.get(id),relationship=relationships.find(r=>r.refs.some(x=>x.table===table&&x.id===id));
 const search=(q)=>listRelationships(ctx,q,'all',0).items.some(r=>r.locator===truth.relationshipId || truth.acceptedLocators.includes(r.locator));
 const baseline={sourceRecords:current?.records.map(r=>r.table+':'+r.id).sort()||[],responseItems:truth.sourceRecords.filter(r=>r.table==='inbox_items').map(r=>({id:r.id,thread:raw.inbox_items.find(i=>i.id===r.id)?.email_thread_id||null,stage:responses.get(r.id)?.currentStage,nextAction:responses.get(r.id)?.nextAction})),lifecycleStage:current?.currentStage,followUpStatus:current?.followUpStatus,nextDueDate:current?.nextDueDate,outreach:{eligible:outreach?.eligibility==='eligible',reason:outreach?.eligibility||'not present'},response:response?{stage:response.currentStage,label:response.label,canDraft:response.canDraft,nextAction:response.nextAction}:null,relationship:relationship?{stage:relationship.stage,name:relationship.name,nextAction:relationship.nextAction}:null,dueTargets:due.filter(r=>truth.sourceRecords.some(ref=>ref.table==='growth_targets'&&ref.id===r.id)).map(r=>r.id),search:{name:search(name==='Tracy'?'Tracy Fountain':name==='Kate'?'Kate Bates':name.includes('Mathew')?'Mathew Pay':name.includes('Carole')?'Carole Spiers':'Simon Rawlings'),email:search(name==='Tracy'?'tracy@leadingwithcompassion.com':name.includes('Simon')?'simon.rawlings@wellbeingatwork.world':name.includes('Carole')?'chair@isma.org.uk':'NO_EMAIL_ESTABLISHED')}};
 const observations=[];
 const observe=(consumer,field,currentValue,shadow,classification,rationale)=>observations.push({consumer,field,current:currentValue,shadow,classification,rationale,evidenceIds:truth.sourceRecords.map(r=>r.table+':'+r.id)});
 observe('lifecycle','structural_source_membership',baseline.sourceRecords,truth.sourceRecords.filter(r=>r.table!=='founder_research_records').map(r=>r.table+':'+r.id).sort(),'identity_ambiguity','Legacy identity grouping includes associations not established by the strict structural alias policy; do not merge or detach automatically.');
 observe('lifecycle','stage',baseline.lifecycleStage,truth.lifecycleStage.value,undefined,'Same existing lifecycle rules over stricter structural association; differing result needs review.');
 const blocked=!['outreach_ready','follow_up'].includes(truth.lifecycleStage.value)||['blocked','needs_text','review'].includes(truth.actionableState.value);
 observe('outreach','must_not_send',!baseline.outreach.eligible,blocked||!!truth.suppressionReasons.length,undefined,'Conservative send suppression is not relaxed by the shadow.');
 observe('responses','relationship_summary_stage',baseline.response?.stage,truth.lifecycleStage.value,'insufficient_evidence','Responses is thread-scoped; contact summary must not automatically override it.');
 observe('relationships','stage',baseline.relationship?.stage,truth.lifecycleStage.value,undefined,'Compare unchanged summary stage only, not whole relationship meaning.');
 if(name==='Kate'){
 observe('relationships','action_certainty',!!baseline.relationship?.nextAction,truth.actionableState.value!=='blocked','shadow_correct_current_output_wrong','Relationship advertises a follow-up action while the actual queue rejects disputed receipt/cadence timing. Suppression is correct; presentation is incomplete.');
 observe('followups','due_without_eligibility_warning',baseline.dueTargets.length>0,truth.dueDate.value!==null,'shadow_correct_current_output_wrong','Due-target output does not expose the confirmed-send timestamp blocker; shadow withholds an undisputed due date.');
 }
 if(name.includes('Mathew'))observe('relationships','historical_send_gap_exposed',false,truth.missingEvidence.some(g=>g.code==='historical_outbound_incomplete'),'historical_evidence_gap','Legacy completion has no verified actual send date; the Follow-up summary does not expose the missing evidence.');
 if(name==='Tracy')observe('relationships','manual_email_route_available_to_discovery',false,truth.evidenceTimeline.some(e=>e.kind==='manual:activity'),'historical_evidence_gap','Manual email history is recorded, but authoritative Gmail messages/verified alias are absent; no automatic linking can settle the gap.');
 if(name.includes('Carole'))observe('relationships','cross_thread_closure_warning',false,truth.contradictions.some(c=>c.code==='cross_thread_closure'),'insufficient_evidence','Old-thread closure and another engaged thread conflict; human review must establish the disposition scope.');
 if(name.includes('Simon')){
 observe('search','verified_email_discoverable',baseline.search.email,truth.verifiedAliases.some(a=>a.value.type==='email'),'shadow_correct_current_output_wrong','Exact stored sender alias is not indexed by current Relationship list search; shadow retains structural email provenance.');
 observe('search','person_name_discoverable',baseline.search.name,truth.relatedFounderContacts.some(c=>c.value.name==='Simon Rawlings'),'shadow_correct_current_output_wrong','Verified nested contact supplies an attributed name to the same exact email, without merging the company entity.');
 observe('relationships','nested_contact_provenance_exposed',false,truth.relatedFounderContacts.length>0,'shadow_correct_current_output_wrong','Company research remains distinct, but permitted exact-contact intelligence is missing from the current person view.');
 }
 results.push({name,truth,baseline,comparison:compareRelationshipTruth(truth,observations)});
}
const counts=Object.fromEntries(['current_output_correct_shadow_wrong','shadow_correct_current_output_wrong','insufficient_evidence','historical_evidence_gap','identity_ambiguity'].map(c=>[c,results.reduce((sum,r)=>sum+r.comparison.counts[c],0)]));
const output={asOf,scope:'Five bounded Production cases; body-presence markers, not message text; no live mailbox lookup. Not whole-tenant parity.',counts,comparisons:results.reduce((s,r)=>s+r.comparison.comparisons,0),agreements:results.reduce((s,r)=>s+r.comparison.agreements,0),reads,results};
fs.writeFileSync(outputPath,JSON.stringify(output,null,2));
console.log(JSON.stringify({asOf,counts,comparisons:output.comparisons,agreements:output.agreements,cases:results.map(r=>({name:r.name,stage:r.truth.lifecycleStage.value,action:r.truth.actionableState.value,gaps:r.truth.missingEvidence.map(g=>g.code),conflicts:r.truth.contradictions.map(g=>g.code),baseline:r.baseline,differences:r.comparison.differences.map(d=>({consumer:d.consumer,field:d.field,classification:d.classification}))}))},null,2));


