import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import ts from 'typescript';
import { PGlite } from '@electric-sql/pglite';
const require=createRequire(import.meta.url);
function load(file,mocks={},globals={}) {
  const mod={exports:{}};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,
    {module:mod,exports:mod.exports,URL,URLSearchParams,AbortSignal,Date,console,...globals,require:n=>n in mocks?mocks[n]:['./PartnerConversation','./ManualOpportunity','./PersonalSignalCard','./PersonalDistributionPanel','./PersonalAcquisition'].includes(n)?{__esModule:true,default:()=>null}:n.startsWith('@/lib/')?load(n.replace('@/','')+'.ts',mocks,globals):require(n)});
  return mod.exports;
}
const promotion=load('lib/acquisitionPromotion.server.ts',{'@/lib/supabaseAdmin':{}});
const lifecycle=load('lib/contactLifecycle.ts');
const A=randomUUID(),B=randomUUID(),USER=randomUUID();
const sample=(more={})=>({record_type:'b2b_lead',status:'accepted',source_engine:'google_b2b_lead_engine',company:"Barnardo's",metadata:{email:'recruitment.support@barnardos.org.uk',buyer_role:'Corporate partnerships / commissioning',email_verification:'PASSED'},...more});
async function fixture() {
  const db=new PGlite();
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
    create table organisations(id uuid primary key);insert into organisations values('${A}'),('${B}');
    create table growth_targets(id uuid primary key default gen_random_uuid(),organisation_id uuid references organisations(id),
      target_name text,company text,role_title text,email text,linkedin_url text,notes text,stage text,status text,last_action_at timestamptz);
  `);
  for(const file of ['20260923140000_acquisition_ingestion.sql','20260924100000_actionable_acquisition_queue.sql','20260924190000_consolidated_linkedin_growth.sql','20260927100000_acquisition_handoff.sql','20261007100000_acquisition_target_promotion.sql'])
    await db.exec(fs.readFileSync('supabase/migrations/'+file,'utf8'));
  async function item(more={}) {
    const value=sample(more),id=randomUUID();
    return (await db.query(`insert into acquisition_items(id,organisation_id,record_type,status,source_engine,source_record_id,company,person,source_url,metadata)
      values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning *`,[id,more.organisation_id||A,value.record_type,value.status,value.source_engine,id,value.company,value.person||null,value.source_url||null,value.metadata])).rows[0];
  }
  async function promote(row,{org=A,key=randomUUID(),note=null,target=promotion.acquisitionTarget(row)}={}) {
    return (await db.query('select promote_acquisition_target($1,$2,$3,$4,$5,$6,$7,$8) result',[org,row.id,USER,key,'prepare_outreach',note,row.updated_at,target])).rows[0].result;
  }
  return {db,item,promote};
}
test('confirmed metadata maps defensively; unsupported or uncertain identity is blocked',()=>{
  const input=sample(),before=JSON.stringify(input),target=promotion.acquisitionTarget(input);
  assert.equal(target.email,input.metadata.email);assert.equal(target.role_title,input.metadata.buyer_role);assert.equal(JSON.stringify(input),before);
  assert.equal(promotion.acquisitionTarget(sample({metadata:{email:'owner@example.test'}})).role_title,null);
  for(const record_type of ['personal_opportunity','social_opportunity'])assert.throws(()=>promotion.acquisitionTarget(sample({record_type})),/Only business/);
  for(const metadata of [{},{email:'two@example.test,other@example.test'}])assert.throws(()=>promotion.acquisitionTarget(sample({metadata})));
  assert.throws(()=>promotion.acquisitionTarget(sample({status:'reviewing'})),/Accept/);
});
test('B2B, partner and LinkedIn promote canonically, preserve evidence and retry without duplicates',async()=>{
  const f=await fixture();try {
    for(const more of [{},{record_type:'partner_opportunity',metadata:{email:'partner@example.test'}},{source_engine:'linkedin_connection_network',source_url:'https://www.linkedin.com/in/Alex/?trk=email',person:'Alex',metadata:{headline:'People Director'}}]) {
      const row=await f.item(more),result=await f.promote(row);
      assert.ok(result.targetId);assert.equal(result.created,true);assert.equal(result.item.status,'actioned');
      const target=(await f.db.query('select * from growth_targets where id=$1',[result.targetId])).rows[0];
      assert.equal(target.acquisition_item_id,row.id);assert.equal(target.owner_user_id,USER);assert.equal(target.stage,'connection');assert.equal(target.last_action_at,null);
      assert.equal(result.item.metadata.email_verification,row.metadata.email_verification);
      assert.equal((await f.promote(row)).targetId,target.id);
      assert.equal((await f.db.query('select count(*)::int n from acquisition_item_events where acquisition_item_id=$1',[row.id])).rows[0].n,1);
    }
    assert.equal((await f.db.query('select count(*)::int n from growth_targets')).rows[0].n,3);
  }finally{await f.db.close();}
});
test('legacy actioned handoff upgrades; matching email reuses target without resetting lifecycle',async()=>{
  const f=await fixture();try {
    const row=await f.item({status:'actioned',metadata:{...sample().metadata,handoff:{destination:'/dashboard/growth/pipeline',action:'prepare_outreach'}}});
    const existing=(await f.db.query("insert into growth_targets(organisation_id,target_name,email,stage,status) values($1,'Existing',$2,'day3_dm','waiting') returning id",[A,row.metadata.email])).rows[0].id;
    const result=await f.promote(row);assert.equal(result.targetId,existing);assert.equal(result.created,false);
    assert.equal((await f.db.query('select status from growth_targets where id=$1',[existing])).rows[0].status,'waiting');
    assert.equal(result.item.metadata.handoff.target_id,existing);
  }finally{await f.db.close();}
});
test('legacy LinkedIn URL matches reuse and conflicting profile/email identities fail closed',async()=>{
  const f=await fixture();try {
    const row=await f.item({person:'Alex',source_url:'https://linkedin.com/in/alex',metadata:{email:'alex@example.test'}});
    const id=(await f.db.query("insert into growth_targets(organisation_id,target_name,linkedin_url) values($1,'Alex','https://www.linkedin.com/in/Alex/?trk=test') returning id",[A])).rows[0].id;
    assert.equal((await f.promote(row)).targetId,id);
    const conflicting=await f.item({person:'Alex',source_url:'https://linkedin.com/in/other',metadata:{email:'alex@example.test'}});
    await f.db.query("update growth_targets set email='alex@example.test',linkedin_identity='linkedin.com/in/alex' where id=$1",[id]);
    await assert.rejects(f.promote(conflicting),/identity_conflict/);
    assert.equal((await f.db.query('select status from acquisition_items where id=$1',[conflicting.id])).rows[0].status,'accepted');
  }finally{await f.db.close();}
});
test('target/audit failures roll back; ambiguous matches, foreign tenants and browser RPC access fail closed',async()=>{
  const f=await fixture();try {
    const row=await f.item();
    for(const record_type of ['personal_opportunity','social_opportunity']) {
      const blocked=await f.item({record_type});
      await assert.rejects(f.promote(blocked,{target:promotion.acquisitionTarget(row)}),/unsupported_type/);
    }
    await assert.rejects(f.promote(row,{org:B}),/not_found/);
    await f.db.exec("alter table growth_targets add constraint simulated_failure check(target_name <> 'FAIL')");
    await assert.rejects(f.promote(row,{target:{...promotion.acquisitionTarget(row),target_name:'FAIL'}}),/simulated_failure/);
    await f.db.exec("alter table acquisition_item_events add constraint simulated_audit_failure check(note is distinct from 'FAIL')");
    await assert.rejects(f.promote(row,{note:'FAIL'}),/simulated_audit_failure/);
    assert.equal((await f.db.query('select count(*)::int n from growth_targets')).rows[0].n,0);
    assert.equal((await f.db.query('select status from acquisition_items where id=$1',[row.id])).rows[0].status,'accepted');
    await f.db.query("insert into growth_targets(organisation_id,email) values($1,$2),($1,$2)",[A,row.metadata.email]);
    await assert.rejects(f.promote(row),/ambiguous/);
    await f.db.exec('set role authenticated');await assert.rejects(f.promote(row),/permission denied/);
  }finally{await f.db.close();}
});
test('queue exposes Open outreach only for an audited target in the same tenant',async()=>{
  const id=randomUUID(),foreign=randomUUID(),key=randomUUID();
  const items=[id,foreign].map(target_id=>({id:randomUUID(),record_type:'b2b_lead',metadata:{handoff:{destination:'/dashboard/growth/pipeline',target_id,idempotency_key:key,action:'prepare_outreach'}},acquisition_item_events:[{idempotency_key:key,action:'prepare_outreach'}]}));
  items.push({id:randomUUID(),metadata:{handoff:{target_id:id}},acquisition_item_events:[]});
  const db={from(table){const q={select(){return q;},eq(k,v){assert.equal(k,'organisation_id');assert.equal(v,A);return q;},order(){return q;},range:async()=>({data:items,count:3}),in:async(k,ids)=>{assert.equal(table,'growth_targets');assert.equal(k,'id');assert.ok(ids.includes(foreign));return {data:[{id}]};}};return q;}};
  const api=load('app/api/growth/acquisition/route.ts',{'@/lib/supabaseAdmin':{supabaseAdmin:db},'@/lib/tenantAuth':{requireOrganisation:async()=>({organisationId:A}),accessErrorResponse:()=>null},'next/server':{NextResponse:{json:(body,options)=>({body,status:options?.status||200})}}});
  const result=await api.GET({url:`https://ops.test/api/growth/acquisition?organisationId=${A}`});
  assert.equal(result.status,200);assert.deepEqual(Array.from(result.body.items,x=>x.outreachTargetId),[id,null,null]);
});
test('target pipeline fetch retains tenant scope and projects actual outreach and linked source evidence',async()=>{
  const id=randomUUID(),row={id,organisation_id:A,target_name:'Business',email:'a@example.test',stage:'connection',status:'active'};
  const filters=[];const q={select(){return q;},eq(k,v){filters.push([k,v]);return q;},order(){return q;},then(resolve){resolve({data:[row]});}};
  const api=load('app/api/growth/pipeline/route.ts',{'@/lib/supabaseAdmin':{supabaseAdmin:{from:()=>q}},'@/lib/tenantRoute.server':{withTenantRoute:fn=>req=>fn(req,{organisationId:A})},
    '@/lib/lifecycleSnapshot.server':{readLifecycleInput:async org=>{assert.equal(org,A);return {growth_targets:[row],acquisition_items:[{...sample(),organisation_id:A,id:randomUUID(),metadata:{email:'a@example.test',handoff:{target_id:id}}}],inbox_items:[
      {id:'linked-response',organisation_id:A,sender_email:'a@example.test',text:'Recorded reply',email_classification:'human_reply'},
      {id:'foreign-response',organisation_id:B,sender_email:'a@example.test',text:'Foreign reply'},
      {id:'unrelated-response',organisation_id:A,sender_email:'other@example.test',text:'Unrelated reply'},
    ]};}},
    'next/server':{NextResponse:{json:(body,options)=>({body,status:options?.status||200})}}});
  const result=await api.GET({url:`https://ops.test/api/growth/pipeline?targetId=${id}`});
  assert.deepEqual(filters,[['organisation_id',A],['id',id]]);assert.equal(result.body.data[0].lifecycle.currentStage,'outreach_ready');assert.equal(result.body.data[0].acquisition.length,1);
  assert.deepEqual(Array.from(result.body.data[0].responses,r=>r.id),['linked-response']);
  assert.equal(result.body.data[0].responses[0].text,'Recorded reply');
});
test('successful handoff projection defers to outreach target, while waiting/source evidence and Personal safeguards survive',()=>{
  const id=randomUUID(),itemId=randomUUID(),email=sample().metadata.email;
  const target={id,organisation_id:A,target_name:'Business',email,stage:'connection',status:'active',created_at:'2026-09-01T00:00:00Z'};
  const acquisition={...sample({status:'actioned'}),id:itemId,organisation_id:A,updated_at:'2026-10-05T00:00:00Z',metadata:{email,handoff:{target_id:id}}};
  const input={growth_targets:[target],acquisition_items:[acquisition],inbox_items:[]};
  const contact=lifecycle.buildContactLifecycle(A,input)[0];assert.equal(contact.currentStage,'outreach_ready');assert.equal(contact.actionRecord.id,id);
  const governor=load('lib/operationalGovernor.ts');assert.equal(governor.planManualCompletion(A,input,'growth_targets',id).allowed,false);
  acquisition.engine_state={status:'sent',last_outbound_at:'2026-10-05T12:00:00Z'};
  assert.equal(lifecycle.buildContactLifecycle(A,input)[0].currentStage,'waiting');
  assert.equal(governor.planManualCompletion(A,input,'growth_targets',id).allowed,false);
  for(const [engine_state,expected] of [[{status:'replied'},'engaged'],[{status:'meeting_booked'},'meeting'],[{status:'sent',reply_state:'human_reply'},'needs_reply']]) {
    acquisition.engine_state=engine_state;
    assert.equal(lifecycle.buildContactLifecycle(A,input)[0].currentStage,expected);
    assert.equal(governor.planManualCompletion(A,input,'growth_targets',id).allowed,false);
  }
  delete acquisition.engine_state;acquisition.source_engine='root_health_personal';
  assert.equal(governor.planManualCompletion(A,input,'growth_targets',id).allowed,false);
  acquisition.source_engine='linkedin_connection_network';
  assert.equal(governor.planManualCompletion(A,input,'growth_targets',id).allowed,true);
});
test('both API entry points authorize before promotion and return real target-specific destinations',async()=>{
  const id=randomUUID(),targetId=randomUUID();let writes=0;
  const query={select(){return query;},eq(key,value){if(key==='organisation_id')assert.equal(value,A);return query;},maybeSingle:async()=>({data:{...sample(),id,updated_at:'2026-10-05'}})};
  const helper=load('lib/acquisitionPromotion.server.ts',{'@/lib/supabaseAdmin':{supabaseAdmin:{from:()=>query,rpc:async()=>{writes++;return {data:{targetId,created:true}};}}}});
  for(const file of ['action','start-outreach'])for(const allowed of [false,true]) {
    const before=writes;
    const api=load(`app/api/growth/acquisition/[id]/${file}/route.ts`,{
      '@/lib/acquisitionPromotion.server':helper,'@/lib/supabaseAdmin':{},
      '@/lib/tenantAuth':{requireOrganisation:async(org,write)=>{assert.equal(org,A);assert.equal(write,true);if(!allowed)throw Error('denied');return {organisationId:A,userId:USER};},accessErrorResponse:()=>null},
      'next/server':{NextResponse:{json:(body,options)=>({body,status:options?.status||200})}}
    });
    const result=await api.POST({json:async()=>({organisationId:A,action:'prepare_outreach',idempotencyKey:randomUUID()})},{params:Promise.resolve({id})});
    if(!allowed){assert.equal(writes,before);assert.notEqual(result.status,200);}
    else {assert.equal(result.status,200);assert.equal(result.body.targetId,targetId);const url=new URL(result.body.destination,'https://ops.test');assert.equal(url.searchParams.get('targetId'),targetId);assert.equal(url.searchParams.get('acquisitionItemId'),id);assert.equal(url.searchParams.get('organisationId'),A);}
  }
});
function nodes(tree,type){const out=[];function walk(n){if(Array.isArray(n))return n.forEach(walk);if(!n||typeof n!=='object')return;if(n.type===type)out.push(n);walk(n.props?.children);}walk(tree);return out;}
test('queue has one Start outreach action, follows real target destination, and retains Open outreach for converted records',async()=>{
  const id=randomUUID(),targetId=randomUUID(),state=[];let index=0,destination;const calls=[];
  const react={useState(initial){const i=index++;if(!(i in state))state[i]=typeof initial==='function'?initial():initial;return [state[i],v=>state[i]=typeof v==='function'?v(state[i]):v];},useEffect(){},useCallback:fn=>fn};
  const item={...sample(),id,acquisition_item_events:[]};
  const url=`/dashboard/growth/pipeline?organisationId=${A}&targetId=${targetId}&acquisitionItemId=${id}`;
  const Page=load('app/dashboard/growth/acquisition/page.tsx',{react},{crypto:{randomUUID},window:{location:{href:'https://ops.test/dashboard/growth/acquisition?record_type=b2b_lead',search:'?record_type=b2b_lead',assign:value=>destination=value}},fetch:async(path,options)=>{calls.push([path,options]);return {ok:true,json:async()=>options?.method==='POST'?{success:true,destination:url}:{items:[item],total:1}};}}).default;
  const render=()=>{index=0;return Page();};render();state[1]=A;state[2]=false;state[4]=[item];state[7]=1;state[12]=id;
  const buttons=nodes(render(),'button').filter(n=>JSON.stringify(n.props.children).includes('outreach'));
  assert.equal(buttons.length,1);assert.equal(buttons[0].props.children,'Start outreach');buttons[0].props.onClick();
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(calls[0][0],`/api/growth/acquisition/${id}/action`);assert.equal(JSON.parse(calls[0][1].body).action,'prepare_outreach');assert.equal(destination,url);
  item.outreachTargetId=targetId;item.status='converted';state[4]=[item];
  const link=nodes(render(),'a').find(n=>n.props.children==='Open outreach');assert.equal(link.props.href,url);
  assert.equal(nodes(render(),'button').some(n=>n.props.children==='Start outreach'),false);
});
test('workspace prepares the existing message API and exposes evidence-based manual completion without sending',async()=>{
  const id=randomUUID(),state=[];let index=0;const calls=[],Manual=()=>null;
  const react={useState(initial){const i=index++;if(!(i in state))state[i]=initial;return [state[i],v=>state[i]=v];}};
  const Workspace=load('app/dashboard/growth/pipeline/OutreachWorkspace.tsx',{react,'../../components/ManualTakeover':{__esModule:true,default:Manual},'@/lib/tenantFetch':{tenantFetch:async(path,options)=>{calls.push([path,JSON.parse(options.body)]);return {ok:true,json:async()=>({success:true,message:'Reviewed first draft'})};}}}).default;
  const target={id,organisation_id:A,email:'business@example.test',target_name:'Business',lifecycle:{currentStage:'outreach_ready',actionRecord:{table:'growth_targets',id}}};
  const render=()=>{index=0;return Workspace({target,onComplete:async()=>{}});};
  let tree=render();assert.equal(nodes(tree,Manual)[0].props.id,id);nodes(tree,'button').find(n=>n.props.children==='Prepare first message').props.onClick();
  await new Promise(resolve=>setTimeout(resolve,0));tree=render();assert.equal(nodes(tree,'textarea')[0].props.value,'Reviewed first draft');
  assert.equal(calls.length,1);assert.equal(calls[0][0],'/api/growth/generate-message');assert.equal(calls[0][1].targetId,id);assert.match(calls[0][1].messageType,/business email/);
  target.acquisition=[{id:randomUUID(),source_engine:'root_health_personal'}];assert.equal(nodes(render(),Manual).length,0);
});
test('actual target page shows outreach-ready lead, not empty meetings; meeting controls remain',()=>{
  const id=randomUUID(),Component=()=>null;
  for(const stage of ['outreach_ready','meeting']) {
    let index=0;const values=[[{id,target_name:"Barnardo's",lifecycle:{currentStage:stage}}],false,'',{},null,'meetings',id];
    const page=load('app/dashboard/growth/pipeline/page.tsx',{'react':{useState:()=>[values[index++],()=>{}],useEffect(){},useCallback:fn=>fn},'./OutreachWorkspace':{__esModule:true,default:Component},'@/lib/tenantFetch':{} }).default;
    const tree=page(),serialized=JSON.stringify(tree);assert.match(serialized,/Barnardo/);assert.doesNotMatch(serialized,/No calls booked yet/);
    assert.equal(nodes(tree,Component).length,1);assert.equal(serialized.includes('Generate Call Prep'),stage==='meeting');
  }
});

