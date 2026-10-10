import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { PGlite } from '@electric-sql/pglite';
import * as React from 'react';
import * as jsx from 'react/jsx-runtime';
import { create, act } from 'react-test-renderer';
const require = createRequire(import.meta.url);
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
function load(file, mocks = {}, globals = {}) {
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,
    { module, exports: module.exports, URL, URLSearchParams, Buffer, AbortSignal, console, process: { env: {} }, ...globals,
      require: name => name in mocks ? mocks[name] : name.startsWith('@/lib/') ? load(name.replace('@/','')+'.ts',mocks,globals) : name.startsWith('./') ? load(path.join(path.dirname(file), name+'.tsx'),mocks,globals) : require(name) });
  return module.exports;
}
const org='78fa2ac8-e7b6-4b9b-9604-035723ece6b1', id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', actor='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', key='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const sample = (overrides={}) => ({ id,organisation_id:org,source_engine:'root_health_personal',source_record_id:'SOCIAL-fixture-verified',record_type:'social_opportunity',status:'accepted',source_url:'https://reddit.com/r/example/comments/verified/discussion',signal:'Switching off after work',evidence:'Verified public discussion',metadata:{action_type:'CONTENT_SIGNAL',original_post:'How do you switch off after a long day?',prepared_reply:'This must never become published content',content_angle:'An evening transition',content_draft:'A short pause can help separate work from the rest of the evening.',engine_safety:{public_context:true,consumer_outreach:false,health_targeting:false,verified_direct_discussion:true}},...overrides});
const workflow=load('lib/acquisitionWorkflow.ts'), distribution=load('lib/personalDistribution.ts'), server=load('lib/personalDistribution.server.ts');

test('Content Signal routes to social content; Reddit never responds; qualified LinkedIn response remains unchanged',()=>{
  const item=sample(); assert.equal(distribution.personalDistributionKind(item),'SOCIAL_CONTENT');
  assert.equal(distribution.personalDistributionKind({...item,metadata:{...item.metadata,action_type:'PUBLIC_RESPONSE'}}),'SOCIAL_CONTENT');
  const linkedin=sample({source_url:'https://linkedin.com/posts/discussion',metadata:{...item.metadata,action_type:'PUBLIC_RESPONSE'}});
  assert.equal(distribution.personalDistributionKind(linkedin),'PUBLIC_RESPONSE'); assert.throws(()=>server.planPersonalPublishing(linkedin,{platform:'linkedin',message:'Content'},actor));
  assert.equal(distribution.personalDistributionKind(sample({record_type:'partner_opportunity'})),null);
  for(const flag of ['public_context','consumer_outreach','health_targeting','verified_direct_discussion']) assert.equal(distribution.personalDistributionKind(sample({metadata:{...item.metadata,engine_safety:{...item.metadata.engine_safety,[flag]:!item.metadata.engine_safety[flag]}}})),null);
});
test('publishing payload retains stable identities, uses only edited standalone copy, appends neutral CTA and stays outside dispatcher filters',()=>{
  const item=sample(), row=server.planPersonalPublishing(item,{message:item.metadata.content_draft,platform:'linkedin'},actor), second=server.planPersonalPublishing(item,{message:'Another edit',platform:'facebook'},actor);
  assert.equal(row.id,second.id); assert.equal(row.meta.personal_acquisition.source_record_id,item.source_record_id); assert.equal(row.meta.personal_acquisition.acquisition_id,id); assert.equal(row.meta.personal_acquisition.asset_id,row.id);
  assert.equal(row.meta.approvals.state,'pending'); assert.equal(row.status,'pending'); assert.ok(!['queued','scheduled'].includes(row.status));
  assert.doesNotMatch(row.message,/must never|How do you/);
  const url=new URL(row.message.split('Explore the Root Capacity Check: ')[1]); assert.equal(url.origin,'https://www.roothealth.app'); assert.equal(url.pathname,'/capacity-check'); assert.equal(url.searchParams.get('acquisition_id'),id); assert.equal(url.searchParams.get('utm_campaign'),`pa-${id}`);
  assert.doesNotMatch(url.search,/burnout|health|sleep|example|@|SOCIAL|Switching/);
  assert.throws(()=>server.planPersonalPublishing(item,{message:'Content',platform:'email'},actor));
  assert.throws(()=>server.planPersonalPublishing(item,{message:item.source_url,platform:'linkedin'},actor));
});
test('verified Search Demand routes to manual article brief, without opening public response or pretending website publishing',()=>{
  const item=sample({record_type:'personal_opportunity',source_url:'https://example.test/article',metadata:{lane:'Search Demand',engine_safety:{public_context:true,consumer_outreach:false,health_targeting:false}}});
  assert.equal(distribution.personalDistributionKind(item),'SEARCH_ASSET');
  assert.throws(()=>server.planPersonalPublishing(item,{platform:'linkedin',message:'Content'},actor));
  assert.equal(distribution.personalDistributionKind({...item,signal:'immediate danger'}),null);
});
test('Published requires a provider receipt; simulated or unverified posted state is never claimed as published',()=>{
  const posted={status:'posted',posted_at:'2026-10-10T12:00:00Z',meta:{},error_info:{results:[{ok:true,platform:'linkedin',postedId:'urn:li:share:fixture'}]}};
  assert.equal(server.publishingProgress(posted),'Published');
  assert.equal(server.publishingProgress({...posted,meta:{publish:{mode:'simulate'}}}),'Publication unverified');
  assert.equal(server.publishingProgress({...posted,error_info:null}),'Publication unverified');
  assert.equal(server.publishingProgress({...posted,posted_at:null}),'Publication unverified');
});

