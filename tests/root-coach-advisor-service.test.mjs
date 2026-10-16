import test from 'node:test';
import assert from 'node:assert/strict';
import {load} from './root-advisor-helpers.mjs';
const locator='inbox_5243a6ec-485e-43fd-86a7-3627aa07cf23', tenant={organisationId:'tenant',userId:'actor',role:'owner'};
function service({mailboxError, candidates=[], canDraft=false, evidenceId="message:1"}={}) {
 let payload, reads=0;
 const packet={organisationId:'tenant',locator,name:'Stored person',stage:'needs_reply',canDraft,evidence:[{id:evidenceId,origin:'ops_stored',kind:'Message',channel:'LinkedIn',direction:'inbound',text:'Exact stored reply',at:null,recordedAt:null,source:'Stored evidence'}],limitations:[],asOf:'2026-10-16T10:00:00Z'};
 const C=class {constructor(){this.chat={completions:{create:async value=>{payload=value;return {choices:[{message:{content:JSON.stringify({facts:[{text:'A stored reply exists.',evidenceIds:['E1']}],interpretations:[],recommendations:[],commitments:[],draft:'Draft should not escape guard',limitations:[]})}}]};}}};}};
 const svc=load('lib/rootCoachAdvisor.server.ts',{'openai':C,'@/lib/rootCoachAdvisorContext.server':{advisorRelationshipContext:async()=>({packet,mailbox:{organisationId:'tenant',relationshipLocator:locator,emails:[],threadIds:[]}})},'@/lib/rootCoachMailbox.server':{lookupRelationshipMailbox:async()=>{reads++;if(mailboxError)throw Error(mailboxError);return {candidates,messages:[],partial:false};}},'@/lib/organisationProfile.server':{getOrganisationGenerationProfile:async()=>({business:{name:'Root'},voice:{tone:'Plain English'}})}},{process:{env:{OPENAI_API_KEY:'test-only'}}});
 return {svc, packet, get payload(){return payload;},get reads(){return reads;}};
}
const request={organisationId:'tenant',relationshipLocator:locator,intent:'assess_reply',question:'Assess the stored reply',checkLatestEmail:false};
test('stored-only advice uses actual packet and no mailbox call; provider has no tools and does not store responses',async()=>{
 const f=service(),answer=await f.svc.rootCoachAdvisor(request,tenant);assert.equal(f.reads,0);assert.equal(answer.draft,null);assert.equal(f.payload.store,false);assert.equal(f.payload.response_format.type,"json_schema");assert.equal(f.payload.response_format.json_schema.strict,true);assert.deepEqual(Array.from(f.payload.response_format.json_schema.schema.properties.facts.items.properties.evidenceIds.items.enum),["E1"]);assert.equal(f.payload.tools,undefined);assert.match(f.payload.messages[1].content,/Exact stored reply/);
});
test('disabled live lookup is a clear limitation and does not imply current mailbox state',async()=>{
 const f=service({mailboxError:'Live email checking is not activated.'}),answer=await f.svc.rootCoachAdvisor({...request,checkLatestEmail:true},tenant);assert.match(answer.limitations.join(' '),/not activated/);assert.equal(f.reads,1);
});
test('multiple candidate threads remain unlinked, body-free and explicitly ambiguous',async()=>{
 const f=service({candidates:[{threadId:'a',subject:'First'},{threadId:'b',subject:'Second'}]}),answer=await f.svc.rootCoachAdvisor({...request,checkLatestEmail:true},tenant);assert.equal(answer.candidates.length,2);assert.match(answer.limitations.join(' '),/Multiple matching/);assert.equal(answer.evidence.length,1);
});
test('wrong tenant fails before relationship, mailbox or provider use',async()=>{const f=service();await assert.rejects(f.svc.rootCoachAdvisor({...request,organisationId:'foreign'},tenant),/authorised organisation/);assert.equal(f.payload,undefined);assert.equal(f.reads,0);});
test('draft remains available only on explicit draft intent and allowed recorded lifecycle',async()=>{const f=service({canDraft:true});const answer=await f.svc.rootCoachAdvisor({...request,intent:'draft_response'},tenant);assert.equal(answer.draft,'Draft should not escape guard');const g=service({canDraft:true});assert.equal((await g.svc.rootCoachAdvisor(request,tenant)).draft,null);});

test('quoted legacy notification keys use safe model aliases and return exact canonical evidence IDs',async()=>{const id='notification:["gmail-id","linkedin.com/in/person","thread"]';const f=service({evidenceId:id});const answer=await f.svc.rootCoachAdvisor(request,tenant);assert.deepEqual(Array.from(answer.facts[0].evidenceIds),[id]);assert.equal(answer.evidence[0].id,id);assert.deepEqual(Array.from(f.payload.response_format.json_schema.schema.properties.facts.items.properties.evidenceIds.items.enum),['E1']);assert.equal(JSON.parse(f.payload.messages[1].content).packet.evidence[0].id,'E1');});
