import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { PGlite } from "@electric-sql/pglite";
function load(file, deps = {}) {
 const mod = { exports: {} };
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,"utf8"), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
 {module:mod,exports:mod.exports,URL,URLSearchParams,require:name=>{assert.ok(name in deps, `Unexpected dependency/send path ${name}`);return deps[name];}});
 return mod.exports;
}
const sendEvidence=load("lib/linkedinSendEvidence.ts");
const outreach=load("lib/growthOutreach.ts",{"@/lib/linkedinSendEvidence":sendEvidence}), engine=load("lib/engineState.ts");
const lifecycle=load("lib/contactLifecycle.ts",{"@/lib/growthOutreach":outreach,"@/lib/engineState":engine});
const governor=load("lib/operationalGovernor.ts",{"@/lib/growthOutreach":outreach,"@/lib/contactLifecycle":lifecycle});
const reconciliation=load("lib/lifecycleReconciliation.ts",{"@/lib/growthOutreach":outreach,"@/lib/contactLifecycle":lifecycle});
const A="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",B="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",ID="cccccccc-cccc-4ccc-8ccc-cccccccccccc",T="dddddddd-dddd-4ddd-8ddd-dddddddddddd",K="eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",K2="ffffffff-ffff-4fff-8fff-ffffffffffff";
const input=(parts={})=>({acquisition_items:[],inbox_items:[],growth_targets:[],...parts});
const row=(fields={})=>({id:ID,organisation_id:A,linkedin_identity:"linkedin.com/in/test",...fields});
const acceptance=()=>row({platform:"linkedin",kind:"connection_accepted",author_name:"Test",status:"needs_reply",response_state:"needs_reply"});
const target=()=>row({id:T,target_name:"Test",stage:"day3_followup",status:"active",last_action_at:"2020-01-01"});