test('B2B ownership renders monitor-only for ready and follow-up; LinkedIn/manual controls survive',()=>{
  const Manual=()=>null;
  const Workspace=load('app/dashboard/growth/pipeline/OutreachWorkspace.tsx',{react:{useState:value=>[value,()=>{}]},'@/lib/tenantFetch':{},'../../components/ManualTakeover':{__esModule:true,default:Manual}}).default;
  for(const stage of ['outreach_ready','follow_up']) for(const source of ['root_health_b2b','google_b2b_lead_engine']) {
    for(const evidence of [{source_type:source},{acquisition:[{id:'a',source_engine:source,engine_state:{status:'ready'}}]},{acquisition:[{id:'a',metadata:{source}}]}]) {
      const view=Workspace({target:{id:'target',organisation_id:A,target_name:'Business',suggested_message:'Source draft',lifecycle:{currentStage:stage},...evidence},onComplete:async()=>{}});
      assert.match(JSON.stringify(view),/Automated outreach owned by Root B2B engine/);
      assert.equal(nodes(view,Manual).length,0);assert.equal(nodes(view,'button').length,0);assert.equal(nodes(view,'textarea').length,0);
      if(evidence.acquisition?.[0].engine_state)assert.match(JSON.stringify(view),/Source engine state/);
    }
    const view=Workspace({target:{id:'manual',organisation_id:A,target_name:'Alex',source_type:'linkedin_connection_network',linkedin_url:'https://linkedin.com/in/alex',lifecycle:{currentStage:stage}},onComplete:async()=>{}});
    assert.equal(nodes(view,Manual).length,1);
    assert.ok(nodes(view,'button').some(n=>n.props.children===(stage==='outreach_ready'?'Prepare first message':'Prepare follow-up')));
  }
});

