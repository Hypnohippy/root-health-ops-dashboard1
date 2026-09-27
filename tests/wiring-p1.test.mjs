import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { PGlite } from "@electric-sql/pglite";
function load(file,deps={},globals={}){const mod={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:mod,exports:mod.exports,URL,URLSearchParams,Date,...globals,require:n=>{assert.ok(n in deps,`Unexpected dependency: ${n}`);return deps[n];}});return mod.exports;}
const outreach=load("lib/growthOutreach.ts"), engine=load("lib/engineState.ts");
const lifecycle=load("lib/contactLifecycle.ts",{"@/lib/growthOutreach":outreach,"@/lib/engineState":engine});
const due=load("lib/growthDue.server.ts",{"@/lib/contactLifecycle":lifecycle,"@/lib/growthOutreach":outreach,"@/lib/lifecycleSnapshot.server":{}});
const csv=load("lib/targetImport.ts",{"@/lib/contactLifecycle":lifecycle});
const metrics=load("lib/replyMetrics.server.ts",{"@/lib/supabaseAdmin":{}});
const A="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",B="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",ID="cccccccc-cccc-4ccc-8ccc-cccccccccccc",KEY="dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const input=(changes={})=>({acquisition_items:[],inbox_items:[],growth_targets:[],...changes});
const target=(changes={})=>({id:ID,organisation_id:A,target_name:"Jane Doe",company:"Example",email:"jane@example.com",stage:"day3_dm",status:"active",last_action_at:"2020-01-01",...changes});
test("Growth uses current lifecycle: meeting/converted/lost/engaged/nurture suppress prompts",()=>{
 for(const deal_stage of ["meeting","converted","lost","engaged"]){assert.equal(due.lifecycleDueTargets(A,input({growth_targets:[target({deal_stage})]})).length,0);}
 assert.equal(due.lifecycleDueTargets(A,input({growth_targets:[target({stage:"parked"})]})).length,0);
 assert.equal(due.lifecycleDueTargets(A,input({growth_targets:[target({reply_status:"no_reply"})]})).length,1);
 assert.equal(due.lifecycleDueTargets(A,input({growth_targets:[target({organisation_id:B})]})).length,0);
});
test("new inbox reply or acknowledgement suppresses cadence before database reconciliation",()=>{
 for(const classification of ["question","auto_acknowledgement"]){
 const data=input({growth_targets:[target()],inbox_items:[{id:KEY,organisation_id:A,platform:"email",kind:"email_reply",sender_email:"jane@example.com",email_classification:classification,response_state:"needs_reply",created_at_platform:"2026-01-01"}]});
 assert.equal(due.lifecycleDueTargets(A,data).length,0);
 }
});
test("CSV reuses LinkedIn/email/person+organisation identity and repeated imports are no-ops",()=>{
 for(const [existing,incoming] of [
  [target(),{target_name:"Jane Doe",email:"JANE@EXAMPLE.COM"}],
  [target({linkedin_url:"https://linkedin.com/in/jane"}),{target_name:"Jane",linkedin_url:"https://www.linkedin.com/in/JANE/?trk=test"}],
  [target({email:null}),{target_name:"  JANE  DOE ",company:"EXAMPLE"}]
 ]){const plan=csv.planTargetImport(A,input({growth_targets:[existing]}),[incoming]);assert.equal(plan.inserts.length,0);assert.equal(plan.duplicates,1);}
 const records=[{target_name:"New Person",company:"Shop",email:"new@shop.test"},{target_name:"New Person",company:"Shop",email:"NEW@SHOP.TEST"}];
 const first=csv.planTargetImport(A,input(),records);assert.equal(first.inserts.length,1);assert.equal(first.duplicates,1);
 const second=csv.planTargetImport(A,input({growth_targets:first.inserts.map(r=>({...r,id:ID,organisation_id:A}))}),records);assert.equal(second.inserts.length,0);assert.equal(second.duplicates,2);
 assert.equal(csv.planTargetImport(A,input({growth_targets:[target({organisation_id:B})]}),[{target_name:"Jane",email:"jane@example.com"}]).inserts.length,1);
});
test("ambiguous identities are skipped and CSV quoting preserves organisation identity",()=>{
 assert.equal(csv.planTargetImport(A,input(),[{target_name:"Only Name"}]).skippedAmbiguous,1);
 const plan=csv.planTargetImport(A,input({growth_targets:[target({linkedin_url:"https://linkedin.com/in/other"})]}),[{target_name:"Jane",email:"jane@example.com",linkedin_url:"https://linkedin.com/in/jane"}]);assert.equal(plan.skippedAmbiguous,1);
 const rows=csv.parseTargetCSV('Name,Company,Email\r\n"Doe, Jane","Example, Ltd",jane@example.com');assert.equal(rows[0].Name,"Doe, Jane");assert.equal(rows[0].Company,"Example, Ltd");
 assert.throws(()=>csv.parseTargetCSV('Name,Company\n"Jane,Example'),/unterminated/);
});
test("reply metrics count actual evidence once and exclude attempts/status-only/acceptances",()=>{
 const rows=[{id:"sent",platform:"email",email_delivery_status:"sent",email_sent_at:"2026-01-02"},{id:"sent",platform:"email",manual_completion:{completed_at:"2026-01-02",evidence:"receipt"}},{id:"attempt",platform:"email",email_delivery_status:"accepted"},{id:"label",status:"replied"},{id:"social",platform:"facebook",last_replied_at:"2026-01-03",last_reply_text:"Real response"},{id:"acceptance",kind:"connection_accepted",manual_completion:{completed_at:"2026-01-03",evidence:"receipt"}},{id:"old",platform:"instagram",last_replied_at:"2025-01-01",last_reply_text:"old"}];
 assert.equal(metrics.countConfirmedReplies(rows,new Date("2026-01-01"),new Date("2026-02-01")),2);
});
test("missing reply evidence is unavailable, not invented zero; read is tenant scoped",async()=>{
 let scoped=false;const q={select(){return q;},eq(k,v){assert.equal(k,"organisation_id");assert.equal(v,A);scoped=true;return q;},order(){return q;},range(){return {data:null,error:{message:"missing relation"}};}};
 const api=load("lib/replyMetrics.server.ts",{"@/lib/supabaseAdmin":{supabaseAdmin:{from:()=>q}}});assert.equal(await api.readConfirmedReplyCount(A,null,null),null);assert.ok(scoped);
});
test("deal updates preserve missing/zero values and cannot write another tenant",async()=>{
 for(const [value,expected] of [[undefined,null],["",null],[null,null],[0,0],["250",250]]){
 let patch;const q={update(v){patch=v;return q;},eq(k,v){if(k==="organisation_id")assert.equal(v,A);return q;},then(resolve){return Promise.resolve({error:null}).then(resolve);}};
 const route=load("app/api/growth/update-deal/route.ts",{"next/server":{NextResponse:{json:(body,o)=>({body,status:o?.status||200})}},"@/lib/tenantRoute.server":{withTenantRoute:fn=>req=>fn(req,{organisationId:A})},"@/lib/supabaseAdmin":{supabaseAdmin:{from:()=>q}}});
 assert.equal((await route.POST({json:async()=>({id:ID,deal_value:value})})).status,200);assert.equal(patch.deal_value,expected);
 }
});
test("legacy social writer fails closed; it cannot write a parallel store or call a provider",async()=>{
 const route=load("app/api/social/responses/sync-meta/route.ts",{"next/server":{NextResponse:{json:(body,o)=>({body,status:o?.status||200})}},"@/lib/tenantAuth":{requirePublishingOrganisation:async(req,org)=>{assert.equal(org,A);},accessErrorResponse:()=>null}});
 const result=await route.POST({url:`https://ops/api/social/responses/sync-meta?organisationId=${A}`});assert.equal(result.status,410);assert.equal(result.body.canonicalRoute,"/api/responses/pull");
});
test("Personal capacity check and signup start stay distinct from conversion",()=>{
 const state={status:null,reply_state:null,approval_state:null,next_action:null,next_follow_up_at:null,follow_up_status:null,last_inbound_at:null,last_outbound_at:null,last_follow_up_at:null};
 for(const status of ["capacity_check_completed","signup_started"]){assert.equal(engine.projectEngineState({...state,status,conversions:"10"}).stage,"actioned");}
 assert.equal(engine.projectEngineState({...state,status:"signup_complete"}).stage,"converted");
 const config=JSON.parse(fs.readFileSync("docs/google-engine-state-personal.config.json","utf8"));assert.ok(config.sheets.every(s=>s.pending?.length));
});
async function database(){const db=new PGlite();await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
create table organisations(id uuid primary key);insert into organisations values('${A}'),('${B}');
create table acquisition_items(id uuid primary key,organisation_id uuid references organisations(id),status text,metadata jsonb default '{}'::jsonb);
create table inbox_items(id uuid primary key,organisation_id uuid references organisations(id),platform text,kind text,status text,response_state text,follow_up_at timestamptz);
create table growth_targets(id uuid primary key default gen_random_uuid(),organisation_id uuid references organisations(id),target_name text,company text,role_title text,linkedin_url text,linkedin_identity text,notes text,stage text,status text,lead_quality text,last_action_at timestamptz,reply_status text,replied_at timestamptz,deal_stage text,source_type text,source_record_id text);
create unique index growth_identity on growth_targets(organisation_id,linkedin_identity) where linkedin_identity is not null;`);
for(const file of ['20260924100000_actionable_acquisition_queue.sql','20260924210000_lifecycle_reconciliation.sql','20260927100000_acquisition_handoff.sql','20260927110000_canonical_target_import.sql'])await db.exec(fs.readFileSync('supabase/migrations/'+file,'utf8'));return db;}
test("SQL handoff: atomic destination evidence, failed write rolls back, retry creates one event, foreign tenant denied",async()=>{
 const db=await database();try{
 await db.exec(`insert into acquisition_items(id,organisation_id,status) values('${ID}','${A}','accepted')`);
 const apply=(org,key,note=null)=>db.query("select * from apply_acquisition_action($1,$2,$3,'accepted','route_outreach','actioned',null,$4,$5,true)",[org,ID,A,note,key]);
 await assert.rejects(apply(B,KEY),/not_found/);
 await db.exec("alter table acquisition_item_events add constraint test_failure check(note is distinct from 'reject')");
 await assert.rejects(apply(A,KEY,"reject"),/test_failure/);
 const unchanged=(await db.query(`select * from acquisition_items where id='${ID}'`)).rows[0];assert.equal(unchanged.status,"accepted");assert.equal(unchanged.metadata.handoff,undefined);
 const row=(await apply(A,KEY)).rows[0];assert.equal(row.status,"actioned");assert.equal(row.metadata.handoff.destination,"/dashboard/growth/pipeline");assert.equal(row.metadata.handoff.idempotency_key,KEY);
 await apply(A,KEY);assert.equal((await db.query("select count(*)::int as n from acquisition_item_events")).rows[0].n,1);
 }finally{await db.close();}
});
test("SQL CSV import serializes stale plans, is atomic and never accepts tenant fields",async()=>{
 const db=await database();try{
 const rows=[{target_name:"Jane",email:"jane@example.com",company:"Example"}];
 const write=(org,rev,value)=>db.query("select import_canonical_targets($1,$2,$3) as result",[org,rev,JSON.stringify(value)]);
 assert.equal((await write(A,0,rows)).rows[0].result.inserted,1);
 assert.equal((await write(A,0,rows)).rows[0].result.stale,true);
 const records=(await db.query("select * from growth_targets")).rows;
 assert.equal(csv.planTargetImport(A,input({growth_targets:records}),rows).duplicates,1);
 await assert.rejects(write(B,0,[{...rows[0],organisation_id:A}]),/invalid_target/);
 assert.equal((await db.query("select count(*)::int as n from growth_targets")).rows[0].n,1);
 await db.exec("set role authenticated");await assert.rejects(write(A,1,rows),/permission denied/);
 }finally{await db.close();}
});

test("canonical Facebook pull stores tenant-scoped Responses evidence and preserves handled state", async () => {
 const records=new Map(); let optionsSeen;
 const q={select(){return q;},eq(k,v){if(k==='organisation_id')assert.equal(v,A);return q;},then(resolve){resolve({data:[{platform:'facebook',page_id:'page',page_access_token:'fixture'}]});},upsert(rows,options){optionsSeen=options;for(const row of rows){assert.equal(row.organisation_id,A);if(!records.has(row.external_id))records.set(row.external_id,{...row,id:ID});}return Promise.resolve({error:null});}};
 const route=load('app/api/responses/pull/route.ts',{'next/server':{NextResponse:{json:body=>body}},'../../../../lib/supabaseAdmin':{supabaseAdmin:{from:table=>{assert.ok(['social_accounts','inbox_items'].includes(table));return q;}}},'@/lib/linkedinActivityCoverage':{},'@/lib/tenantAuth':{requireOrganisation:async()=>({organisationId:A}),accessErrorResponse:()=>null}}, {fetch:async url=>({ok:true,json:async()=>url.includes('/feed?')?{data:[{id:'post',message:'Public discussion',permalink_url:'https://facebook.com/page/posts/post'}]}:url.includes('/comments?')?{data:[{id:'comment',message:'A public question',from:{name:'Alex'},permalink_url:'https://facebook.com/page/posts/post?comment_id=comment'}]}:{}})});
 await route.POST({json:async()=>({organisationId:A})});
 assert.equal(records.size,1);const row=records.get('comment');assert.equal(row.raw._rootops_source,'official_comment_pull');assert.equal(row.status,'needs_reply');
 row.status='replied';await route.POST({json:async()=>({organisationId:A})});
 assert.equal(records.size,1);assert.equal(row.status,'replied');assert.equal(optionsSeen.ignoreDuplicates,true);assert.equal(optionsSeen.onConflict,'organisation_id,platform,external_id');
});

test("CSV retries replan against current identity evidence after a concurrent import", async () => {
 let reads=0,calls=0;
 const incoming={target_name:'Jane',email:'jane@example.com'};
 const q={select(){return q;},eq(k,v){assert.equal(v,A);return q;},maybeSingle:async()=>({data:{revision:reads},error:null})};
 const service=load('lib/targetImport.server.ts',{'@/lib/supabaseAdmin':{supabaseAdmin:{from:()=>q,rpc:async(name,args)=>{assert.equal(name,'import_canonical_targets');assert.equal(args.p_organisation_id,A);calls++;if(calls===1){assert.equal(args.p_rows.length,1);return {data:{stale:true}};}assert.equal(args.p_rows.length,0);return {data:{inserted:0,stale:false}};}}},'@/lib/lifecycleSnapshot.server':{readLifecycleInput:async org=>{assert.equal(org,A);return input({growth_targets:reads++===0?[]:[target()]});}},'@/lib/targetImport':csv});
 const result=await service.importTargets(A,[incoming]);assert.equal(result.imported,0);assert.equal(result.duplicates,1);assert.equal(calls,2);
});

test("bare Mark Actioned cannot claim completion without a destination handoff",()=>{
 const workflow=load('lib/acquisitionWorkflow.ts');
 for(const type of ['personal_opportunity','social_opportunity']) assert.throws(()=>workflow.planAcquisitionAction(type,'accepted','mark_actioned'),/not allowed/);
});
