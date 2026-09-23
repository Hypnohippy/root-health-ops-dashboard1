import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import ts from "typescript";
import { PGlite } from "@electric-sql/pglite";
const require = createRequire(import.meta.url);
const A = "78fa2ac8-e7b6-4b9b-9604-035723ece6b1", B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const secret = "a".repeat(40);
const env = {GROWTH_INGESTION_KEYS: JSON.stringify([{organisation_id:A,secret,source_engines:["b2b","personal"]}])};
function load(file, mocks={}, environment=env) {
  const mod={exports:{}};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText, {
    module:mod,exports:mod.exports, require:n=>mocks[n] || require(n),process:{env:environment},Buffer,URL,console,
  });return mod.exports;
}
const helper=load("lib/growthIngestion.server.ts");
const response={NextResponse:{json:(body,opts={})=>({body,status:opts.status||200})}};
const record={source_engine:"b2b",source_record_id:"stable-1",record_type:"b2b_lead",company:"Example",source_url:"https://example.com/evidence",evidence:"Source excerpt",reason:"Relevant signal",suggested_action:"Review manually"};
const req=(body,token=secret)=>new Request("https://ops.example/api/growth/ingest",{method:"POST",headers:{"content-type":"application/json",authorization:`Bearer ${token}`},body:JSON.stringify(body)});

test("ingestion rejects missing/foreign organisation, wrong secrets, sources and configuration before writes", async()=>{
  for(const [body,token,status] of [
    [{records:[record]},secret,400], [{organisation_id:B,records:[record]},secret,403],
    [{organisation_id:A,records:[record]},"",403], [{organisation_id:A,records:[{...record,source_engine:"other"}]},secret,403],
    [{organisation_id:A,records:[{...record,organisation_id:B}]},secret,400],
  ]) {
    const route=load("app/api/growth/ingest/route.ts",{"next/server":response,"@/lib/growthIngestion.server":helper,"@/lib/supabaseAdmin":{supabaseAdmin:{from(){throw Error("Must not query");}}}});
    assert.equal((await route.POST(req(body,token))).status,status);
  }
  for(const config of [undefined,"[]","invalid",JSON.stringify([{organisation_id:A,secret:"short",source_engines:["b2b"]}])]) {
    const h=load("lib/growthIngestion.server.ts",{},{GROWTH_INGESTION_KEYS:config});
    assert.throws(()=>h.authorizeIngestion(`Bearer ${secret}`,A,["b2b"]),e=>e.status===503);
  }
});

test("validates all four record types, safe URLs, metadata, status and bounded requests",async()=>{
  for(const record_type of ["b2b_lead","personal_opportunity","partner_opportunity","social_opportunity"]) assert.equal(helper.parseIngestion({organisation_id:A,records:[{...record,record_type}]}).records[0].record_type,record_type);
  for(const patch of [{record_type:"post"},{status:"sent"},{source_url:"javascript:alert(1)"},{source_url:"https://user:pass@example.com"},{metadata:[]},{source_record_id:""}]) assert.throws(()=>helper.parseIngestion({organisation_id:A,records:[{...record,...patch}]}));
  assert.throws(()=>helper.parseIngestion({organisation_id:A,records:Array(101).fill(record)}));
  await assert.rejects(helper.readIngestionBody(req({text:"a".repeat(262145)})),e=>e.status===413);
});

test("real migration and ingestion preserve first record on retry and isolate tenant/engine dedupe",async()=>{
  const db=new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls; create table organisations(id uuid primary key); insert into organisations values('${A}'),('${B}');`);
    await db.exec(fs.readFileSync("supabase/migrations/20260923140000_acquisition_ingestion.sql","utf8"));
    const admin={from(table){assert.equal(table,"acquisition_items");return {upsert(rows,options){assert.equal(options.ignoreDuplicates,true);assert.equal(options.onConflict,"organisation_id,source_engine,source_record_id");return {async select(){const keys=Object.keys(rows[0]);const result=await db.query(`insert into acquisition_items (${keys.join(",")}) select ${keys.join(",")} from jsonb_populate_recordset(null::acquisition_items, $1::jsonb) on conflict (organisation_id,source_engine,source_record_id) do nothing returning id`,[JSON.stringify(rows)]);return {data:result.rows,error:null};}};}};}};
    const route=load("app/api/growth/ingest/route.ts",{"next/server":response,"@/lib/growthIngestion.server":helper,"@/lib/supabaseAdmin":{supabaseAdmin:admin}});
    assert.equal((await route.POST(req({organisation_id:A,records:[record,record]}))).body.inserted,1);
    const retry=await route.POST(req({organisation_id:A,records:[{...record,status:"dismissed",company:"Changed"}]}));
    assert.equal(retry.body.duplicates,1);
    assert.equal((await db.query("select company from acquisition_items")).rows[0].company,"Example");
    await db.query("insert into acquisition_items (organisation_id,source_engine,source_record_id,record_type) values ($1,'b2b','stable-1','b2b_lead'),($2,'personal','stable-1','personal_opportunity')",[B,A]);
    assert.equal((await db.query("select count(*)::int as n from acquisition_items")).rows[0].n,3);
    await db.exec("set role authenticated");
    await assert.rejects(db.query("select * from acquisition_items"),/permission denied/);
    await db.exec("reset role; set role anon");
    await assert.rejects(db.query("select * from acquisition_items"),/permission denied/);
  } finally {await db.close();}
});

test("queue reuses tenant membership checks and scopes every read to the verified organisation",async()=>{
  for(const [user,members,requested,status] of [[null,[A],A,401],["u",[A],B,403],["u",[A,B],"",400],["u",[A,B],A,200]]) {
    const reads=[];
    const admin={from(table){const filters={}; const query={select(){return query;},eq(k,v){filters[k]=v;return query;},limit(){return query;},order(){return query;},range(){return query;},then(resolve){reads.push({table,filters});return Promise.resolve(table==="organisation_members"?{data:members.filter(id=>!filters.organisation_id||filters.organisation_id===id).map(id=>({organisation_id:id,role:"viewer"})),error:null}:{data:[{organisation_id:filters.organisation_id}],count:1,error:null}).then(resolve);}};return query;}};
    const auth=load("lib/tenantAuth.ts",{"next/server":response,"@/lib/supabaseServer":{getCurrentUserId:async()=>user},"@/lib/supabaseAdmin":{supabaseAdmin:admin}});
    const route=load("app/api/growth/acquisition/route.ts",{"next/server":response,"@/lib/tenantAuth":auth,"@/lib/growthIngestion.server":helper,"@/lib/supabaseAdmin":{supabaseAdmin:admin}});
    const result=await route.GET(new Request(`https://ops.example/api/growth/acquisition?organisationId=${requested}`));
    assert.equal(result.status,status);
    if(status===200) assert.ok(reads.filter(r=>r.table==="acquisition_items").every(r=>r.filters.organisation_id===A));
    else assert.equal(reads.some(r=>r.table==="acquisition_items"),false);
  }
});