test('B2B presentation explains ownership, next steps and links to recorded source status without manual controls',()=>{
  const Manual=()=>null;
  const Workspace=load('app/dashboard/growth/pipeline/OutreachWorkspace.tsx',{react:{useState:value=>[value,()=>{}]},'@/lib/tenantFetch':{},'../../components/ManualTakeover':{__esModule:true,default:Manual}}).default;
  const cases=[
    [undefined,'Awaiting source status','Back to Acquisition'],
    [{status:'queued'},'Automated outreach queued','View outreach status'],
    [{status:'scheduled'},'Automated outreach queued','View outreach status'],
    [{status:'ready'},'Automated outreach queued','View outreach status'],
    [{status:'sent'},'Outreach sent - waiting for response','View outreach status'],
    [{status:'waiting'},'Waiting for response','View outreach status'],
    [{follow_up_status:'due'},'Follow-up scheduled','View outreach status'],
    [{follow_up_status:'scheduled'},'Follow-up scheduled','View outreach status'],
    [{status:'replied'},'Reply requires attention','Open response'],
    [{reply_state:'human_reply'},'Reply requires attention','Open response'],
    [{status:'meeting_booked'},'Meeting booked','Open meeting'],
    ...['failed','blocked','bounced'].map(status=>[{status},'Needs attention','Open response']),
  ];
  for(const [engine_state,label,cta] of cases) {
    const view=Workspace({target:{id:'target',organisation_id:A,target_name:'Business',source_type:'root_health_b2b',lifecycle:{currentStage:'outreach_ready'},responses:[{id:'reply-id',text:'Recorded reply',email_classification:'human_positive'},{id:'failure-id',text:'Recorded bounce',email_classification:'bounce'}],acquisition:[{id:'source-item',source_engine:'root_health_b2b',engine_state}]},onComplete:async()=>{}});
    assert.equal(nodes(view,'h3')[0].props.children,label);
    const link=nodes(view,'a').find(n=>n.props.children===cta);assert.ok(link);
    if(cta==='View outreach status')assert.equal(link.props.href,'#source-outreach-status');
    else if(cta==='Open meeting')assert.equal(link.props.href,'#source-meeting');
    else if(cta!=='Back to Acquisition') {
      const url=new URL(link.props.href,'https://ops.test');assert.equal(url.pathname,'/dashboard/responses');assert.equal(url.searchParams.get('itemId'),label==='Needs attention'?'failure-id':'reply-id');assert.equal(url.searchParams.get('organisationId'),A);
    }
    const text=JSON.stringify(view);assert.match(text,/owns this contact/);assert.match(text,/Next:/);
    if(cta==='View outreach status' && label!=='Meeting booked')assert.match(text,/No action is required from you right now/);
    if(!engine_state){assert.match(text,/No send or schedule is confirmed/);assert.match(text,/Do not send outreach manually/);}
    assert.equal(nodes(view,Manual).length,0);assert.equal(nodes(view,'button').length,0);
    for(const question of ['What has happened?','What happens next?','Do I need to do anything?'])assert.ok(nodes(view,'h4').some(n=>n.props.children===question));
  }
  const missing=Workspace({target:{id:'target',organisation_id:A,target_name:'Business',source_type:'root_health_b2b',acquisition:[{id:'source',source_engine:'root_health_b2b',engine_state:{status:'failed'}}]},onComplete:async()=>{}});
  assert.match(JSON.stringify(missing),/does not currently expose a verified repair action/);assert.equal(nodes(missing,'a').some(n=>n.props.children==='Resolve issue'),false);
  assert.equal(nodes(missing,'a').find(n=>n.props.children==='View source evidence').props.href,'#source-evidence-source');
  assert.equal(nodes(missing,'details').find(n=>n.props.id==='source-evidence-source').props.open,true);
});

