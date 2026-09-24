import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import ts from "typescript";
import { PGlite } from "@electric-sql/pglite";
const nodeRequire = createRequire(import.meta.url);
const A = "78fa2ac8-e7b6-4b9b-9604-035723ece6b1", B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ITEM_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", ITEM_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbc";
const USER = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
function load(file, mocks={}) {
  const mod={exports:{}};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText, {
    module:mod,exports:mod.exports,require:name=>name in mocks?mocks[name]:nodeRequire(name),URL,URLSearchParams,Request,Response,Headers,Buffer,console,process:{env:{}},
  },{filename:file}); return mod.exports;
}
const workflow=load("lib/acquisitionWorkflow.ts");
const response={NextResponse:{json:(body,opts={})=>({body,status:opts.status||200})}};

test("each opportunity type exposes only its intended review workflow destinations",()=>{
  const cases = [
    ["b2b_lead","prepare_outreach","/dashboard/growth/pipeline"], ["b2b_lead","route_outreach","/dashboard/growth/pipeline"],
    ["personal_opportunity","create_content_draft","/dashboard/brainstorm"], ["personal_opportunity","route_campaign","/dashboard/campaigns/new"], ["personal_opportunity","route_publishing","/dashboard"],
    ["partner_opportunity","prepare_outreach","/dashboard/growth/pipeline"], ["partner_opportunity","route_outreach","/dashboard/growth/pipeline"],
    ["social_opportunity","create_content_draft","/dashboard/brainstorm"], ["social_opportunity","route_publishing","/dashboard"], ["social_opportunity","route_responses","/dashboard/responses"],
  ];
  for(const [type,action,destination] of cases) {
    const plan=workflow.planAcquisitionAction(type,"accepted",action);
    assert.equal(plan.nextStatus,"actioned"); assert.equal(plan.destination,destination);
    const url=workflow.routeUrl(destination,A,ITEM_A); assert.ok(url.includes(`organisationId=${A}`)); assert.ok(url.includes(`acquisitionItemId=${ITEM_A}`));
  }
  assert.throws(()=>workflow.planAcquisitionAction("b2b_lead","accepted","route_publishing"),/not available/);
  assert.throws(()=>workflow.planAcquisitionAction("social_opportunity","accepted","route_outreach"),/not available/);
});

test("status transitions are constrained and terminal states cannot be reopened",()=>{
  assert.equal(workflow.planAcquisitionAction("b2b_lead","new","start_review").nextStatus,"reviewing");
  assert.equal(workflow.planAcquisitionAction("b2b_lead","new","accept").nextStatus,"accepted");
  assert.equal(workflow.planAcquisitionAction("b2b_lead","accepted","nurture").nextStatus,"nurture");
  assert.equal(workflow.planAcquisitionAction("b2b_lead","actioned","mark_engaged","Replied").nextStatus,"engaged");
  assert.equal(workflow.planAcquisitionAction("b2b_lead","engaged","mark_converted","Booked").outcome,"Booked");
  for(const terminal of ["converted","lost","dismissed"]) for(const action of ["accept","dismiss","nurture","mark_converted"])
    assert.throws(()=>workflow.planAcquisitionAction("b2b_lead",terminal,action),/not allowed/);
  assert.throws(()=>workflow.planAcquisitionAction("personal_opportunity","new","mark_actioned"),/not allowed/);
});

test("action API enforces write membership, tenant-scoped lookup and does not accept ingestion credentials",async()=>{
  for(const mode of ["anonymous","viewer","foreign","success"]) {
    const calls=[];
    const authError=mode==="anonymous"?Object.assign(new Error("Not signed in."),{status:401}):mode==="viewer"?Object.assign(new Error("Insufficient organisation role."),{status:403}):null;
    class AccessError extends Error { constructor(message,status){super(message);this.status=status;} }
    const auth={
      requireOrganisation:async(requested,write)=>{calls.push({kind:"auth",requested,write});if(authError)throw new AccessError(authError.message,authError.status);return {organisationId:A,userId:USER,role:"owner"};},
      accessErrorResponse:error=>error instanceof AccessError?response.NextResponse.json({error:error.message},{status:error.status}):null,
    };
    const item=mode==="foreign"?null:{id:ITEM_A,organisation_id:A,record_type:"b2b_lead",status:"new"};
    const db={from(table){const filters={};const query={select(){return query;},eq(k,v){filters[k]=v;return query;},async maybeSingle(){calls.push({kind:"read",table,filters});return {data:item,error:null};}};return query;},async rpc(name,args){calls.push({kind:"rpc",name,args});return {data:[{...item,status:"accepted"}],error:null};}};
    const route=load("app/api/growth/acquisition/[id]/action/route.ts",{"next/server":response,"@/lib/tenantAuth":auth,"@/lib/supabaseAdmin":{supabaseAdmin:db},"@/lib/growthIngestion.server":{uuid:/^[0-9a-f-]{36}$/i},"@/lib/acquisitionWorkflow":workflow});
    const request=new Request("https://ops.example/api/growth/acquisition/x/action",{method:"POST",headers:{"content-type":"application/json",authorization:"Bearer ingestion-secret"},body:JSON.stringify({organisationId:A,action:"accept",idempotencyKey:"dddddddd-dddd-4ddd-8ddd-dddddddddddd"})});
    const result=await route.POST(request,{params:Promise.resolve({id:ITEM_A})});
    assert.equal(result.status,mode==="anonymous"?401:mode==="viewer"?403:mode==="foreign"?404:200,mode);
    assert.ok(calls.some(c=>c.kind==="auth"&&c.requested===A&&c.write===true));
    if(mode!=="success") assert.equal(calls.some(c=>c.kind==="rpc"),false);
    if(mode==="foreign") assert.ok(calls.some(c=>c.kind==="read"&&c.filters.organisation_id===A));
  }
});

