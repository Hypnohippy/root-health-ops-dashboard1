import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { execFileSync } from "node:child_process";
function load(file, deps = {}, globals = {}) {
 const mod={exports:{}};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:mod,exports:mod.exports,URL,Request,Set,console,process:{env:{}},require:n=>{assert.ok(n in deps,n);return deps[n]},...globals},{filename:file});
 return mod.exports;
}
const guide=load("lib/rootCoachGuide.ts"),org="78fa2ac8-e7b6-4b9b-9604-035723ece6b1";
const ask=(route,question,evidence)=>guide.guideAnswer(route,question,org,true,evidence);
for(const [key,d] of Object.entries(guide.guideDestinations)) {
 test(`${key}: recognized workspace, meaningful suggestions and scoped destinations`,()=>{
  const w=guide.guideWorkspace(d.path);assert.equal(w.key,key);assert.ok(w.explanation.length>50);assert.ok(w.questions.length>=3);
  for(const q of w.questions){const a=ask(d.path,q);assert.ok(a.message.length>30);for(const link of a.destinations){assert.equal(new URL(link.href,"https://roothealthops.com").searchParams.get("organisationId"),org);assert.ok(Object.values(guide.guideDestinations).some(d=>link.href.startsWith(d.path+"?")));}}
 });
}
test("Home next-step guidance uses authoritative workspaces rather than a new priority engine",()=>{
 const a=ask("/dashboard","What should I do next?");assert.deepEqual(Array.from(a.destinations,d=>d.id),["home","responses","acquisition"]);assert.match(a.message,/recorded groups/);assert.doesNotMatch(a.message,/highest priority|\d+ replies/);
});
for(const [route,q,expected] of [
 ["/dashboard/responses","Where is LinkedIn Outreach?","linkedin"],
 ["/dashboard/growth","Where do I find Relationships?","relationships"],
 ["/dashboard/publishing","Where are my scheduled posts?","scheduled"],
 ["/dashboard/publishing","Where are approvals?","approvals"],
 ["/dashboard/connect","Where do I connect accounts?","connect"],
 ["/dashboard","How do I create a campaign?","campaigns"],
 ["/dashboard","Where do I publish something?","publishing"],
 ["/dashboard","What is Acquisition?","acquisition"],
]) test(`navigation contract: ${q}`,()=>assert.equal(ask(route,q).destinations[0].id,expected));
test("Founder permission gates both destination and page explanation",()=>{
 assert.equal(guide.guideAnswer("/dashboard","Where did Founder go?",org,true).destinations[0].id,"founder");
 for(const route of ["/dashboard","/dashboard/founder-intelligence"]){const a=guide.guideAnswer(route,"Where did Founder go?",org,false);assert.ok(a.destinations.every(d=>d.id!=="founder"));assert.match(a.message,/access.*not been confirmed/i);}
});
test("unknown routes and questions produce bounded orientation, not invented features",()=>{
 for(const route of ["/unknown","/dashboard/unknown","https://evil.test","javascript:alert(1)","//evil.test"]){const a=ask(route,"launch a new feature");assert.equal(a.workspace,"Unrecognized page");assert.equal(a.destinations[0].id,"home");}
 const a=ask("/dashboard/resources","Can you predict next month’s revenue?");assert.match(a.message,/don’t have a verified instruction/);assert.doesNotMatch(a.message,/£|\d/);
});
test("attention counts appear only with explicit valid verified evidence",()=>{
 assert.match(ask("/dashboard","Where are my replies?").message,/count is not available/);
 for(const [count,word] of [[0,"0 replies"],[1,"1 reply"],[3,"3 replies"]])assert.ok(ask("/dashboard","Where are my replies?",{responseAttentionCount:count}).message.includes(word));
 for(const count of [-1,NaN,Infinity,1.5,"3"])assert.match(ask("/dashboard","Where are my replies?",{responseAttentionCount:count}).message,/count is not available/);
});
test("no operational or arbitrary URL can become a destination",()=>{
 for(const id of ["/api/send","https://evil.test","javascript:alert(1)","//evil.test","__proto__","constructor","publishing?send=true"])assert.equal(guide.guideDestination(id,org,true),null);
 assert.equal(guide.guideDestination("home","other-tenant",true),null);
 for(const d of Object.values(guide.guideDestinations)){assert.ok(d.path.startsWith("/dashboard"));assert.doesNotMatch(d.path,/\/api\/|[?#]|\/oauth/);}
 for(const q of ["Send a message","Publish this now","Approve the post","Generate outreach","Run a campaign","Delete this record"]){const a=ask("/dashboard",q);assert.match(a.message,/cannot execute actions/);assert.ok(a.destinations.every(d=>d.href.startsWith("/dashboard")));}
});
test("questions are bounded and never echoed as HTML or destinations",()=>{
 for(const q of [""," ",null,"x".repeat(601)])assert.throws(()=>ask("/dashboard",q));
 const a=ask("/dashboard","<script>alert(1)</script> https://evil.test");assert.doesNotMatch(JSON.stringify(a),/script|evil\.test/);
});
function endpoint(founder=false){
 const options=[],calls={ai:0,founder:0};
 const service=load("lib/rootCoachGuide.server.ts",{"@/lib/opsCoachContext.server":{opsCoachContextAnswer:async()=>null,opsQuestionSubject:()=>null,pageHelpQuestion:q=>/What does this page do/i.test(q),contextFollowup:()=>false,parseOpsContext:v=>{if(v!==undefined)throw Error("Invalid context");return null;}},"@/lib/relationshipCoach.server":{relationshipGuideLocator:()=>null,relationshipCandidateName:()=>null,relationshipIntent:()=>"factual",blockedRelationshipAction:()=>false,relationshipCoachAnswer:()=>assert.fail("Generic guidance must not load relationships")},"@/lib/rootCoachGuide":guide,"@/lib/founderIntelligenceAuth.server":{requireFounderIntelligence:async id=>{calls.founder++;assert.equal(id,org);if(!founder)throw Error("Denied");return {organisationId:id}}}});
 const routes=load("app/api/coach/route.ts",{
  "@/lib/tenantRoute.server":{withTenantRoute:(fn,opts)=>{options.push(opts);return req=>fn(req,{organisationId:org,messages:[],profile:{business:{name:"Tenant"}}})}},
  "@/lib/rootCoachGuide.server":service,
  "@/lib/opsCoachContext.server":{opsCoachContextAnswer:async()=>null,opsQuestionSubject:()=>null,pageHelpQuestion:q=>/What does this page do/i.test(q),contextFollowup:()=>false,parseOpsContext:v=>{if(v!==undefined)throw Error("Invalid context");return null;}},"@/lib/relationshipCoach.server":{RELATIONSHIP_MODEL:"gpt-4o-mini"},
  "next/server":{NextResponse:{json:(body,opts={})=>({body,status:opts.status||200,headers:opts.headers})}},
  openai:{default:class{chat={completions:{create:async()=>{calls.ai++;return {choices:[{message:{content:"Existing legacy coach answer."}}]}}}}}},
 });
 const post=body=>routes.POST(new Request("https://roothealthops.com/api/coach",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)}));
 return {post,calls,options};
}
test("actual endpoint guidance is read-only and never calls the legacy provider",async()=>{
 const e=endpoint(),r=await e.post({mode:"guidance",organisationId:org,route:"/dashboard/responses",question:"Where are my replies?"});assert.equal(r.status,200);assert.equal(e.calls.ai,0);assert.equal(e.options[1].write,false);assert.equal(e.options[1].generation,undefined);assert.match(r.headers["Cache-Control"],/no-store/);
});
test("actual endpoint filters Founder permission server-side",async()=>{
 for(const allowed of [false,true]){const e=endpoint(allowed),r=await e.post({mode:"guidance",route:"/dashboard",question:"Where did Founder go?"});assert.equal(r.body.destinations.some(d=>d.id==="founder"),allowed);assert.equal(e.calls.founder,1);}
});
test("client evidence, HTML, destinations and response drafting inputs cannot enter guidance",async()=>{
 const e=endpoint();for(const extra of [{evidence:{responseAttentionCount:999}},{html:"private page"},{destination:"https://evil.test"},{inboxItemId:"inbox-id"},{context:"responses_lifecycle_draft_v1"}]){const r=await e.post({mode:"guidance",route:"/dashboard",question:"Where are my replies?",...extra});assert.equal(r.status,400);}
 assert.equal(e.calls.ai,0);
});
test("legacy onboarding/content requests retain deterministic and provider paths",async()=>{
 const e=endpoint();const fallback=await e.post({mode:"onboarding",platform:"instagram",errorMessage:"image rejected"});assert.match(fallback.body.message,/preferred shape/);assert.equal(e.calls.ai,0);
 const provider=await e.post({mode:"onboarding",stepId:"brand"});assert.equal(provider.body.message,"Existing legacy coach answer.");assert.equal(e.calls.ai,1);assert.equal(e.calls.founder,0);assert.equal(e.options[0].generation,true);
});
test("legacy Coach body and protected Day 0 files remain unchanged",()=>{
 const base=execFileSync("git",["show","9a30798:app/api/coach/route.ts"],{encoding:"utf8"}).replaceAll("\r\n","\n"),current=fs.readFileSync("app/api/coach/route.ts","utf8").replaceAll("\r\n","\n");
 const oldBody=base.slice(base.indexOf('export const POST = withTenantRoute'),base.indexOf('function safeJsonForPrompt')).trim().replace('export const POST =','const legacyCoachPOST =');
 const newBody=current.slice(current.indexOf('const legacyCoachPOST ='),current.indexOf('const guidancePOST =')).trim();assert.equal(newBody,oldBody);
 for(const f of ["app/api/ai/root-coach/route.ts","lib/linkedinDayZero.ts","lib/linkedinOutreach.ts","lib/linkedinRecipientContext.ts","lib/responseContactContext.ts","lib/responseContactContext.server.ts","app/api/growth/linkedin-console/route.ts"]){assert.equal(fs.readFileSync(f,"utf8").replaceAll("\r\n","\n"),execFileSync("git",["show",`41d96bfbd8c16f347efddc69cc0b21f7198e21f3:${f}`],{encoding:"utf8"}).replaceAll("\r\n","\n"),f);}
});