test('source response CTA requires matching issue or explicitly classified human reply, never an arbitrary event',()=>{
  const Workspace=load('app/dashboard/growth/pipeline/OutreachWorkspace.tsx',{react:{useState:value=>[value,()=>{}]},'@/lib/tenantFetch':{},'../../components/ManualTakeover':{__esModule:true,default:()=>null}}).default;
  const ooo={id:'ooo',email_classification:'out_of_office'},bounce={id:'bounce',email_classification:'bounce'},human={id:'human',email_classification:'human_neutral'};
  for(const [status,responses,expected] of [
    ['bounced',[ooo],null],['replied',[bounce,ooo],null],['bounced',[ooo,bounce],'bounce'],['replied',[ooo,bounce,human],'human'],
    ['replied',[{id:'unknown'},{id:'ack',email_classification:'auto_acknowledgement'}],null],
  ]) {
    const view=Workspace({target:{id:'target',organisation_id:A,source_type:'root_health_b2b',responses,acquisition:[{id:'source',source_engine:'root_health_b2b',engine_state:{status}}]},onComplete:async()=>{}});
    const link=nodes(view,'a').find(n=>n.props.children==='Open response');
    if(expected)assert.equal(new URL(link.props.href,'https://ops.test').searchParams.get('itemId'),expected);
    else {assert.equal(link,undefined);assert.equal(nodes(view,'a').find(n=>n.props.children==='View source evidence').props.href,'#source-evidence-source');}
  }
});