test("migration applies actions atomically, appends audit history and deduplicates retries",async()=>{
  const db=new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls; create table organisations(id uuid primary key); insert into organisations values('${A}'),('${B}');`);
    await db.exec(fs.readFileSync("supabase/migrations/20260923140000_acquisition_ingestion.sql","utf8"));
    await db.exec(fs.readFileSync("supabase/migrations/20260924100000_actionable_acquisition_queue.sql","utf8"));
    await db.query("insert into acquisition_items(id,organisation_id,source_engine,source_record_id,record_type) values($1,$2,'b2b','a','b2b_lead'),($3,$4,'social','b','social_opportunity')",[ITEM_A,A,ITEM_B,B]);
    const key="eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
    const apply=()=>db.query("select id,status,current_action,owner_user_id from apply_acquisition_action($1,$2,$3,'new','accept','accepted',null,'Reviewed',$4,false)",[A,ITEM_A,USER,key]);
    assert.equal((await apply()).rows[0].status,"accepted");
    assert.equal((await apply()).rows[0].status,"accepted");
    assert.equal((await db.query("select count(*)::int n from acquisition_item_events where acquisition_item_id=$1",[ITEM_A])).rows[0].n,1);
    assert.equal((await db.query("select previous_status,new_status,actor_user_id from acquisition_item_events where acquisition_item_id=$1",[ITEM_A])).rows[0].previous_status,"new");
    await assert.rejects(db.query("select * from apply_acquisition_action($1,$2,$3,'new','accept','accepted',null,null,$4,false)",[A,ITEM_B,USER,"ffffffff-ffff-4fff-8fff-ffffffffffff"]),/not_found/);
    await assert.rejects(db.query("select * from apply_acquisition_action($1,$2,$3,'new','accept','accepted',null,null,$4,false)",[A,ITEM_A,USER,"11111111-1111-4111-8111-111111111111"]),/changed/);
    await db.exec("set role authenticated"); await assert.rejects(db.query("select * from acquisition_item_events"),/permission denied/);
  } finally {await db.close();}
});

test("queue UI offers prepared drafts but contains no send, publish or public-reply API call",()=>{
  const ui=fs.readFileSync("app/dashboard/growth/acquisition/page.tsx","utf8");
  for(const type of ["b2b_lead","personal_opportunity","partner_opportunity","social_opportunity"]) assert.ok(ui.includes(type));
  for(const key of ["prepared_outreach","outreach_draft","prepared_draft","content_draft","reply_draft"]) assert.ok(ui.includes(key));
  assert.equal(/fetch\([^\n]*(publish|reply|send)|\/api\/(quick-blast|publish|responses)/i.test(ui),false);
  assert.ok(ui.includes("Nothing here sends, publishes or replies automatically."));
  assert.ok(ui.includes('min-h-[78px]'));
  assert.ok(ui.includes("expandedId===item.id"));
  assert.ok(ui.includes('bg-slate-950 text-slate-100'));
  assert.equal(/className="[^"]*bg-white(?:\s|\")/.test(ui),false);
  assert.ok(ui.includes('<option key={s} value={s}>{title(s)}</option>'));
  assert.ok(ui.includes('setItems([]);setTotal(0);setStatus(e.target.value)'));
  assert.match(ui,/catch\(e\)\{if\(!signal\?\.aborted\)\{setItems\(\[\]\);setTotal\(0\);setError/);
});
