import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import ts from 'typescript';
const require=createRequire(import.meta.url);
const org='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
function load(file,mocks={},globals={}) {
  const mod={exports:{}};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,
    {module:mod,exports:mod.exports,URL,URLSearchParams,Date,console,AbortController,process:{env:{OPENAI_API_KEY:'test-only'}},...globals,require:n=>n in mocks?mocks[n]:n.startsWith('@/lib/')?load(n.replace('@/','')+'.ts',mocks,globals):require(n)});
  return mod.exports;
}
function fixture() {
  const item={id,organisation_id:org,record_type:'partner_opportunity',status:'nurture',company:'ISMA',metadata:{email:'partner@example.test'},engine_state:{status:'replied',reply_state:'human_reply_required',last_inbound_at:'2026-10-05T10:00:00Z'}};
  const reply={id:'reply',organisation_id:org,platform:'email',sender_email:'partner@example.test',email_classification:'human_neutral',email_thread_id:'thread',text:'We cannot promote individual tools. Please consider the Summit; you may use the campaign logo appropriately. Here are free resources.',created_at_platform:'2026-10-05T10:00:00Z'};
  const input={acquisition_items:[item],inbox_items:[reply],growth_targets:[]};
  const messages=[{direction:'outbound',body:'Our earlier Capacity Check introduction',sent_at:'2026-10-04T10:00:00Z'}];
  const filters=[];
  const db={from(table){assert.equal(table,'email_conversation_messages');const q={select(){return q;},eq(k,v){filters.push([k,v]);return q;},order(){return q;},limit:async()=>({data:messages})};return q;}};
  const helper=load('lib/partnerConversation.server.ts',{'@/lib/supabaseAdmin':{supabaseAdmin:db},'@/lib/lifecycleSnapshot.server':{readLifecycleInput:async()=>input}});
  return {item,reply,input,messages,filters,read:()=>helper.readPartnerConversation(org,id),helper};
}
test('partner action presentation uses source facts without changing human status or B2B/legacy actions',()=>{
  const {partnerActivity,partnerActionVisible,partnerActionLabel}=load('lib/partnerConversation.ts');
  const sent=partnerActivity('partner_opportunity',{status:'sent'});
  assert.equal(partnerActionVisible('prepare_outreach',sent),false);assert.equal(partnerActionVisible('accept',sent),false);
  const replied=partnerActivity('partner_opportunity',{status:'replied',reply_state:'human_reply_required'});
  assert.equal(partnerActionVisible('mark_engaged',replied),false);
  assert.equal(partnerActivity('partner_opportunity',{status:'NOT_NOW'}).label,'Follow up later');
  assert.equal(partnerActionLabel('nurture','Nurture'),'Follow up later');
  assert.equal(partnerActionLabel('mark_engaged','Engaged'),'Partnership progressing');
  assert.equal(partnerActionVisible('prepare_outreach',partnerActivity('b2b_lead',{status:'sent'})),true);
  assert.equal(partnerActionVisible('accept',partnerActivity('partner_opportunity',null)),true);
});
test('verified partner context includes actual inbound and prior thread, scoped to tenant and thread',async()=>{
  const f=fixture(),before=JSON.stringify(f.input),result=await f.read();
  assert.equal(result.canGenerate,true);assert.equal(result.context.inbound.body,f.reply.text);assert.match(result.context.thread[0].body,/Capacity Check/);
  assert.equal(result.context.partner.queueStatus,'nurture');assert.equal(JSON.stringify(f.input),before);
  assert.deepEqual(f.filters,[['organisation_id',org],['gmail_thread_id','thread']]);
});
test('OOO, bounce, foreign records, missing email and ambiguous threads do not create a reply link',async()=>{
  for(const change of [f=>f.reply.email_classification='out_of_office',f=>f.reply.email_classification='bounce',f=>f.reply.organisation_id='foreign',f=>f.item.metadata={},f=>f.input.inbox_items.push({...f.reply,id:'second',email_thread_id:'another'})]) {
    const f=fixture();change(f);const result=await f.read();assert.equal(result.canGenerate,false);assert.equal(result.responseId,null);
  }
});
test('detected outbound, newer inbound, uncertain delivery and closed relationship block generation',async()=>{
  for(const change of [f=>f.messages.push({direction:'outbound',sent_at:'2026-10-06T10:00:00Z',body:'Already answered'}),f=>f.item.engine_state.last_outbound_at='2026-10-06T10:00:00Z',f=>f.item.engine_state.last_inbound_at='2026-10-06T10:00:00Z',f=>f.reply.email_delivery_status='dispatching',f=>f.item.status='lost']) {
    const f=fixture();change(f);assert.equal((await f.read()).canGenerate,false);
  }
  const f=fixture();f.item.record_type='personal_opportunity';await assert.rejects(f.read(),/not found/);
});
test('generation uses verified context and organisation profile only; no sends or persistence; races fail closed',async()=>{
  for(const race of [false,true]) {
    const f=fixture();let calls=0;
    const route=load('app/api/growth/acquisition/partner-conversation/route.ts',{
      '@/lib/tenantRoute.server':{withTenantRoute:fn=>req=>fn(req,{organisationId:org,messages:[{role:'system',content:'Verified Root positioning and safety'}]})},
      '@/lib/partnerConversation.server':f.helper,'@/lib/growthIngestion.server':{uuid:/^[a-f0-9-]{36}$/},
      'next/server':{NextResponse:{json:(body,options)=>({body,status:options.status})}},
    },{fetch:async(url,options)=>{
      calls++;assert.equal(url,'https://api.openai.com/v1/chat/completions');const payload=JSON.parse(options.body);
      assert.match(JSON.stringify(payload.messages),/campaign logo/);assert.match(JSON.stringify(payload.messages),/Capacity Check/);assert.match(JSON.stringify(payload.messages),/Verified Root positioning/);
      if(race)f.item.engine_state.last_outbound_at='2026-10-06T10:00:00Z';
      return {ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({summary:'Boundary: no promotion; explore the Summit.',draft:'Thank you for the resources and logo permission. Could we explore Summit participation?'})}}]})};
    }});
    const result=await route.POST({json:async()=>({itemId:id,inbound:'Untrusted browser replacement'})});
    assert.equal(result.status,race?409:200);assert.equal(calls,1);
    assert.doesNotMatch(fs.readFileSync('app/api/growth/acquisition/partner-conversation/route.ts','utf8'),/approve-send|sendMail|\.update\(|\.insert\(|\.rpc\(/);
  }
});
test('tenant wrapper denies access before partner context reads or AI calls',async()=>{
  let reads=0;
  const route=load('app/api/growth/acquisition/partner-conversation/route.ts',{
    '@/lib/tenantAuth':{requireOrganisation:async()=>{throw Error('denied');},accessErrorResponse:()=>({status:403})},
    '@/lib/organisationProfile.server':{getOrganisationGenerationProfile:async()=>{throw Error('must not load');}},
    '@/lib/partnerConversation.server':{readPartnerConversation:async()=>{reads++;throw Error('must not read');}},
    '@/lib/growthIngestion.server':{uuid:/^[a-f0-9-]{36}$/},'next/server':{NextResponse:{json:()=>({status:503})}},
  });
  assert.equal((await route.GET(new Request(`https://ops.test/api/growth/acquisition/partner-conversation?organisationId=${org}&itemId=${id}`))).status,403);assert.equal(reads,0);
  assert.equal((await route.POST(new Request('https://ops.test/api/growth/acquisition/partner-conversation',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({organisationId:org,itemId:id})}))).status,403);assert.equal(reads,0);
});
function nodes(tree,type){const result=[];function walk(n){if(Array.isArray(n))return n.forEach(walk);if(!n||typeof n!=='object')return;if(n.type===type)result.push(n);walk(n.props?.children);}walk(tree);return result;}
test('workbench generates, edits and copies only; Open response uses verified item and no Gmail send action exists',async()=>{
  const state=[];let index=0;const calls=[];
  const Component=load('app/dashboard/growth/acquisition/PartnerConversation.tsx',{
    react:{useState(initial){const i=index++;if(!(i in state))state[i]=initial;return [state[i],v=>state[i]=v];},useEffect(){}},
    '@/lib/tenantFetch':{tenantFetch:async(url,options)=>{calls.push([url,options]);return {ok:true,json:async()=>({summary:'Their boundary and recommended next step',draft:'Thoughtful response'})};}},
  }).default;
  const render=()=>{index=0;return Component({organisationId:org,itemId:id});};render();state[0]={canGenerate:true,responseId:'verified-reply'};
  nodes(render(),'button').find(n=>n.props.children==='Generate response').props.onClick();await new Promise(resolve=>setTimeout(resolve,0));
  const view=render();assert.equal(calls.length,1);assert.equal(calls[0][0],'/api/growth/acquisition/partner-conversation');
  assert.equal(nodes(view,'textarea')[0].props.value,'Thoughtful response');assert.match(nodes(view,'a')[0].props.href,/itemId=verified-reply/);
  assert.doesNotMatch(JSON.stringify(view),/approve-send|Open Gmail draft/);assert.match(JSON.stringify(view),/Nothing has been sent/);
});