test('acquisition cards retain human New status and separately show projected source state on desktop and mobile',()=>{
  const state=[];let index=0;
  const react={useState(initial){const i=index++;if(!(i in state))state[i]=typeof initial==='function'?initial():initial;return [state[i],v=>state[i]=v];},useEffect(){},useCallback:fn=>fn};
  const Page=load('app/dashboard/growth/acquisition/page.tsx',{react},{window:{location:{href:'https://ops.test/dashboard/growth/acquisition?record_type=b2b_lead',search:'?record_type=b2b_lead'}}}).default;
  const render=()=>{index=0;return Page();};render();state[1]=A;state[2]=false;
  for(const [engine_state,label] of [[{status:'sent'},'Waiting · Sent'],[{status:'replied'},'Engaged · Replied'],[{status:'human_reply_required'},'Needs Reply · Human Reply Required'],[{status:'nurture'},'Nurture'],[{status:'bounced'},'Waiting · Delivery Issue'],[null,null]]) {
    const item={...sample({status:'new',record_type:'partner_opportunity'}),id:'ukihca',entity:'UKIHCA',engine_state};state[4]=[item];state[7]=1;state[12]=item.id;
    const before=JSON.stringify(item),tree=render();
    assert.equal(nodes(tree,'span').filter(n=>n.props.children==='New').length,2);
    const lines=nodes(tree,'p').filter(n=>Array.isArray(n.props.children)&&n.props.children[0]==='Source: ');
    assert.equal(lines.length,label?2:0);for(const line of lines)assert.equal(line.props.children[1],label);
    const legacy=!engine_state || engine_state.status==='nurture';
    assert.equal(nodes(tree,'button').some(n=>n.props.children==='Accept'),legacy);assert.equal(nodes(tree,'button').some(n=>n.props.children==='Dismiss'),legacy);
    assert.equal(JSON.stringify(item),before);
  }
});

