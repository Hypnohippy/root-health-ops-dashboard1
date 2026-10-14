import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import ts from "typescript";
const require=createRequire(import.meta.url);
const org="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",foreign="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const identity="linkedin.com/in/tracy-example",contactId=JSON.stringify([org,`linkedin:${identity}`]);
function load(file,mocks={}) {
 const mod={exports:{}};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,{module:mod,exports:mod.exports,URL,Date,console,require:n=>n in mocks?mocks[n]:n.startsWith("@/")?load(n.replace("@/","")+".ts",mocks):require(n)});
 return mod.exports;
}
const inbox={id:"inbox-tracy",organisation_id:org,platform:"linkedin",kind:"connection_accepted",linkedin_identity:identity,status:"needs_reply",author_name:"Tracy",created_at_platform:"2026-10-01"};
function fixture({missing=false,denied=false}={}) {
 let messageReads=0;
 const filters=[];
 const messages=[
  {id:"undated-later",organisation_id:org,linkedin_identity:identity,direction:"snapshot",message:"Tracy\r\nYou: Exact history 👋\nView profile",message_at:null,confirmed_at:"2026-10-11"},
  {id:"new",organisation_id:org,linkedin_identity:identity,direction:"inbound",message:"Exact inbound",message_at:"2026-10-05",confirmed_at:"2026-10-10"},
  {id:"old",organisation_id:org,linkedin_identity:identity,direction:"outbound",message:"Exact outbound",message_at:"2026-10-02",confirmed_at:"2026-10-12"},
  {id:"undated-first",organisation_id:org,linkedin_identity:identity,direction:"snapshot",message:"Earlier snapshot",message_at:null,confirmed_at:"2026-10-09"},
  {id:"foreign-tenant",organisation_id:foreign,linkedin_identity:identity,message:"SECRET OTHER TENANT"},
  {id:"other-person",organisation_id:org,linkedin_identity:"linkedin.com/in/jim-example",message:"SECRET OTHER CONTACT"},
 ];
 const admin={from(table){
  const conditions=[];const q={select(){return q;},eq(k,v){conditions.push([k,v]);return q;},order(){return q;},async maybeSingle(){assert.equal(table,"lifecycle_revisions");assert.ok(conditions.some(([k,v])=>k==="organisation_id"&&v===org));return {data:{revision:1},error:null};},async range(a,b){assert.equal(table,"linkedin_conversation_messages");messageReads++;filters.push(...conditions);assert.deepEqual(conditions,[["organisation_id",org],["linkedin_identity",identity]]);return missing?{data:null,error:{code:"42P01"}}:{data:messages.filter(row=>conditions.every(([k,v])=>row[k]===v)).slice(a,b+1),error:null};}};return q;
 },rpc(){assert.fail("History GET must never invoke a write RPC");}};
 const mocks={"@/lib/supabaseAdmin":{supabaseAdmin:admin},"@/lib/lifecycleSnapshot.server":{readLifecycleInput:async tenant=>{assert.equal(tenant,org);return {inbox_items:[inbox],growth_targets:[],acquisition_items:[]};}},"next/server":{NextResponse:{json:(body,options={})=>({body,status:options.status||200,headers:options.headers})}},"@/lib/tenantAuth":{requireOrganisation:async(requested,write)=>{assert.equal(write,false);if(denied||requested!==org)throw Error("Forbidden");return {organisationId:org,userId:"actor"};},accessErrorResponse:e=>e.message==="Forbidden"?{status:403}:null},"@/lib/organisationProfile.server":{},"@/lib/tenantGeneration":{}};
 const service=load("lib/linkedinConversation.server.ts",mocks);
 const route=load("app/api/growth/linkedin-conversation/route.ts",{...mocks,"@/lib/linkedinConversation.server":service});
 const get=(id=contactId,tenant=org)=>route.GET({method:"GET",url:`https://ops.test/api?${new URLSearchParams({organisationId:tenant,contactId:id})}`});
 return {get,messages,filters,reads:()=>messageReads};
}
test("read-only route resolves canonical lifecycle identity, orders dated entries, then undated recording history",async()=>{
 const f=fixture(),before=JSON.stringify(f.messages),res=await f.get();assert.equal(res.status,200);assert.equal(res.body.contactId,contactId);assert.equal(res.headers["Cache-Control"],"private, no-store");
 assert.equal(res.body.messages.dated.map(m=>m.id).join(","),"old,new");assert.equal(res.body.messages.undated.map(m=>m.id).join(","),"undated-first,undated-later");assert.equal(res.body.messages.undated[1].message,f.messages[0].message);
 assert.ok(!JSON.stringify(res.body).includes("SECRET"));assert.equal(JSON.stringify(f.messages),before);assert.equal(inbox.status,"needs_reply");
});
test("another canonical identity or tenant cannot expose selected contact conversation",async()=>{
 const f=fixture();assert.equal((await f.get(JSON.stringify([org,"linkedin:linkedin.com/in/unknown"])) ).status,404);assert.equal(f.reads(),0);
 assert.equal((await f.get(JSON.stringify([foreign,`linkedin:${identity}`]))).status,404);assert.equal(f.reads(),0);
 assert.equal((await f.get(contactId,foreign)).status,403);assert.equal(f.reads(),0);assert.equal((await fixture({denied:true}).get()).status,403);
});
test("missing identity and unavailable storage fail explicitly rather than substituting notification text",async()=>{
 assert.equal((await fixture().get("")).status,400);assert.equal((await fixture({missing:true}).get()).status,503);
});