async function fixtureDatabase() {
  const db=new PGlite();
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create table organisations(id uuid primary key);insert into organisations values('${org}');`);
  for(const name of ['20260923140000_acquisition_ingestion.sql','20260924100000_actionable_acquisition_queue.sql','20260927100000_acquisition_handoff.sql','20260925100000_acquisition_engine_state.sql','20261009170000_personal_signal_acquisition_actions.sql']) await db.exec(fs.readFileSync('supabase/migrations/'+name,'utf8'));
  await db.exec(`create table scheduled_posts(id uuid primary key,organisation_id uuid not null,message text not null,platforms text[],status text check(status in ('pending','queued','scheduled','posted')),scheduled_for timestamptz,meta jsonb,source text);`);
  const item=sample(); await db.query('insert into acquisition_items(id,organisation_id,source_engine,source_record_id,record_type,status,source_url,signal,evidence,metadata) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[id,org,item.source_engine,item.source_record_id,item.record_type,item.status,item.source_url,item.signal,item.evidence,JSON.stringify(item.metadata)]);
  const calls=[];
  const admin={
    from(table) {
      assert.ok(['scheduled_posts','acquisition_items','acquisition_item_events'].includes(table));
      const filters={}, membership={}; let insert=null;
      const q={ select(){return q;},eq(k,v){filters[k]=v;return q;},in(k,v){membership[k]=v;return q;},insert(row){insert=row;return q;},
        async maybeSingle(){return q.run(true);},async single(){return q.run(true);},then(resolve,reject){return q.run(false).then(resolve,reject);},
        async run(one){
          try {
            let rows;
            if(insert){calls.push({kind:'insert',table,row:insert});const keys=Object.keys(insert);rows=(await db.query(`insert into ${table}(${keys.join(',')}) values(${keys.map((_,i)=>'$'+(i+1)).join(',')}) returning *`,Object.entries(insert).map(([k,v])=>k==='meta'?JSON.stringify(v):v))).rows;}
            else{const params=Object.values(filters);const where=Object.keys(filters).map((k,i)=>`${k}=$${i+1}`);for(const [k,v]of Object.entries(membership)){params.push(v);where.push(`${k}=any($${params.length}::uuid[])`);}rows=(await db.query(`select * from ${table}${where.length?' where '+where.join(' and '):''}`,params)).rows;}
            if(table==='acquisition_items')for(const row of rows)row.acquisition_item_events=(await db.query('select * from acquisition_item_events where acquisition_item_id=$1',[row.id])).rows;
            return {data:one?rows[0]||null:rows,error:null};
          }catch(error){return {data:null,error};}
        }};return q;
    },
    async rpc(name,args){calls.push({kind:'rpc',name,args});return {data:(await db.query('select * from apply_acquisition_action($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[args.p_organisation_id,args.p_item_id,args.p_actor_user_id,args.p_expected_status,args.p_action,args.p_new_status,args.p_outcome,args.p_note,args.p_idempotency_key,args.p_marks_actioned])).rows};},
  };return {db,admin,calls};
}
test('actual Acquisition route creates one real publishing record and audit event; retries never duplicate or dispatch',async()=>{
  const {db,admin,calls}=await fixtureDatabase();try{
    const route=load('app/api/growth/acquisition/[id]/action/route.ts',{'next/server':{NextResponse:{json:(body,opts={})=>({body,status:opts.status||200})}},'@/lib/tenantAuth':{requireOrganisation:async(o,write)=>{assert.equal(o,org);assert.equal(write,true);return {organisationId:org,userId:actor};},accessErrorResponse:()=>null},'@/lib/supabaseAdmin':{supabaseAdmin:admin},'@/lib/acquisitionPromotion.server':{promoteAcquisition:()=>assert.fail('No consumer outreach')}},{process:{env:{PERSONAL_DISTRIBUTION_ENABLED:'true'}},fetch:()=>assert.fail('No external publishing/sending')});
    const payload={organisationId:org,action:'route_publishing',idempotencyKey:key,publication:{platform:'linkedin',message:sample().metadata.content_draft}};
    for(const retryKey of [key,key,'dddddddd-dddd-4ddd-8ddd-dddddddddddd']){
      const result=await route.POST({json:async()=>({...payload,idempotencyKey:retryKey})},{params:Promise.resolve({id})}); assert.equal(result.status,200); assert.equal(result.body.scheduledPostId,server.personalPublishingId(org,id)); assert.match(result.body.destination,/dashboard\/approvals/);
    }
    assert.equal((await db.query('select count(*)::int as n from scheduled_posts')).rows[0].n,1); assert.equal((await db.query('select count(*)::int as n from acquisition_item_events')).rows[0].n,1);
    const row=(await db.query('select * from scheduled_posts')).rows[0];assert.equal(row.meta.personal_acquisition.campaign_id,`pa-${id}`);assert.equal(row.meta.approvals.state,'pending');assert.equal(row.status,'pending');assert.equal(calls.filter(c=>c.kind==='rpc').length,1);
    const progress=await server.personalPerformance(admin,org,[sample()]);assert.equal(progress[id].publishing.id,row.id);assert.equal(progress[id].funnel,null);
  }finally{await db.close();}
});
test('concurrent publishing inserts recover the same stable row without overwriting the draft',async()=>{
  const {db,admin}=await fixtureDatabase();try{
    const [a,b]=await Promise.all([server.routePersonalPublishing(admin,sample(),{platform:'linkedin',message:'Standalone A'},actor),server.routePersonalPublishing(admin,sample(),{platform:'facebook',message:'Standalone B'},actor)]);
    assert.equal(a.id,b.id);assert.equal((await db.query('select count(*)::int as n from scheduled_posts')).rows[0].n,1);
  }finally{await db.close();}
});
test('Ops aggregate integration selects tenant-owned IDs, strips extra returned fields, and keeps unavailable distinct from zero',async()=>{
  const {db,admin}=await fixtureDatabase();try{
    const counts={acquisition_id:id,capacity_check_viewed:3,capacity_check_started:2,capacity_check_completed:1,signup_started:1,signup_completed:1,subscription_started:0,email:'never forward',user_id:actor};
    let request;
    const api=load('lib/personalDistribution.server.ts',{}, {process:{env:{ROOT_PERSONAL_ACQUISITION_URL:'https://root.fixture/api/personal/acquisition/aggregate',ROOT_PERSONAL_ACQUISITION_TOKEN:'server-only'}},fetch:async(url,options)=>{request={url,options};return {ok:true,json:async()=>({available:true,counts:[counts,{...counts,acquisition_id:actor}]})};}});
    const result=await api.personalPerformance(admin,org,[sample(),sample({id:actor,source_engine:'other'})]);
    assert.deepEqual(JSON.parse(request.options.body).acquisitionIds,[id]); assert.equal(result[id].funnel.subscription_started,0); assert.doesNotMatch(JSON.stringify(result),/never forward|user_id/);assert.equal(result[actor],undefined);
    const offline=load('lib/personalDistribution.server.ts',{}, {process:{env:{ROOT_PERSONAL_ACQUISITION_URL:'https://root.fixture',ROOT_PERSONAL_ACQUISITION_TOKEN:'server-only'}},fetch:async()=>({ok:false})});assert.equal((await offline.personalPerformance(admin,org,[sample()]))[id].funnel,null);
  }finally{await db.close();}
});
test('existing Acquisition panel has visible saved/error state, keeps edits after failure and prevents duplicate clicks',async()=>{
  let resolve, requests=[];const waiting=new Promise(r=>resolve=r);
  const Panel=load('app/dashboard/growth/acquisition/PersonalDistributionPanel.tsx',{react:React,'react/jsx-runtime':jsx},{crypto:{randomUUID:()=>key},fetch:async(url,options)=>{requests.push(JSON.parse(options.body));return waiting;}}).default;
  let renderer;await act(async()=>{renderer=create(React.createElement(Panel,{itemId:id,organisationId:org,initialDraft:'Standalone edited draft',performance:null}));});
  const button=()=>renderer.root.findByType('button');const click=button().props.onClick;
  await act(async()=>{click();click();});assert.equal(requests.length,1);assert.equal(button().props.disabled,true);assert.match(JSON.stringify(renderer.toJSON()),/Saving/);
  await act(async()=>resolve({ok:false,json:async()=>({error:'Storage unavailable. Retry.'})}));assert.equal(button().props.disabled,false);assert.equal(renderer.root.findByType('textarea').props.value,'Standalone edited draft');assert.match(JSON.stringify(renderer.toJSON()),/Storage unavailable/);
  await act(async()=>renderer.unmount());
});
