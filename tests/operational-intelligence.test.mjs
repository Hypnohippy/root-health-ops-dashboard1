import {execFileSync} from 'node:child_process';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {loadTruthModule} from './relationship-truth-loader.mjs';
const load=(file,overrides={})=>loadTruthModule(file,overrides);
const core=load('lib/operationalIntelligence.ts');
const org='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',wid='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const input={inbox_items:[{id,organisation_id:org,platform:'linkedin',kind:'connection_accepted',author_name:'Controlled person',linkedin_identity:'linkedin.com/in/controlled-person',status:'needs_reply',created_at_platform:new Date(Date.now()-86400000).toISOString()}],growth_targets:[],acquisition_items:[]};
const links=[{organisation_id:org,workspace_id:wid,source_table:'inbox_items',source_id:id}];
const workspace={id:wid,organisation_id:org,retention:'stale',revision:2};
const queue=load('lib/linkedinOutreach.ts');
test('stale suppresses fresh proactive work generically, exposes reason, and active restores normal governor eligibility',()=>{
 const normal=queue.linkedInOutreachQueue(org,input);assert.equal(normal.total,1);
 const stale=core.proactiveRetention(org,input,[workspace],links);const blocked=queue.linkedInOutreachQueue(org,input,Date.now(),'all',[],10,undefined,stale);
 assert.equal(blocked.total,0);assert.equal(blocked.audit[0].eligibility,'Relationship marked stale');assert.equal(input.inbox_items[0].status,'needs_reply');
 assert.equal(queue.linkedInOutreachQueue(org,input,Date.now(),'all',[],10,undefined,core.proactiveRetention(org,input,[{...workspace,retention:'active'}],links)).total,1);
});
test('stale never suppresses genuine inbound reply attention or changes lifecycle/history',()=>{
 const inbound=structuredClone(input);inbound.inbox_items.push({id:'reply',organisation_id:org,platform:'linkedin',kind:'dm',author_name:'Controlled person',linkedin_identity:'linkedin.com/in/controlled-person',response_state:'needs_reply',status:'needs_reply',text:'Genuine reply'});
 const before=JSON.stringify(inbound);const result=queue.linkedInOutreachQueue(org,inbound,Date.now(),'all',[],10,undefined,new Set(['inbox_items:'+id]));
 assert.equal(result.total,0);assert.equal(result.repliesNeedingAttention,1);assert.equal(JSON.stringify(inbound),before);
});
test('retention cannot cross tenants, names, companies, domains or unlinked sources',()=>{
 const stale=core.proactiveRetention(org,input,[workspace,{...workspace,id:'foreign',organisation_id:'foreign'}],[...links,{organisation_id:'foreign',workspace_id:wid,source_table:'inbox_items',source_id:'foreign'}, {organisation_id:org,workspace_id:wid,source_table:'inbox_items',source_id:'not-owned'}]);
 assert.deepEqual([...stale],['inbox_items:'+id]);assert.equal(core.proactiveSuppression([{table:'inbox_items',id:'other'}],stale),null);
});
const event=(fields={})=>({id:'workspace:call',kind:'Manually recorded called',channel:'Calls',text:'Recorded call',at:'2026-10-22T10:00:00Z',recordedAt:'2026-10-22T12:00:00Z',source:'Manual evidence; not delivery',...fields});
test('Simon-style memory outranks null lifecycle action without manufacturing outbound or cadence proof',()=>{
 const history={dated:[event(),event({id:'workspace:email',kind:'Manually recorded emailed',channel:'Email',at:'2026-10-22T12:15:00Z'}),event({id:'workspace:note',kind:'Observation',channel:'Ops',at:'2026-10-22T12:17:00Z'})],undated:[]};
 const memory=core.relationshipMemory(history,Date.parse('2026-10-22T15:00Z'));assert.equal(memory.latestRelationshipEvent.id,'workspace:note');assert.equal(memory.latestConfirmedOutbound,null);assert.equal(memory.manualActivity.length,3);assert.equal(memory.meetingCallEvidence.length,1);
});
test('confirmed stored messages retain actual/recording timestamps; undated/future/scheduled events do not overwrite latest actual event',()=>{
 const history={dated:[event({id:'gmail:message',channel:'Email',direction:'inbound'}),event({id:'meeting',kind:'Meeting scheduled — not evidence it took place',at:'2026-10-22T11:00Z'}),event({id:'future',at:'2099-01-01'})],undated:[event({id:'unknown',at:null,recordedAt:'2026-10-22T14:00Z'})]};
 const m=core.relationshipMemory(history,Date.parse('2026-10-22T15:00Z'));assert.equal(m.latestRelationshipEvent.id,'gmail:message');assert.equal(m.latestConfirmedInbound.at,'2026-10-22T10:00:00Z');assert.equal(m.latestRecordedEvent.id,'unknown');
});
function fixture({foreign=false,ambiguous=false,privateEvent=false,founder=false,research=[]}={}){
 const rows={founder_research_records:research,relationship_identity_decisions:[],relationship_activity_events:[{id:'call',organisation_id:org,workspace_id:wid,activity_type:'activity',details:{activityType:'called'},message:'Discussed paid visibility; user observation',occurred_at:'2026-10-22T10:00Z',recorded_at:'2026-10-22T12:00Z',founder_only:privateEvent},{id:'note',organisation_id:'foreign',workspace_id:wid,activity_type:'note',message:'FOREIGN SECRET'}],relationship_tasks:[],linkedin_conversation_messages:[{id:'li',organisation_id:org,linkedin_identity:'linkedin.com/in/controlled-person',direction:'inbound',message:'Recorded inbound',message_at:'2026-10-21T10:00Z',confirmed_at:'2026-10-21T11:00Z'}]};
 const mocks={'@/lib/opsSearch.server':{readTenantHistory:async(table,tenant)=>{assert.equal(tenant,org);return rows[table]||[];}},'@/lib/founderIntelligenceAuth.server':{requireFounderIntelligence:async()=>{if(founder)return {};throw new AccessError('Denied');}},'@/lib/tenantAuth':{AccessError},'@/lib/lifecycleSnapshot.server':{readLifecycleInput:async tenant=>{assert.equal(tenant,org);return foreign?{inbox_items:[],growth_targets:[],acquisition_items:[]}:structuredClone(input);}},'@/lib/outreachSelfIdentity.server':{readOutreachSelfIdentity:async()=>undefined},'@/lib/supabaseAdmin':{supabaseAdmin:{from:table=>{assert.equal(table,'organisation_members');const q={select:()=>q,eq:()=>q,order:async()=>({data:[],error:null})};return q;}}}};
 const realContext=load('lib/relationshipWorkspace.server.ts',mocks);
 mocks['@/lib/relationshipWorkspace.server']={...realContext,relationshipContext:async tenant=>({...await realContext.relationshipContext(tenant),workspaces:foreign?[]:[workspace],links:foreign?[]:links})};
 if(ambiguous)mocks['@/lib/relationshipDiscovery']={relationshipDiscoveryInventory:()=>({entries:[{refs:[{table:'inbox_items',id}],result:{ambiguity:{state:'unresolved',reasons:['Conflict']},reconciliationStatus:'unreviewed',verifiedAliases:[]}}]})};
 return {reader:load('lib/operationalIntelligence.server.ts',mocks),mocks,tenant:{organisationId:org,userId:'actor',role:'viewer'}};
}
class AccessError extends Error {constructor(message,status=403){super(message);this.status=status;}}
test('canonical reader composes real history, retention and lifecycle while filtering private/foreign activity',async()=>{
 const f=fixture();const data=await f.reader.readOperationalIntelligence(f.tenant,'inbox_'+id);assert.equal(data.intelligence.state.retention,'stale');assert.equal(data.intelligence.state.lifecycleLastAction,null);assert.equal(data.intelligence.latestRelationshipEvent.id,'workspace:call');assert.equal(data.intelligence.latestConfirmedInbound.id,'linkedin:li');assert.equal(data.intelligence.latestConfirmedOutbound,null);assert.equal(data.intelligence.actionability.linkedInEligible,false);assert.ok(data.intelligence.actionability.suppressionReasons.includes('Relationship marked stale'));assert.doesNotMatch(JSON.stringify(data),/FOREIGN SECRET/);
 const privateData=await fixture({privateEvent:true}).reader.readOperationalIntelligence(f.tenant,'inbox_'+id);assert.notEqual(privateData.intelligence.latestRelationshipEvent?.id,'workspace:call');
});
test('foreign source and unresolved workspace fail closed; exact unresolved source preserves ambiguity',async()=>{
 const f=fixture({foreign:true});await assert.rejects(f.reader.readOperationalIntelligence(f.tenant,'inbox_'+id));
 const a=fixture({ambiguous:true});const d=await a.reader.readOperationalIntelligence(a.tenant,'inbox_'+id);assert.equal(d.intelligence.identity.humanReviewRequired,true);await assert.rejects(a.reader.readOperationalIntelligence(a.tenant,'workspace_'+wid),/review/);
});
test('Relationship detail and Ask Root share latest event; arbitrary selected-context question reaches model and fact/interpretation stay separate',async()=>{
 const f=fixture(),data=await f.reader.readOperationalIntelligence(f.tenant,'inbox_'+id);
 const coach=load('lib/relationshipCoach.server.ts',{...f.mocks,'@/lib/operationalIntelligence.server':f.reader});const answer=await coach.relationshipCoachAnswer(f.tenant,'inbox_'+id,'What trade-off does this record suggest?');assert.ok(answer.message.includes(data.intelligence.latestRelationshipEvent.text));assert.match(answer.message,/Lifecycle last action/);assert.match(answer.grounding,/manual activity is not delivery/);assert.doesNotMatch(answer.message,/Canonical operational evidence/);
 const service=load('lib/rootCoachGuide.server.ts',{...f.mocks,'@/lib/relationshipCoach.server':coach,'@/lib/diary':{diaryQuestion:()=>null},'@/lib/diary.server':{},'@/lib/opsCoachContext.server':{parseOpsContext:()=>null,opsQuestionSubject:()=>null,pageHelpQuestion:()=>false,contextFollowup:()=>false,opsCoachContextAnswer:()=>assert.fail('Selected context must use canonical evidence')}});
 let calls=0;const response=await service.rootCoachGuidance({route:'/dashboard/growth/relationships/inbox_'+id,question:'Which tension in this record deserves care?'},f.tenant,async(q,e)=>{calls++;assert.ok(e.includes(data.intelligence.latestRelationshipEvent.text));return 'Recorded fact: call recorded. Interpretation: review commercial fit.';});assert.equal(calls,1);assert.equal("grounding" in response,false);assert.match(response.message,/Recorded fact.*Interpretation/);
 const blocked=await service.rootCoachGuidance({route:'/dashboard/growth/relationships/inbox_'+id,question:'Send an email'},f.tenant,()=>assert.fail('No AI write'));assert.match(blocked.message,/No action taken/);
});
test('existing write/send/Responses identity safety services are not replaced by read orchestration',()=>{
 const reader=fs.readFileSync('lib/operationalIntelligence.server.ts','utf8');assert.doesNotMatch(reader,/\.(insert|update|delete|upsert|rpc)\(|fetch\(/);
 const ui=fs.readFileSync('app/dashboard/growth/relationships/components/RelationshipDetail.tsx','utf8');assert.match(ui,/buttons?|button/);assert.match(ui,/Strategy · read-only canonical reasoning/);
});

test('queue governor remains identical apart from optional retention suppression; reconciliation, receipts and Responses unchanged',()=>{
 const base='26c590593dac644500cc0ba533c6cf6716dad3a6';
 const before=path=>execFileSync('git',['show',base+':'+path],{encoding:'utf8'}).replaceAll('\r\n','\n');
 let current=fs.readFileSync('lib/linkedinOutreach.ts','utf8').replaceAll('\r\n','\n');
 current=current.replace(', stale: ReadonlySet<string> = new Set()','').replace('    const retentionReason = refs.some(ref => stale.has(`${ref.table}:${ref.id}`)) ? "Relationship marked stale" : null;\n    if (retentionReason) return reject(retentionReason);\n','');
 assert.equal(current,before('lib/linkedinOutreach.ts'));
 for(const path of ['lib/linkedinSendReconciliation.server.ts','lib/linkedinSendEvidence.ts','lib/operationalGovernor.ts','lib/responseLifecycle.ts','lib/relationshipIdentityReconciliation.ts'])assert.equal(fs.readFileSync(path,'utf8').replaceAll('\r\n','\n'),before(path),path);
});

test('search shares latest memory and never borrows an unresolved or foreign workspace',()=>{
 const sources=[{source:'inbox_items:'+id,channel:'LinkedIn',actualAt:'2026-10-20T00:00Z',recordedAt:'2026-10-20T01:00Z'}];
 const activity={id:'latest',organisation_id:org,workspace_id:wid,activity_type:'note',note_type:'Observation',message:'User observation only',occurred_at:'2026-10-22T12:00Z',recorded_at:'2026-10-22T12:01Z'};
 const summary=core.operationalSearchSummary(org,sources,[workspace],links,[activity,{...activity,id:'foreign',organisation_id:'foreign',message:'FOREIGN SECRET'}],false);
 assert.equal(summary.latestRelationshipEvent.id,'workspace:latest');assert.equal(summary.retention,'stale');assert.doesNotMatch(JSON.stringify(summary),/SECRET/);
 const unresolved=core.operationalSearchSummary(org,sources,[workspace],[...links,{...links[0],source_id:'unresolved-other'}],[activity],false);assert.equal(unresolved.latestRelationshipEvent.kind,'Source event');assert.equal(unresolved.retention,null);
});

test('factual questions request a direct recorded answer and private machine grounding stays out of the displayed message',async()=>{
 const f=fixture(),coach=load('lib/relationshipCoach.server.ts',{...f.mocks,'@/lib/operationalIntelligence.server':f.reader});
 const answer=await coach.relationshipCoachAnswer(f.tenant,'inbox_'+id,'What happened today?');assert.doesNotMatch(answer.message,/Canonical operational evidence|"workspaceRefs"/);assert.match(answer.grounding,/workspace:call/);
 const prompt=coach.relationshipReasoningMessages('What happened today?',answer.grounding,'factual');assert.match(prompt[0].content,/directly answer the question/);assert.match(prompt[0].content,/NEVER establishes that the counterpart is open/);assert.match(prompt[0].content,/surface that mismatch explicitly/);assert.match(prompt[0].content,/do not recommend another immediate follow-up/);
 const text=coach.relationshipReasoningText({recommendation:'A call was manually recorded.',reasoning:'Within the supplied evidence only, a call entry exists.',interpretation:'Within the supplied evidence only, commercial fit needs review.',uncertainty:'What did the recipient agree to?'},'factual');assert.match(text,/^Answer \(recorded evidence\)/);
});


test('bulk canonical collection reads history/membership once and uses the same detail composition for every source',async()=>{
 const added=Array.from({length:8},(_,n)=>({id:`eeeeeeee-eeee-4eee-8eee-${String(n).padStart(12,'0')}`,organisation_id:org,platform:'linkedin',kind:'connection_accepted',status:'needs_reply',author_name:'Controlled '+n,linkedin_identity:'linkedin.com/in/controlled-'+n,created_at_platform:new Date(Date.now()-86400000).toISOString()}));
 input.inbox_items.push(...added);
 try{const f=fixture(),counts={},read=f.mocks['@/lib/opsSearch.server'].readTenantHistory;f.mocks['@/lib/opsSearch.server'].readTenantHistory=async(...args)=>{counts[args[0]]=(counts[args[0]]||0)+1;return read(...args);};let members=0;const from=f.mocks['@/lib/supabaseAdmin'].supabaseAdmin.from;f.mocks['@/lib/supabaseAdmin'].supabaseAdmin.from=table=>{members++;return from(table);};
 const result=await f.reader.readOperationalCollection(f.tenant);assert.equal(result.records.length,9);assert.equal(members,1);for(const table of ['relationship_activity_events','relationship_tasks','linkedin_conversation_messages'])assert.equal(counts[table],1,table);assert.equal(result.records[0].intelligence.state.retention,'stale');assert.doesNotMatch(JSON.stringify(result.records),/FOREIGN SECRET/);
 }finally{input.inbox_items.splice(1);}
});

test('canonical Diary and Waiting actionable LinkedIn count equals the unchanged real queue; stale preserves history and reply authority',async()=>{
 const initial=structuredClone(input.inbox_items[0]),retention=workspace.retention;
 const first=new Date(Date.now()-10*86400000).toISOString(),target='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
 input.inbox_items[0].created_at_platform=new Date(Date.now()-20*86400000).toISOString();
 input.growth_targets.push({id:target,organisation_id:org,target_name:'Controlled person',linkedin_identity:initial.linkedin_identity,status:'active',stage:'day3_followup',last_action_at:first,manual_completion:{key:'ffffffff-ffff-4fff-8fff-ffffffffffff',actor:'operator',stage:'connection',message:'Exact controlled manual message',evidence:'Actual send confirmed',sent_at:first,confirmed_at:first,historical_send_date_status:'verified'}});
 try{workspace.retention='active';const f=fixture(),collection=await f.reader.readOperationalCollection(f.tenant),work=load('lib/operationalWork.ts').buildOperationalWork(collection);assert.equal(collection.linkedInFollowups,1);assert.equal(work.items.filter(i=>i.type==='Follow-up'&&i.channel==='linkedin'&&i.actionable).length,collection.linkedInFollowups);assert.equal(work.summary.actionableFollowups,1);
 workspace.retention='stale';const blocked=await fixture().reader.readOperationalCollection(f.tenant),snapshot=load('lib/operationalWork.ts').buildOperationalWork(blocked);assert.equal(blocked.linkedInFollowups,0);assert.equal(snapshot.summary.actionableFollowups,0);assert.ok(snapshot.items.some(i=>i.type==='Follow-up'&&i.suppressionReason==='Relationship marked stale'));assert.ok(snapshot.items.some(i=>i.type==='Manual activity'));
 }finally{input.growth_targets.length=0;input.inbox_items[0]=initial;workspace.retention=retention;}
});

test('bulk canonical reader filters Founder/private evidence before Diary projection',async()=>{const f=fixture({privateEvent:true}),data=await f.reader.readOperationalCollection(f.tenant),snapshot=load('lib/operationalWork.ts').buildOperationalWork(data);assert.equal(snapshot.items.some(i=>i.source.provider==='ops'&&i.source.table==='relationship_activity_events'),false);assert.doesNotMatch(JSON.stringify(snapshot),/FOREIGN SECRET/);});


test('approved public research is permission-scoped and must retain exact canonical provenance',async()=>{
 const own={id:'approved',saved:true,organisation_id:org,entity_kind:'person',person_name:'PUBLIC EVIDENCE ONLY',linked_relationship_workspace_id:wid,research_snapshot:{phase2d:{verification:'matched_public',approvedAt:'2026-10-23T10:00Z',sourceRefs:[{table:'inbox_items',id}],facts:[{claim:'SYNTHETIC APPROVED PUBLIC CLAIM'}],sources:[]}}};
 const bad=[{...own,id:'unsaved',saved:false},{...own,id:'foreign',organisation_id:'foreign',person_name:'FOREIGN PRIVATE RESEARCH'},{...own,id:'other-workspace',linked_relationship_workspace_id:'other'},{...own,id:'candidate',research_snapshot:{phase2d:{verification:'unverified_candidate',sourceRefs:[{table:'inbox_items',id}]}}},{...own,id:'stale-link',research_snapshot:{phase2d:{verification:'matched_public',sourceRefs:[{table:'inbox_items',id:'other-source'}]}}}];
 const f=fixture({founder:true,research:[own,...bad]}),data=await f.reader.readOperationalIntelligence(f.tenant,'inbox_'+id);assert.deepEqual(data.approvedResearch.map(row=>row.id),['approved']);assert.equal(data.relationship.refs.length,1);assert.doesNotMatch(JSON.stringify(data),/FOREIGN PRIVATE RESEARCH/);assert.ok(data.intelligence.identity.sourceRefs.every(ref=>ref.table!=="founder_research_records"));
 const coach=load('lib/relationshipCoach.server.ts',{...f.mocks,'@/lib/operationalIntelligence.server':f.reader}),answer=await coach.relationshipCoachAnswer(f.tenant,'inbox_'+id,'What public evidence is approved?');assert.match(answer.grounding,/SYNTHETIC APPROVED PUBLIC CLAIM/);assert.match(answer.grounding,/historical attributed research/);
});
test('without Founder permission approved research is not exposed or used for identity',async()=>{const f=fixture({research:[{id:'private',organisation_id:org,linked_relationship_workspace_id:wid,research_snapshot:{phase2d:{verification:'matched_public',sourceRefs:[{table:'inbox_items',id}],facts:[{claim:'PRIVATE APPROVED CLAIM'}]}}}]}),data=await f.reader.readOperationalIntelligence(f.tenant,'inbox_'+id);assert.equal(data.approvedResearch.length,0);assert.doesNotMatch(JSON.stringify(data),/PRIVATE APPROVED CLAIM/);});
