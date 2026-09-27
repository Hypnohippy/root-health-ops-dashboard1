import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
const response={NextResponse:{json:(body,o={})=>({body,status:o.status||200})}};
function load(file,deps={},env={},fetch=()=>{throw Error("Unexpected provider access");}){const mod={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:mod,exports:mod.exports,URL,URLSearchParams,process:{env},console:{error(){},warn(){}},fetch,require:n=>{assert.ok(n in deps,n);return deps[n];}});return mod.exports;}
const routes=[["metrics","GET"],["campaign-metrics","GET"],["campaign-metrics","POST"],["campaign-variant-metrics","POST"],["replies","GET"],["replies/[id]","GET"],["reply","POST"]];
function authFixture(user,role="owner"){
 const db={from(table){assert.equal(table,"organisation_members");let wanted="";const q={select(){return q;},eq(k,v){if(k==="organisation_id")wanted=v;return q;},limit(){return Promise.resolve({data:wanted==="B"?[]:[{organisation_id:"A",role}]});}};return q;}};
 return load("lib/tenantAuth.ts",{"next/server":response,"@/lib/supabaseServer":{getCurrentUserId:async()=>user},"@/lib/supabaseAdmin":{supabaseAdmin:db}});
}
for(const [route,method] of routes)test(`${route} ${method}: rejects unsigned and foreign tenants before data access`,async()=>{
 for(const [user,organisationId,status] of [[null,"A",401],["user","B",403]]){
 const auth=authFixture(user);const airtable=load("lib/legacyAirtable.server.ts",{"@/lib/tenantAuth":auth},{AIRTABLE_ORGANISATION_ID:"A"});
 const deps={"@/lib/replyMetrics.server":{readConfirmedReplyCount:()=>{throw Error("No metric reads");}},"next/server":response,"@/lib/tenantAuth":auth,"@/lib/legacyAirtable.server":airtable,"@/lib/campaignOwnership.server":{requireOwnedCampaignVariant:()=>{throw Error("No ownership reads");}},"../../../lib/supabaseAdmin":{supabaseAdmin:{from(){throw Error("No data access");}}}};
 const handler=load(`app/api/${route}/route.ts`,deps);
 const result=await handler[method]({url:`https://ops/api/${route}?organisationId=${organisationId}`,json:async()=>({organisationId,variantId:"v",campaignId:"c"})});assert.equal(result.status,status);
 }
});
test("Airtable binding is explicit, membership verified, write roles enforced",async()=>{
 for(const [binding,role,write,status] of [[undefined,"owner",false,503],["B","owner",false,403],["A","viewer",true,403]]){
 const helper=load("lib/legacyAirtable.server.ts",{"@/lib/tenantAuth":authFixture("user",role)},{AIRTABLE_ORGANISATION_ID:binding});await assert.rejects(helper.requireAirtableOrganisation("A",write),e=>e.status===status);
 }
 const helper=load("lib/legacyAirtable.server.ts",{"@/lib/tenantAuth":authFixture("user")},{AIRTABLE_ORGANISATION_ID:"A"});assert.equal((await helper.requireAirtableOrganisation("A",true)).organisationId,"A");
});
test("campaign variant ownership checks tenant campaigns before variant reads",async()=>{
 let reads=0;const auth=authFixture("user");const db={from(table){reads++;const filters={};const q={select(){return q;},eq(k,v){filters[k]=v;return q;},in(k,v){filters[k]=v;return q;},then(resolve){assert.equal(table,"campaigns");assert.equal(filters.organisation_id,"A");return Promise.resolve({data:[{id:"owned-c"}]}).then(resolve);},maybeSingle(){assert.equal(table,"campaign_variants");assert.deepEqual(Array.from(filters.campaign_id),["owned-c"]);return Promise.resolve({data:filters.id==="owned-v"?{id:"owned-v",campaign_id:"owned-c"}:null});}};return q;}};
 const helper=load("lib/campaignOwnership.server.ts",{"@/lib/supabaseAdmin":{supabaseAdmin:db},"@/lib/tenantAuth":auth});await assert.rejects(helper.requireOwnedCampaignVariant("A","foreign-v"),e=>e.status===403);assert.equal((await helper.requireOwnedCampaignVariant("A","owned-v")).id,"owned-v");assert.equal(reads,4);
});
test("legacy metric read filters organisation in database rather than loading all tenants",async()=>{
 let queried=false;const q={select(){return q;},eq(k,v){assert.equal(k,"meta->>organisation_id");assert.equal(v,"A");queried=true;return q;},order(){return q;},limit(){assert.equal(queried,true);return Promise.resolve({data:[{id:"m",meta:{organisation_id:"A"}}]});}};
 const route=load("app/api/campaign-metrics/route.ts",{"next/server":response,"@/lib/tenantAuth":authFixture("user"),"@/lib/campaignOwnership.server":{},"../../../lib/supabaseAdmin":{supabaseAdmin:{from:()=>q}}});assert.equal((await route.GET({url:"https://ops/api/campaign-metrics?organisationId=A"})).body.records.length,1);
});