test('end-to-end: Accept and Start outreach traverse real routes and SQL into the actual target workspace',async()=>{
  const f=await fixture();try {
    const item=await f.item({status:'new',metadata:{...sample().metadata,prepared_outreach:'A prepared business message for review.'}});
    const json=value=>JSON.parse(JSON.stringify(value));
    const db={from(table){
      assert.ok(['acquisition_items','acquisition_item_events','growth_targets'].includes(table));
      const filters=[];let bounds=null;
      const execute=async()=>{
        let rows=json((await f.db.query(`select * from ${table}`)).rows).filter(row=>filters.every(([key,value])=>Array.isArray(value)?value.includes(row[key]):row[key]===value));
        if(table==='acquisition_items')for(const row of rows)row.acquisition_item_events=json((await f.db.query('select * from acquisition_item_events where acquisition_item_id=$1',[row.id])).rows);
        const count=rows.length;if(bounds)rows=rows.slice(bounds[0],bounds[1]+1);return {data:rows,count};
      };
      const q={select(){return q;},eq(k,v){filters.push([k,v]);return q;},in(k,v){filters.push([k,v]);return q;},order(){return q;},range(a,b){bounds=[a,b];return q;},
        async maybeSingle(){const result=await execute();return {data:result.data[0]||null};},then(resolve,reject){return execute().then(resolve,reject);}};return q;
    },async rpc(name,args){try {
      if(name==='promote_acquisition_target')return {data:(await f.db.query('select promote_acquisition_target($1,$2,$3,$4,$5,$6,$7,$8) result',[
        args.p_organisation_id,args.p_item_id,args.p_actor,args.p_key,args.p_action,args.p_note,args.p_updated_at,args.p_target])).rows[0].result};
      assert.equal(name,'apply_acquisition_action');return {data:json((await f.db.query('select * from apply_acquisition_action($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[
        args.p_organisation_id,args.p_item_id,args.p_actor_user_id,args.p_expected_status,args.p_action,args.p_new_status,args.p_outcome,args.p_note,args.p_idempotency_key,args.p_marks_actioned])).rows)};
    }catch(error){return {error};}}};
    const common={'@/lib/supabaseAdmin':{supabaseAdmin:db},'@/lib/tenantAuth':{requireOrganisation:async(org)=>{assert.equal(org,A);return {organisationId:A,userId:USER};},accessErrorResponse:()=>null},
      'next/server':{NextResponse:{json:(body,options)=>({body,status:options?.status||200})}}};
    const helper=load('lib/acquisitionPromotion.server.ts',common);
    const action=load('app/api/growth/acquisition/[id]/action/route.ts',{...common,'@/lib/acquisitionPromotion.server':helper});
    const queue=load('app/api/growth/acquisition/route.ts',common);
    const post=body=>action.POST({json:async()=>({organisationId:A,idempotencyKey:randomUUID(),...body})},{params:Promise.resolve({id:item.id})});
    assert.equal((await post({action:'accept'})).body.item.status,'accepted');
    const selected=async()=>queue.GET({url:`https://ops.test/api/growth/acquisition?organisationId=${A}&itemId=${item.id}`});
    const state=[];let index=0,destination;
    const react={useState(initial){const i=index++;if(!(i in state))state[i]=typeof initial==='function'?initial():initial;return [state[i],v=>state[i]=typeof v==='function'?v(state[i]):v];},useEffect(){},useCallback:fn=>fn};
    let finished;const navigated=new Promise(resolve=>finished=resolve);
    const Page=load('app/dashboard/growth/acquisition/page.tsx',{react},{crypto:{randomUUID},window:{location:{href:'https://ops.test/dashboard/growth/acquisition?record_type=b2b_lead',search:'?record_type=b2b_lead',assign:url=>{destination=url;finished();}}},
      fetch:async(_url,options)=>{const result=options?.method==='POST'?await post(JSON.parse(options.body)):await selected();return {ok:result.status===200,json:async()=>result.body};}}).default;
    const render=()=>{index=0;return Page();};render();state[1]=A;state[2]=false;state[4]=(await selected()).body.items;state[7]=1;state[12]=item.id;
    nodes(render(),'button').find(n=>n.props.children==='Start outreach').props.onClick();
    let timer;try {await Promise.race([navigated,new Promise((_,reject)=>timer=setTimeout(()=>reject(Error('UI did not navigate after promotion')),5000))]);}finally{clearTimeout(timer);}
    const url=new URL(destination,'https://ops.test'),targetId=url.searchParams.get('targetId');assert.ok(targetId);
    const targets=(await f.db.query('select * from growth_targets')).rows;assert.equal(targets.length,1);assert.equal(targets[0].id,targetId);assert.equal(targets[0].last_action_at,null);
    assert.equal((await selected()).body.items[0].outreachTargetId,targetId);
    const pipeline=load('app/api/growth/pipeline/route.ts',{...common,'@/lib/tenantRoute.server':{withTenantRoute:fn=>req=>fn(req,{organisationId:A})},
      '@/lib/lifecycleSnapshot.server':{readLifecycleInput:async()=>({growth_targets:json((await f.db.query('select * from growth_targets where organisation_id=$1',[A])).rows),
        acquisition_items:json((await f.db.query('select * from acquisition_items where organisation_id=$1',[A])).rows),inbox_items:[]})}});
    const response=await pipeline.GET({url:`https://ops.test/api/growth/pipeline?targetId=${targetId}`});assert.equal(response.status,200);
    const target=response.body.data[0];assert.equal(target.id,targetId);assert.equal(target.lifecycle.currentStage,'outreach_ready');assert.equal(target.lifecycle.actionRecord.id,targetId);
    const Manual=()=>null;index=0;
    const Workspace=load('app/dashboard/growth/pipeline/OutreachWorkspace.tsx',{react,'@/lib/tenantFetch':{},'../../components/ManualTakeover':{__esModule:true,default:Manual}}).default;
    state.length=0;const view=Workspace({target,onComplete:async()=>{}});
    assert.equal(nodes(view,'button').some(n=>n.props.children==='Prepare first message'),false);
    assert.match(JSON.stringify(view),/Source prepared message \(monitor only\)/);assert.equal(nodes(view,Manual).length,0);
    assert.match(JSON.stringify(view),/Automated outreach owned by Root B2B engine/);
    assert.doesNotMatch(JSON.stringify(view),/No calls booked yet/);
    assert.equal((await post({action:'prepare_outreach'})).body.targetId,targetId);
    assert.equal((await f.db.query('select count(*)::int n from acquisition_item_events')).rows[0].n,2);
    assert.equal((await f.db.query('select count(*)::int n from growth_targets')).rows[0].n,1);
  }finally{await f.db.close();}
});