test("governor exposes five states and never confuses intentional human work with failure",()=>{
 for(const state of ["running","scheduled","waiting","completed","blocked"])assert.equal(governor.governorDecision({operationalState:state}).state,state);
 for(const [reason,expected] of [["by_design","human_by_design"],["automation_unavailable","automation_unavailable"],["automation_failed","automation_failed"]]){
 const result=governor.governorDecision({operationalState:"human_action_required",humanReason:reason,nextAction:"review"});assert.equal(result.state,"waiting");assert.equal(result.reason,expected);assert.equal(result.mayAutoExecute,false);
 }
});
test("manual LinkedIn completion uses existing lifecycle and reconciliation; repeated event cannot restart outreach",()=>{
 const data=input({inbox_items:[acceptance()]});const p=governor.planManualCompletion(A,data,"inbox_items",ID);assert.equal(p.allowed,true);
 Object.assign(data.inbox_items[0],p.patch,{last_replied_at:"2026-01-01",contacted_at:"2026-01-01",manual_completion:{key:K}});
 assert.equal(governor.planManualCompletion(A,data,"inbox_items",ID).allowed,false);
 const repairs=reconciliation.planLifecycleReconciliation(A,data).repairs;assert.ok(repairs.some(r=>r.table==="growth_targets"&&r.patch.stage==="day3_followup"));
});
test("human reply suppresses pending followup; commercial evidence and Personal gates stay closed",()=>{
 const data=input({growth_targets:[target()],inbox_items:[row({platform:"email",kind:"email_reply",response_state:"needs_reply",email_classification:"question",created_at_platform:"2026-01-01"})]});
 assert.equal(governor.planManualCompletion(A,data,"growth_targets",T).allowed,false);
 assert.ok(reconciliation.planLifecycleReconciliation(A,data).repairs.some(r=>r.table==="growth_targets"&&r.patch.status==="parked"));
 for(const deal_stage of ["meeting","converted","lost"]){const d=input({growth_targets:[{...target(),deal_stage}]});assert.equal(governor.planManualCompletion(A,d,"growth_targets",T).allowed,false);assert.equal(lifecycle.buildContactLifecycle(A,d)[0].currentStage,deal_stage);}
 const personal=input({inbox_items:[acceptance()],acquisition_items:[row({id:T,source_engine:"root_health_personal",status:"accepted"})]});assert.match(governor.planManualCompletion(A,personal,"inbox_items",ID).reason,/Personal/);
 assert.throws(()=>governor.planManualCompletion(B,data,"inbox_items",ID),/Record not found/);
});
test("early manual cadence completion allowed, but paused, replied, uncertain delivery and unsupported DMs are not",()=>{
 assert.equal(governor.planManualCompletion(A,input({growth_targets:[{...target(),last_action_at:new Date().toISOString()}]}),"growth_targets",T).allowed,true);
 for(const status of ["approved","dispatching"]){assert.equal(governor.planManualCompletion(A,input({inbox_items:[row({platform:"email",status:"needs_reply",email_delivery_status:status})]}),"inbox_items",ID).allowed,false);}
 assert.equal(governor.planManualCompletion(A,input({inbox_items:[row({platform:"instagram",kind:"dm",status:"needs_reply"})]}),"inbox_items",ID).allowed,false);
});
async function database(){
 const db=new PGlite();await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create table organisations(id uuid primary key);insert into organisations values('${A}'),('${B}');
 create table acquisition_items(id uuid primary key,organisation_id uuid references organisations(id),status text);
 create table inbox_items(id uuid primary key,organisation_id uuid references organisations(id),platform text,kind text,status text,response_state text,follow_up_at timestamptz,last_replied_at timestamptz,last_reply_text text,email_delivery_status text);
 create table growth_targets(id uuid primary key default gen_random_uuid(),organisation_id uuid references organisations(id),target_name text,company text,linkedin_url text,linkedin_identity text,stage text,status text,last_action_at timestamptz,reply_status text,replied_at timestamptz,deal_stage text,source_type text,source_record_id text);
 create unique index growth_identity on growth_targets(organisation_id,linkedin_identity) where linkedin_identity is not null;
 create table email_send_requests(id uuid default gen_random_uuid(),organisation_id uuid,inbox_item_id uuid,status text);
 create table response_item_events(organisation_id uuid,inbox_item_id uuid,actor_user_id uuid,action text,previous_state text,new_state text,note text,idempotency_key uuid,unique(inbox_item_id,idempotency_key));`);
 await db.exec(fs.readFileSync("supabase/migrations/20260924210000_lifecycle_reconciliation.sql","utf8"));
 await db.exec(fs.readFileSync("supabase/migrations/20260926100000_manual_completion_recovery.sql","utf8"));return db;
}
async function revision(db){return (await db.query("select revision from lifecycle_revisions where organisation_id=$1",[A])).rows[0]?.revision||0;}
async function complete(db,table,id,patch,key=K,rev=null,org=A){return db.query("select record_manual_completion($1,$2,$3,$4,$5,$6,$7,$8,$9) as receipt",[org,A,table,id,rev??await revision(db),key,"2026-01-01","Verified provider receipt",JSON.stringify(patch)]);}
const inboxPatch={status:"replied",response_state:"engaged",last_reply_text:"Actual public response"};
test("real SQL: manual email after failure is atomic, retry-safe, tenant-scoped and blocks Phase4D redispatch",async()=>{
 const db=await database();try{
 await db.exec(`insert into inbox_items(id,organisation_id,platform,kind,status,response_state,email_delivery_status) values('${ID}','${A}','email','email_reply','needs_reply','needs_reply','failed');insert into email_send_requests(organisation_id,inbox_item_id,status) values('${A}','${ID}','failed');`);
 const rev=await revision(db);await assert.rejects(complete(db,"inbox_items",ID,inboxPatch,K,rev,B),/record_not_found/);
 await assert.rejects(complete(db,"inbox_items",ID,inboxPatch,K,Number(rev)+1),/stale_manual_plan/);
 await complete(db,"inbox_items",ID,inboxPatch,K,rev);
 assert.equal((await complete(db,"inbox_items",ID,inboxPatch,K,rev)).rows[0].receipt.duplicate,true);
 assert.equal((await db.query("select count(*)::int as n from response_item_events")).rows[0].n,1);
 await assert.rejects(db.exec(`update email_send_requests set status='dispatching' where inbox_item_id='${ID}'`),/manual_completion_prevents_repeat_delivery/);
 await assert.rejects(db.exec(`insert into email_send_requests(organisation_id,inbox_item_id,status) values('${A}','${ID}','dispatching')`),/manual_completion_prevents_repeat_delivery/);
 await db.exec(`update inbox_items set status='needs_reply',response_state='follow_up',follow_up_at=now(),manual_completion=null where id='${ID}'`);
 const item=(await db.query(`select * from inbox_items where id='${ID}'`)).rows[0];assert.equal(item.status,"replied");assert.equal(item.response_state,"engaged");assert.equal(item.follow_up_at,null);assert.equal(item.email_delivery_status,"failed");assert.equal(item.manual_completion.key,K);
 await db.exec("set role authenticated");await assert.rejects(complete(db,"inbox_items",ID,inboxPatch,K,rev),/permission denied/);
 }finally{await db.close();}
});
test("real SQL: in-flight email cannot be declared complete; manual social survives older polling",async()=>{
 const db=await database();try{
 await db.exec(`insert into inbox_items(id,organisation_id,platform,kind,status,response_state,email_delivery_status) values('${ID}','${A}','email','email_reply','needs_reply','needs_reply','dispatching');`);
 await assert.rejects(complete(db,"inbox_items",ID,inboxPatch),/already_handled_or_delivery_uncertain/);
 await db.exec(`update inbox_items set platform='facebook',kind='comment',email_delivery_status=null where id='${ID}'`);
 await complete(db,"inbox_items",ID,inboxPatch);
 await db.exec(`update inbox_items set status='needs_reply',response_state='needs_reply',last_reply_text=null,last_replied_at=null where id='${ID}'`);
 const item=(await db.query(`select * from inbox_items where id='${ID}'`)).rows[0];assert.equal(item.status,"replied");assert.equal(item.last_reply_text,inboxPatch.last_reply_text);
 await assert.rejects(complete(db,"inbox_items",ID,inboxPatch,K2),/already_handled_or_delivery_uncertain/);
 }finally{await db.close();}
});
test("real SQL: manual followup advances once, old receipt keys survive later completion, source regression blocked",async()=>{
 const db=await database();try{
 await db.exec(`insert into growth_targets(id,organisation_id,stage,status) values('${T}','${A}','connection','active')`);
 const rev=await revision(db);await complete(db,"growth_targets",T,{stage:"day3_followup",status:"active"},K,rev);
 assert.equal((await complete(db,"growth_targets",T,{stage:"day3_followup",status:"active"},K,rev)).rows[0].receipt.duplicate,true);
 await assert.rejects(db.exec(`update growth_targets set stage='connection' where id='${T}'`),/manual_completion_prevents_cadence_regression/);
 await complete(db,"growth_targets",T,{stage:"day7_parity",status:"active"},K2);
 assert.equal((await complete(db,"growth_targets",T,{stage:"day3_followup",status:"active"},K,rev)).rows[0].receipt.duplicate,true);
 assert.equal((await db.query(`select stage from growth_targets where id='${T}'`)).rows[0].stage,"day7_parity");
 await db.exec(`update growth_targets set stage='parked',status='parked',reply_status='engaged' where id='${T}'`);
 }finally{await db.close();}
});

function service(data, {eligible=true,rev="3"}={}) {
 const calls=[];
 const admin={from:table=>{assert.equal(table,"lifecycle_revisions");return {select:()=>({eq:(column,org)=>{assert.equal(column,"organisation_id");assert.equal(org,A);return {maybeSingle:async()=>({data:{revision:rev}})};}})};},rpc:async(name,args)=>{calls.push({name,args});return {data:{duplicate:false}};}};
 const api=load("lib/manualCompletion.server.ts",{"@/lib/lifecycleReconciliation.server":{reconcileLifecycle:async org=>{assert.equal(org,A);return {errors:[]};}},"@/lib/supabaseAdmin":{supabaseAdmin:admin},"@/lib/lifecycleSnapshot.server":{readLifecycleInput:async org=>{assert.equal(org,A);return data;}},"@/lib/operationalGovernor":governor,"@/lib/responseContactContext.server":{getResponseContactContext:async(org,id)=>{assert.equal(org,A);assert.equal(id,ID);return {socialOpportunity:{eligible,reason:"Safety evidence missing"}};}},"@/lib/organisationProfile.server":{getOrganisationGenerationProfile:async org=>{assert.equal(org,A);return {};}}});
 return {api,calls};
}
test("completion service rechecks public safety and current state before any write, with no send dependency",async()=>{
 const data=input({inbox_items:[row({platform:"facebook",kind:"comment",status:"needs_reply"})]});
 const blocked=service(data,{eligible:false});assert.equal((await blocked.api.prepareManualCompletion(A,"inbox_items",ID)).allowed,false);
 const request={table:"inbox_items",id:ID,revision:"3",key:K,completedAt:"2026-01-01",evidence:"Public reply URL",message:"Actual response"};
 await assert.rejects(blocked.api.completeManualAction(A,A,request),/Safety evidence/);assert.equal(blocked.calls.length,0);
 const ready=service(data);await ready.api.completeManualAction(A,A,request);assert.equal(ready.calls.length,1);assert.equal(ready.calls[0].name,"record_manual_completion");
 assert.equal(ready.calls[0].args.p_organisation_id,A);assert.equal(ready.calls[0].args.p_patch.status,"replied");
 const stale=service(data,{rev:"4"});await assert.rejects(stale.api.completeManualAction(A,A,request),/State changed/);assert.equal(stale.calls.length,0);
});
test("retry of an older receipt cannot advance the latest manual cadence",async()=>{
 const data=input({growth_targets:[{...target(),manual_completion:{key:K2,history:[{key:K}]}}]});const {api,calls}=service(data);
 assert.equal((await api.completeManualAction(A,A,{table:"growth_targets",id:T,key:K})).duplicate,true);assert.equal(calls.length,0);
});
test("unsupported comment capability routes to manual fallback rather than an automation failure",()=>{
 const home=load("lib/homeControl.ts",{"@/lib/contactLifecycle":lifecycle,"@/lib/connectionHealth":load("lib/connectionHealth.ts"),"@/lib/channelCapabilities":load("lib/channelCapabilities.ts")});
 const result=home.buildHomeControl(A,{...input({inbox_items:[row({platform:"facebook",kind:"comment",status:"needs_reply"})]}),scheduled_posts:[],social_accounts:[]});
 const item=result.items.find(i=>i.group!=="done");assert.equal(item.humanReason,"automation_unavailable");assert.ok(item.fallback);assert.equal(governor.governorDecision(item).mayAutoExecute,false);
});

test("manual API rejects foreign tenant access before reads or mutations",async()=>{
 const route=load("app/api/operations/manual-complete/route.ts",{
 "next/server":{NextResponse:{json:(body,options)=>({body,status:options?.status||200})}},
 "@/lib/tenantAuth":{requireOrganisation:async(org,write)=>{assert.equal(org,B);assert.equal(write,true);throw Error("denied");},accessErrorResponse:()=>({status:403})},
 "@/lib/manualCompletion.server":{prepareManualCompletion:()=>{throw Error("Must not read");},completeManualAction:()=>{throw Error("Must not write");}},
 "@/lib/growthIngestion.server":{uuid:/^[0-9a-f-]{36}$/}});
 assert.equal((await route.GET({url:`https://ops.example/api/operations/manual-complete?organisationId=${B}&table=inbox_items&id=${ID}`})).status,403);
 assert.equal((await route.POST({json:async()=>({organisationId:B})})).status,403);
});
test("real SQL: LinkedIn receipt preserves actual action time for the existing cadence",async()=>{
 const db=await database();try{
 await db.exec(`insert into inbox_items(id,organisation_id,platform,kind,status,response_state) values('${ID}','${A}','linkedin','connection_accepted','needs_reply','needs_reply')`);
 await complete(db,"inbox_items",ID,{...inboxPatch,response_state:"waiting_for_human"});
 const item=(await db.query(`select contacted_at,last_replied_at from inbox_items where id='${ID}'`)).rows[0];assert.equal(new Date(item.contacted_at).toISOString(),"2026-01-01T00:00:00.000Z");assert.equal(item.contacted_at.getTime?.()||item.contacted_at,item.last_replied_at.getTime?.()||item.last_replied_at);
 }finally{await db.close();}
});


