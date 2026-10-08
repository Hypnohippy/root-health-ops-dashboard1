import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
function load(file, deps = {}, globals = {}) {
 const mod={exports:{}};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{...globals,module:mod,exports:mod.exports,URL,URLSearchParams,require:n=>{assert.ok(n in deps,n);return deps[n];}});
 return mod.exports;
}
const growth=load("lib/growthOutreach.ts"), engine=load("lib/engineState.ts");
const lifecycle=load("lib/contactLifecycle.ts",{"@/lib/growthOutreach":growth,"@/lib/engineState":engine});
const governor=load("lib/operationalGovernor.ts",{"@/lib/growthOutreach":growth,"@/lib/contactLifecycle":lifecycle});
const context=load("lib/responseContactContext.ts");
const queue=load("lib/linkedinOutreach.ts",{"@/lib/contactLifecycle":lifecycle,"@/lib/operationalGovernor":governor,"@/lib/growthOutreach":growth,"@/lib/responseContactContext":context});
const clipboard=load("lib/linkedinClipboard.ts");
const reconcile=load("lib/lifecycleReconciliation.ts",{"@/lib/growthOutreach":growth,"@/lib/contactLifecycle":lifecycle});
const org="org-a",now=Date.parse("2026-10-08T12:00:00Z");
const input=(parts={})=>({inbox_items:[],growth_targets:[],acquisition_items:[],...parts});
const acceptance=(id="a",fields={})=>({id,organisation_id:org,platform:"linkedin",kind:"connection_accepted",author_name:"Sarah",linkedin_identity:`linkedin.com/in/${id}`,status:"needs_reply",response_state:"needs_reply",created_at_platform:"2026-10-07",...fields});
const target=(fields={})=>({id:"target",organisation_id:org,linkedin_identity:"linkedin.com/in/a",target_name:"Sarah",stage:"day3_dm",status:"active",last_action_at:"2026-09-01",...fields});
const work=(data,view="all")=>queue.linkedInOutreachQueue(org,data,now,view);
test("fresh first message, old catch-up and undated connection share one projection",()=>{
 const data=input({inbox_items:[acceptance(),acceptance("old",{created_at_platform:"2026-06-01"}),acceptance("unknown",{created_at_platform:null})]});
 assert.equal(work(data).items.length,3);assert.equal(work(data,"fresh").items.length,1);assert.equal(work(data,"catchup").items.length,2);
 assert.equal(work(data,"catchup").items[0].context.interactionType,"linkedin_connection_first_message");
 assert.equal(work(input({growth_targets:[target({stage:"connection",last_action_at:null})]})).items.length,0);
});
test("only due followups enter queue; weekly canonical rule, no missing-date guesses",()=>{
 for(const fields of [{last_action_at:"2026-10-07"},{last_action_at:null},{status:"waiting"},{stage:"parked"}]) assert.equal(work(input({growth_targets:[target(fields)]})).items.length,0);
 assert.equal(work(input({growth_targets:[target()]}),"followups").items[0].stage,"day3_dm");
 assert.equal(work(input({growth_targets:[target({last_action_at:"2026-10-01T12:00:00Z"})]})).items.length,1);
});
test("human replies, engagement, commercial closure, dismissal and source ownership override outbound",()=>{
 for(const fields of [{reply_status:"positive"},{replied_at:"2026-10-07"},{deal_stage:"converted"},{deal_stage:"lost"},{deal_stage:"meeting"}]) assert.equal(work(input({growth_targets:[target(fields)]})).items.length,0);
 for(const response_state of ["engaged","closed_or_lost","converted","nurture","no_reply_needed","waiting_for_human"])assert.equal(work(input({inbox_items:[acceptance("a",{response_state})]})).items.length,0);
 for(const row of [{id:"reply",organisation_id:org,platform:"linkedin",kind:"dm",linkedin_identity:"linkedin.com/in/a",text:"Thanks, can you explain?",status:"needs_reply"},{id:"source",organisation_id:org,linkedin_identity:"linkedin.com/in/a",status:"dismissed",source_engine:"manual"}]) {
  const table=row.kind?"inbox_items":"acquisition_items";assert.equal(work(input({growth_targets:[target()],[table]:[row]})).items.length,0);
 }
 for(const source_engine of ["root_health_b2b","root_health_personal"])assert.equal(work(input({inbox_items:[acceptance()],acquisition_items:[{id:"source",organisation_id:org,linkedin_identity:"linkedin.com/in/a",status:"accepted",source_engine}]})).items.length,0);
 assert.equal(work(input({growth_targets:[target({next_step:"email owner action",next_step_date:"2026-01-01"})]})).items.length,0);
});
test("limit ten, stable ordering, overdue cadence outranks high-fit fresh connections; tenant isolation",()=>{
 const rows=Array.from({length:20},(_,i)=>acceptance(`person-${i}`,{raw:{headline:i===5?"Chief People Officer":"Consultant"}}));
 const data=input({inbox_items:[...rows,acceptance("foreign",{organisation_id:"org-b"})],growth_targets:[target()]});
 const a=work(data);assert.equal(a.items.length,10);assert.equal(a.total,21);assert.equal(a.items[0].id,"target");assert.equal(a.items[1].id,"person-5");assert.match(a.items[1].reason,/recorded role/);
 const b=work({...data,inbox_items:[...data.inbox_items].reverse()});assert.equal(JSON.stringify(a.items.map(i=>i.id)),JSON.stringify(b.items.map(i=>i.id)));
 assert.ok(!a.items.some(i=>i.id==="foreign"));
});
test("message destination validates LinkedIn host and falls back only to recorded profile evidence",()=>{
 const row=acceptance("a",{linkedin_message_url:"https://www.linkedin.com/messaging/thread/123/"});
 assert.equal(queue.linkedInDestination([row]),row.linkedin_message_url);
 for(const url of ["javascript:alert(1)","https://linkedin.com.evil.test/messaging/123","https://www.linkedin.com/login","https://evil@linkedin.com/messaging/thread/123"])assert.equal(queue.linkedInDestination([{...row,linkedin_message_url:url}]),"https://linkedin.com/in/a");
 assert.equal(queue.linkedInDestination([{...row,linkedin_message_url:null,linkedin_identity:null}]),null);
});
test("Open & Copy uses edited text, no lifecycle changes; clipboard failure preserves draft; no URL invention",async()=>{
 const data=input({inbox_items:[acceptance()]}),before=JSON.stringify(data),calls=[];
 const browser={open:url=>calls.push(["open",url]),copy:async text=>calls.push(["copy",text])};
 await clipboard.openAndCopyLinkedIn("My current edited draft","https://linkedin.com/in/a",browser);
 assert.deepEqual(calls,[["open","https://linkedin.com/in/a"],["copy","My current edited draft"]]);assert.equal(JSON.stringify(data),before);
 calls.length=0;assert.match(await clipboard.openAndCopyLinkedIn("edited",null,browser),/No LinkedIn destination/);assert.deepEqual(calls,[["copy","edited"]]);
 await assert.rejects(clipboard.openAndCopyLinkedIn("unchanged",null,{...browser,copy:async()=>{throw Error("denied");}}),/denied/);assert.equal(JSON.stringify(data),before);
});
test("first completion reuses reconciliation and existing target without resetting advanced cadence",()=>{
 const data=input({inbox_items:[acceptance()]});const p=governor.planManualCompletion(org,data,"inbox_items","a");assert.equal(p.allowed,true);
 Object.assign(data.inbox_items[0],p.patch,{last_replied_at:"2026-10-08",contacted_at:"2026-10-08",manual_completion:{key:"receipt"}});
 assert.equal(governor.planManualCompletion(org,data,"inbox_items","a").allowed,false);
 assert.equal(reconcile.planLifecycleReconciliation(org,data).repairs.find(r=>r.id===null).patch.stage,"day3_dm");
 data.growth_targets=[target({stage:"day17_followup"})];assert.ok(!reconcile.planLifecycleReconciliation(org,data).repairs.some(r=>r.id===null || r.patch.stage==="connection" || r.patch.stage==="day3_dm"));
 const later=input({growth_targets:[target({stage:"day17_followup"})]});assert.equal(governor.planManualCompletion(org,later,"growth_targets","target").patch.stage,"week5_view");
});
test("inbound attention remains visible alongside queue",()=>{
 const data=input({inbox_items:[acceptance(),{id:"human",organisation_id:org,platform:"email",kind:"email_reply",status:"needs_reply",sender_email:"different@example.com"}]});assert.equal(work(data).repliesNeedingAttention,1);assert.equal(work(data).items.length,1);
});

