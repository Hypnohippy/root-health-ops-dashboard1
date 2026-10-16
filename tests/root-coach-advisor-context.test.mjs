import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './root-advisor-helpers.mjs';
const org='tenant-a', id='5243a6ec-485e-43fd-86a7-3627aa07cf23', locator=`inbox_${id}`, tenant={organisationId:org,userId:'operator',role:'owner'};
function fixture({founder=false, missing=false, large=false}={}) {
 const rows={inbox_items:[{id,organisation_id:org,platform:'linkedin',kind:'connection_accepted',linkedin_identity:'linkedin.com/in/person',response_state:'needs_reply',raw:{linkedin_message_notifications:[{source:'linkedin_message_notification',gmailMessageId:'abcd',receivedAt:new Date().toISOString()}]}},{id:'foreign',organisation_id:'foreign',sender_email:'secret@example.org'}],growth_targets:[],acquisition_items:[]};
 const evidence={id:'linkedin:message',kind:'Message',channel:'LinkedIn',direction:'inbound',text:large?'x'.repeat(60000):'Exact inbound text',at:null,recordedAt:'2026-10-16T10:00:00Z',source:'stored conversation'};
 const state={relationship:{refs:[{table:'inbox_items',id}],name:'Person',stage:'needs_reply',nextAction:'reply'},founder:founder?[{id:'research',organisation_id:org,research_snapshot:{strategicFit:'Protected Founder insight'},email:'verified@example.org',email_verified:true}]:[],tasks:[],conversation:{dated:[],undated:missing?[]:[evidence]},history:{dated:[],undated:missing?[]:[evidence]}};
 const svc=load('lib/rootCoachAdvisorContext.server.ts',{'@/lib/relationshipWorkspace.server':{getRelationship:async(t,l)=>{assert.equal(t.organisationId,org);assert.equal(l,locator);return state;}},'@/lib/lifecycleSnapshot.server':{readLifecycleInput:async t=>{assert.equal(t,org);return rows;}},'@/lib/responseLifecycle':{responseLifecycleMap:()=>new Map([[id,{canDraft:true,currentStage:'needs_reply'}]])}});
 return {svc,state,rows};
}
test('exact authorised relationship sources only; foreign records and guessed addresses never enter context',async()=>{
 const f=fixture();const result=await f.svc.advisorRelationshipContext(tenant,locator);
 assert.equal(result.packet.canDraft,true);assert.equal(result.mailbox.emails.length,0);assert.doesNotMatch(JSON.stringify(result),/secret@example|foreign/);assert.equal(result.packet.evidence.find(e=>e.id==='linkedin:message').text,'Exact inbound text');
});
test('Founder permission-filtered resolver controls all protected research and verified aliases',async()=>{
 const denied=await fixture().svc.advisorRelationshipContext(tenant,locator);assert.doesNotMatch(JSON.stringify(denied),/Protected Founder|verified@example/);
 const allowed=await fixture({founder:true}).svc.advisorRelationshipContext(tenant,locator);assert.match(JSON.stringify(allowed),/Protected Founder insight/);assert.equal(allowed.mailbox.emails[0],'verified@example.org');
});
test('notification-only and missing inbound body block drafting without invented message content',async()=>{
 const result=await fixture({missing:true}).svc.advisorRelationshipContext(tenant,locator);assert.equal(result.packet.canDraft,false);assert.match(result.packet.limitations.join(' '),/actual inbound message text is missing/);
});
test('large history produces explicit partial coverage and unknown snapshot dates remain unknown',async()=>{
 const result=await fixture({large:true}).svc.advisorRelationshipContext(tenant,locator);assert.match(result.packet.limitations.join(' '),/partial/);const e=result.packet.evidence.find(e=>e.id==='linkedin:message');assert.equal(e.at,null);assert.equal(e.text.length,12000);
});
test('contradictory recorded notes stay separate with provenance rather than overwriting lifecycle',async()=>{
 const f=fixture();f.rows.inbox_items[0].notes='Manual note says waiting';f.state.relationship.stage='needs_reply';
 const result=await f.svc.advisorRelationshipContext(tenant,locator);assert.equal(result.packet.stage,'needs_reply');assert.ok(result.packet.evidence.some(e=>e.kind==='Recorded notes'&&e.text==='Manual note says waiting'));
});
test('resolver denial propagates; client locator never becomes a direct arbitrary database read',async()=>{
 const svc=load('lib/rootCoachAdvisorContext.server.ts',{'@/lib/relationshipWorkspace.server':{getRelationship:async()=>{throw Error('Not permitted');}},'@/lib/lifecycleSnapshot.server':{readLifecycleInput:()=>assert.fail('read after denial')}});
 await assert.rejects(svc.advisorRelationshipContext(tenant,'founder_foreign'),/Not permitted/);
});