test("absolute cadence migration preserves first-send anchor and history, backfills without invented sends",async()=>{
 const db=await database();
 try {
 await db.exec(fs.readFileSync("supabase/migrations/20261009100000_linkedin_absolute_cadence.sql","utf8"));
 await db.exec(`insert into growth_targets(id,organisation_id,target_name,stage,status) values('${T}','${A}','Person','connection','active');`);
 await complete(db,"growth_targets",T,{stage:"day3_followup",status:"active",last_reply_text:"Original hello"});
 let saved=(await db.query(`select * from growth_targets where id='${T}'`)).rows[0];
 assert.equal(saved.manual_completion.stage,"connection");assert.equal(saved.first_outbound_text,"Original hello");const first=saved.first_outbound_at;
 const repairs=[{id:T,patch:{stage:"day42_close",status:"active",first_outbound_at:first,first_outbound_text:"Original hello"}}];
 await db.query("select backfill_linkedin_cadence($1,$2,$3)",[A,await revision(db),JSON.stringify(repairs)]);
 saved=(await db.query(`select * from growth_targets where id='${T}'`)).rows[0];assert.equal(saved.stage,"day42_close");assert.equal(saved.manual_completion.message,"Original hello");assert.equal(saved.manual_completion.history.length,0);assert.equal(saved.first_outbound_at.toISOString(),first.toISOString());
 await complete(db,"growth_targets",T,{stage:"parked",status:"parked",last_reply_text:"I will leave it there"},K2);
 saved=(await db.query(`select * from growth_targets where id='${T}'`)).rows[0];assert.equal(saved.status,"parked");assert.equal(saved.manual_completion.stage,"day42_close");assert.equal(saved.manual_completion.history[0].message,"Original hello");assert.equal(saved.first_outbound_at.toISOString(),first.toISOString());assert.equal(saved.last_reply_text,"I will leave it there");
 await assert.rejects(db.query("select backfill_linkedin_cadence($1,$2,$3)",[A,await revision(db),JSON.stringify(repairs)]),/cadence_evidence_changed/);
 } catch(error) { throw new Error(JSON.stringify({message:error.message,detail:error.detail,where:error.where})); } finally {await db.close();}
});