test("console API revalidates due eligibility and revision, retries receipts and uses catch-up rules",async()=>{
 let data=input({inbox_items:[acceptance("a",{created_at_platform:"2020-01-01"})]}),rev="3",completionCalls=0,prompt="";
 const deps={
  "next/server":{NextResponse:{json:(body,options={})=>({body,status:options.status||200})}},
  "@/lib/tenantRoute.server":{withTenantRoute:handler=>req=>handler(req,{organisationId:org,userId:"actor"})},
  "@/lib/supabaseAdmin":{supabaseAdmin:{from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:{revision:rev}})})})})}},
  "@/lib/lifecycleSnapshot.server":{readLifecycleInput:async()=>data},
  "@/lib/linkedinOutreach":queue,"@/lib/responseContactContext":context,
  "@/lib/organisationProfile.server":{getOrganisationGenerationProfile:async()=>({})},
  "@/lib/tenantGeneration":{generationMessages:()=>[]},
  "@/lib/manualCompletion.server":{completeManualAction:async(o,a,r)=>{completionCalls++;assert.equal(o,org);assert.equal(a,"actor");assert.equal(r.completedAt,"2026-01-01");return {duplicate:!!data.inbox_items[0].manual_completion};}},
 };
 const api=load("app/api/growth/linkedin-console/route.ts",deps,{process:{env:{OPENAI_API_KEY:"fixture"}},fetch:async(url,options)=>{prompt=JSON.parse(options.body).messages.at(-1).content;return {ok:true,json:async()=>({choices:[{message:{content:"Hi Sarah, we connected a while ago and I realised I hadn't said hello properly."}}]})};}});
 const req=body=>({json:async()=>body});
 const base={id:"a",table:"inbox_items",revision:"3"};
 const generated=await api.POST(req({...base,action:"generate"}));assert.equal(generated.status,200);assert.match(prompt,/older or undated connection/);assert.match(prompt,/Do not say good to connect/);
 assert.equal((await api.POST(req({...base,revision:"2",action:"generate"}))).status,409);
 data.inbox_items[0].response_state="engaged";assert.equal((await api.POST(req({...base,action:"complete",confirmed:true,key:"cccccccc-cccc-4ccc-8ccc-cccccccccccc",message:"Hello",completedAt:"2026-01-01"}))).status,409);assert.equal(completionCalls,0);
 data.inbox_items[0].manual_completion={key:"cccccccc-cccc-4ccc-8ccc-cccccccccccc"};rev="4";
 const retry=await api.POST(req({...base,action:"complete",confirmed:true,key:"cccccccc-cccc-4ccc-8ccc-cccccccccccc",message:"Hello",completedAt:"2026-01-01"}));assert.equal(retry.body.duplicate,true);assert.equal(completionCalls,1);
});

test("legacy contacted connection stage cannot generate a fake first message as followup",()=>{
 assert.equal(work(input({growth_targets:[target({stage:"connection",last_action_at:"2020-01-01"})]})).items.length,0);
 const incomplete=input({inbox_items:[acceptance("a",{linkedin_identity:null})]});
 assert.equal(work(incomplete).items.length,0);assert.equal(work(incomplete).identityReviewNeeded,1);
});