test("real SQL: reconciliation appends immutable receipts, stores two clocks, blocks duplicates and preserves unknown state",async()=>{
 const db=await database();
 try {
  await db.exec(fs.readFileSync("supabase/migrations/20261009100000_linkedin_absolute_cadence.sql","utf8"));
  await db.exec(fs.readFileSync("supabase/migrations/20261009120000_linkedin_external_send_evidence.sql","utf8"));
  await db.query(`insert into growth_targets(id,organisation_id,stage,status,linkedin_identity) values($1,$2,'connection','active','linkedin.com/in/test')`,[T,A]);
  const run=async(key,details,org=A)=>{const rev=(await db.query(`select revision from lifecycle_revisions where organisation_id=$1`,[org])).rows[0]?.revision||0;return (await db.query(`select record_linkedin_send_evidence($1,$2,'growth_targets',$3,$4,$5,$6::jsonb) as result`,[org,A,T,rev,key,JSON.stringify(details)])).rows[0].result;};
  const base={message:"  Exact message\n",source:"Manually confirmed LinkedIn send",timezone:"Europe/London",precision:"time",sentStage:"connection"};
  const first=await run(K,{...base,choice:"now",correction:false});assert.ok(first.sentAt);assert.ok(first.confirmedAt);
  let row=(await db.query(`select * from growth_targets where id=$1`,[T])).rows[0];const original=row.manual_completion;
  assert.equal(original.sent_at,original.confirmed_at);assert.equal(original.message,base.message);
  const unknown=await run(K2,{...base,choice:"conversation",status:"unknown",correction:true,source:"Manually reconciled from LinkedIn history"});assert.equal(unknown.sentAt,null);
  row=(await db.query(`select * from growth_targets where id=$1`,[T])).rows[0];assert.equal(row.manual_completion.content_kind,"conversation_history_pasted");assert.equal(row.manual_completion.message,base.message);assert.equal(row.manual_completion.historical_send_date_status,"unknown");assert.equal(row.first_outbound_at,null);assert.equal(row.stage,"day3_followup");const {history: ignoredHistory,...originalWithoutHistory}=original;assert.deepEqual(row.manual_completion.history[0],originalWithoutHistory);
  const retry=await run(K2,{...base,choice:"unknown",correction:true});assert.equal(retry.duplicate,true);assert.equal((await db.query(`select manual_completion from growth_targets where id=$1`,[T])).rows[0].manual_completion.history.length,1);
  const old="2026-08-01T12:34:56.000Z";await run("99999999-9999-4999-8999-999999999999",{...base,choice:"conversation",status:"verified",earliestOutboundConfirmed:true,sentAt:old,correction:true});
  row=(await db.query(`select * from growth_targets where id=$1`,[T])).rows[0];assert.equal(new Date(row.first_outbound_at).toISOString(),old);assert.notEqual(row.manual_completion.sent_at,row.manual_completion.confirmed_at);assert.equal(row.manual_completion.history.length,2);assert.equal(row.manual_completion.history[0].key,K);
  await assert.rejects(run("88888888-8888-4888-8888-888888888888",{...base,choice:"now",correction:false},B),/record_not_found/);
 } finally {await db.close();}
});
