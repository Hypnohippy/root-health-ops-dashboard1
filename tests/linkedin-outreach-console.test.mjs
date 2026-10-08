import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
function load(file, deps = {}, globals = {}) {
 const mod={exports:{}};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{...globals,module:mod,exports:mod.exports,URL,URLSearchParams,AbortSignal,require:n=>{assert.ok(n in deps,n);return deps[n];}});
 return mod.exports;
}
const growth=load("lib/growthOutreach.ts"), engine=load("lib/engineState.ts");
const lifecycle=load("lib/contactLifecycle.ts",{"@/lib/growthOutreach":growth,"@/lib/engineState":engine});
const governor=load("lib/operationalGovernor.ts",{"@/lib/growthOutreach":growth,"@/lib/contactLifecycle":lifecycle});
const context=load("lib/responseContactContext.ts");
const selfIdentity=load("lib/outreachSelfIdentity.ts",{"@/lib/contactLifecycle":lifecycle});
const workbench=load("lib/linkedinWorkbench.ts");
const queue=load("lib/linkedinOutreach.ts",{"@/lib/outreachSelfIdentity":selfIdentity,"@/lib/contactLifecycle":lifecycle,"@/lib/operationalGovernor":governor,"@/lib/growthOutreach":growth,"@/lib/responseContactContext":context});
const clipboard=load("lib/linkedinClipboard.ts");
const reconcile=load("lib/lifecycleReconciliation.ts",{"@/lib/growthOutreach":growth,"@/lib/contactLifecycle":lifecycle});
const org="org-a",now=Date.parse("2026-10-08T12:00:00Z");
const input=(parts={})=>({inbox_items:[],growth_targets:[],acquisition_items:[],...parts});
const acceptance=(id="a",fields={})=>({id,organisation_id:org,platform:"linkedin",kind:"connection_accepted",author_name:"Sarah",linkedin_identity:`linkedin.com/in/${id}`,status:"needs_reply",response_state:"needs_reply",created_at_platform:"2026-10-07",...fields});
const target=(fields={})=>({id:"target",organisation_id:org,linkedin_identity:"linkedin.com/in/a",target_name:"Sarah",stage:"day3_dm",status:"active",last_action_at:"2026-09-01",...fields});
const receipt=(at="2026-09-01",message="Hi Sarah, here is the wellbeing resource we discussed.")=>({key:"cccccccc-cccc-4ccc-8ccc-cccccccccccc",actor:"verified-operator",completed_at:at,evidence:"Operator confirmed actual LinkedIn message sent",message});
const followup=(fields={},acceptedFields={})=>input({inbox_items:[acceptance("a",{created_at_platform:"2026-08-01",...acceptedFields})],growth_targets:[target({manual_completion:receipt(fields.last_action_at || "2026-09-01"),...fields})]});
const work=(data,view="all")=>queue.linkedInOutreachQueue(org,data,now,view);
test("fresh and older accepted connections qualify; unknown acceptance timing needs reconciliation",()=>{
 const data=input({inbox_items:[acceptance(),acceptance("old",{created_at_platform:"2026-06-01"}),acceptance("unknown",{created_at_platform:null})]});
 assert.equal(work(data).items.length,2);assert.equal(work(data,"fresh").items.length,1);assert.equal(work(data,"catchup").items.length,1);
 assert.equal(work(data,"catchup").items[0].context.interactionType,"linkedin_connection_first_message");
 assert.equal(work(input({growth_targets:[target({stage:"connection",last_action_at:null})]})).items.length,0);
});
test("only due followups enter queue; weekly canonical rule, no missing-date guesses",()=>{
 for(const fields of [{last_action_at:"2026-10-07"},{last_action_at:null},{status:"waiting"},{stage:"parked"}]) assert.equal(work(followup(fields)).items.length,0);
 assert.equal(work(followup(),"followups").items[0].stage,"day3_dm");
 assert.equal(work(followup({last_action_at:"2026-10-01T12:00:00Z"})).items.length,1);
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
 const data=followup();data.inbox_items.push(...rows,acceptance("foreign",{organisation_id:"org-b"}));
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
 let data=input({inbox_items:[acceptance("a",{created_at_platform:"2020-01-01"})]}),rev="3",completionCalls=0,prompt="", replies=[], providerStatus=200, providerThrows=false, providerCalls=0;
 const deps={
  "@/lib/outreachSelfIdentity.server":{readOutreachSelfIdentity:async()=>selfIdentity.emptyOutreachSelfIdentity()},
  "next/server":{NextResponse:{json:(body,options={})=>({body,status:options.status||200})}},
  "@/lib/tenantRoute.server":{withTenantRoute:handler=>req=>handler(req,{organisationId:org,userId:"actor"})},
  "@/lib/supabaseAdmin":{supabaseAdmin:{from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:{revision:rev}})})})})}},
  "@/lib/lifecycleSnapshot.server":{readLifecycleInput:async()=>data},
  "@/lib/linkedinOutreach":queue,"@/lib/responseContactContext":context,
  "@/lib/organisationProfile.server":{getOrganisationGenerationProfile:async()=>({})},
  "@/lib/tenantGeneration":{generationMessages:()=>[]},
  "@/lib/manualCompletion.server":{completeManualAction:async(o,a,r)=>{completionCalls++;assert.equal(o,org);assert.equal(a,"actor");assert.equal(r.completedAt,"2026-01-01");return {duplicate:!!data.inbox_items[0].manual_completion};}},
 };
 const api=load("app/api/growth/linkedin-console/route.ts",deps,{process:{env:{OPENAI_API_KEY:"fixture"}},fetch:async(url,options)=>{providerCalls++; if(providerThrows) throw Error("upstream unavailable"); prompt=JSON.parse(options.body).messages.at(-1).content;return {ok:providerStatus===200,json:async()=>({choices:[{message:{content:replies.shift() || "Hi Sarah, we connected a while ago and I realised I hadn't said hello properly."}}]})};}});
 const req=body=>({json:async()=>body});
 const base={id:"a",table:"inbox_items",revision:"3"};
 const generated=await api.POST(req({...base,action:"generate"}));assert.equal(generated.status,200);assert.match(prompt,/older or undated connection/);assert.match(prompt,/Do not say good to connect/);
 assert.equal((await api.POST(req({...base,revision:"2",action:"generate"}))).status,409);
 data.inbox_items[0].response_state="engaged";assert.equal((await api.POST(req({...base,action:"complete",confirmed:true,key:"cccccccc-cccc-4ccc-8ccc-cccccccccccc",message:"Hello",completedAt:"2026-01-01"}))).status,409);assert.equal(completionCalls,0);
 data.inbox_items[0].manual_completion={key:"cccccccc-cccc-4ccc-8ccc-cccccccccccc"};rev="4";
 const retry=await api.POST(req({...base,action:"complete",confirmed:true,key:"cccccccc-cccc-4ccc-8ccc-cccccccccccc",message:"Hello",completedAt:"2026-01-01"}));assert.equal(retry.body.duplicate,true);assert.equal(completionCalls,1);
 data=followup();
 const fbase={id:"target",table:"growth_targets",revision:"4"};
 assert.equal((await api.POST(req({...fbase,action:"generate"}))).status,200);assert.ok(prompt.includes(receipt().message));assert.match(prompt,/lifecycle stage is never provider truth/);assert.doesNotMatch(prompt,/unified current lifecycle is authoritative/);
 replies=["x".repeat(350), "Hi Sarah, good to connect. Thought I'd say hello properly."];
 data=input({inbox_items:[acceptance()]}); const fresh={id:"a",table:"inbox_items",revision:"4",action:"generate"};
 const beforeCalls=providerCalls;assert.equal((await api.POST(req(fresh))).status,200);assert.equal(providerCalls-beforeCalls,2);assert.match(prompt,/failed validation/);
 replies=["x".repeat(350),"x".repeat(350)];assert.equal((await api.POST(req(fresh))).status,409);
 providerStatus=503;assert.equal((await api.POST(req(fresh))).status,503);providerStatus=200;
 providerThrows=true;assert.equal((await api.POST(req(fresh))).status,503);providerThrows=false;
 data=followup();
 data.growth_targets[0].manual_completion=null;assert.equal((await api.POST(req({...fbase,action:"generate"}))).status,409);
 assert.equal((await api.POST(req({...fbase,action:"complete",confirmed:true,key:"eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",message:"Do not send",completedAt:"2026-10-08"}))).status,409);assert.equal(completionCalls,1);
});

test("legacy contacted connection stage cannot generate a fake first message as followup",()=>{
 assert.equal(work(input({growth_targets:[target({stage:"connection",last_action_at:"2020-01-01"})]})).items.length,0);
 const incomplete=input({inbox_items:[acceptance("a",{linkedin_identity:null})]});
 assert.equal(work(incomplete).items.length,0);assert.equal(work(incomplete).identityReviewNeeded,1);
});

test("self/owner/account identities are excluded before the ten-item limit, without hard-coded identities",()=>{
 const cases=[{names:["Sender Example"],emails:[],linkedinProfiles:[],linkedinAccountIds:[]},{names:[],emails:["sender@example.test"],linkedinProfiles:[],linkedinAccountIds:[]},{names:[],emails:[],linkedinProfiles:["https://linkedin.com/in/sender"],linkedinAccountIds:[]},{names:[],emails:[],linkedinProfiles:[],linkedinAccountIds:["urn:li:person:123"]}];
 const fields=[{target_name:"  SENDER   EXAMPLE "},{email:"Sender@Example.Test"},{linkedin_identity:"linkedin.com/in/sender"},{linkedin_member_id:"123"}];
 for(let i=0;i<cases.length;i++){
  const data=input({growth_targets:[target(fields[i])],inbox_items:[acceptance("other")]});
  const actual=queue.linkedInOutreachQueue(org,data,now,"all",[],10,cases[i]);assert.equal(actual.items.length,1);assert.equal(actual.items[0].id,"other");
 }
 const self={names:["Our Organisation"],emails:["hello@example.test"],linkedinProfiles:[],linkedinAccountIds:[]};
 assert.equal(queue.linkedInOutreachQueue(org,input({growth_targets:[target({target_name:"Our Organisation"})]}),now,"all",[],10,self).items.length,0);
 assert.equal(queue.linkedInOutreachQueue(org,followup({company:"Our Organisation",email:"someone.else@example.test"}),now,"all",[],10,self).items.length,1);
});
test("self identity is read from this tenant's saved profile, connected account and verified owners only",async()=>{
 const calls=[],userIds=[];
 const api=load("lib/outreachSelfIdentity.server.ts",{
  "@/lib/outreachSelfIdentity":selfIdentity,
  "@/lib/organisationProfile.server":{getOrganisationProfile:async id=>{assert.equal(id,org);return {profile:{yourName:"Configured Sender",businessName:"Saved Business",contactEmail:"contact@example.test"},organisationName:"Tenant Business"};}},
  "@/lib/supabaseAdmin":{supabaseAdmin:{from:table=>{const filters={};const q={select:columns=>{assert.ok(!/token|secret/.test(columns));return q;},eq:(k,v)=>{filters[k]=v;return q;},then:resolve=>{calls.push({table,filters});return Promise.resolve({data:table==="social_accounts"?[{page_name:"Connected Sender",page_id:"123"}]:[{user_id:"owner",role:"owner"},{user_id:"viewer",role:"viewer"}]}).then(resolve);}};return q;},auth:{admin:{getUserById:async id=>{userIds.push(id);return {data:{user:{email:`${id}@example.test`,user_metadata:{full_name:`Verified ${id}`,linkedin_url:"https://linkedin.com/in/verified"}}}};}}}}},
 });
 const self=await api.readOutreachSelfIdentity(org,"actor");assert.ok(self.names.includes("Configured Sender"));assert.ok(self.names.includes("Connected Sender"));assert.ok(self.names.includes("Verified owner"));assert.ok(self.names.includes("Saved Business"));assert.equal(userIds.includes("viewer"),false);assert.equal(userIds.length,2);assert.ok(calls.every(c=>c.filters.organisation_id===org));
});
test("batch selection/removal are presentation-only; send and skip choose the next row",()=>{
 const data=input({inbox_items:Array.from({length:12},(_,i)=>acceptance(`batch-${i}`))}),before=JSON.stringify(data),batch=work(data).items;
 assert.equal(batch.length,10);assert.equal(workbench.selectedBatchId(batch,batch[4].contactId),batch[4].contactId);
 const after=workbench.removeBatchContact(batch,batch[4].contactId);assert.equal(after.items.length,9);assert.equal(after.selectedId,batch[5].contactId);assert.equal(JSON.stringify(data),before);
 assert.equal(workbench.removeBatchContact([batch[0]],batch[0].contactId).selectedId,null);
});


test("live acceptance importer provenance does not confer ownership of outbound work",()=>{
 const names=["Beverley Deans","Eric Misewe","Jamie Aspinall","Miriam Berramou","Neil","Tom","James Lockwood","James Duncan","Tara","Alenka Taylor"];
 const data=input({inbox_items:names.map((name,i)=>acceptance("verified-"+i,{author_name:name,source_engine:"root_health_b2b",raw:{source_engine:"root_health_b2b",source_type:"linkedin_connection_accepted"},created_at_platform:i<8?"2026-10-07":"2026-09-30"}))});
 assert.equal(work(data).total,10);assert.equal(work(data,"fresh").total,8);assert.equal(work(data,"catchup").total,2);
 // Ownership of an actual acquisition workflow still blocks taking over its action.
 data.acquisition_items.push({id:"owned",organisation_id:org,linkedin_identity:"linkedin.com/in/verified-0",source_engine:"root_health_b2b",status:"accepted"});
 assert.equal(work(data).total,9);
});
test("stage, timestamp and profile are never accepted-connection evidence",()=>{
 const legacy=input({growth_targets:[target()]});assert.equal(work(legacy).total,0);assert.equal(work(legacy).audit[0].eligibility,"connection state unverified");
 const data=followup({manual_completion:receipt()});assert.equal(work(data).total,1);
 for(const connection_status of ["pending","2nd-degree","disconnected"]) { const pending=followup({connection_status});assert.equal(work(pending).total,0);assert.equal(work(pending).audit[0].eligibility,"connection state unverified"); }
 const mismatch=followup({}, {linkedin_identity:"linkedin.com/in/somebody-else"});assert.equal(work(mismatch,"followups").total,0);
});
test("confirmed prior send, actual text and cadence timestamp must all agree",()=>{
 for(const manual_completion of [null,receipt("2026-09-01",""),{...receipt(),actor:null},{...receipt(),completed_at:"2027-01-01"}]){
  const data=followup({manual_completion,last_reply_text:"Unconfirmed text alone is not history"});assert.equal(work(data).total,0);assert.equal(work(data).audit[0].eligibility,"outbound history incomplete");
 }
 const data=followup();const item=work(data).items[0];assert.equal(item.previousOutbound.message,receipt().message);assert.equal(item.previousOutbound.sentAt,"2026-09-01T00:00:00.000Z");assert.match(JSON.stringify(item.context.history),/Actual previous outbound message/);
 assert.equal(work(followup({manual_completion:receipt("2026-08-20")})).audit[0].eligibility,"conflicting lifecycle: cadence timestamp differs from confirmed send");
 const legacy=followup({manual_completion:null},{status:"replied",contacted_at:"2026-09-01",last_replied_at:"2026-09-01",last_reply_text:"Actual old first message"});assert.equal(work(legacy).total,1);
 for(const fields of [{reply_status:"positive"},{replied_at:"2026-10-01"},{deal_stage:"meeting"},{deal_stage:"won"},{deal_stage:"lost"},{status:"parked"}]) assert.equal(work(followup(fields)).total,0);
});
test("missing destination and ambiguous identities remain diagnostic, never normal work",()=>{
 const a=acceptance("a",{linkedin_identity:null,permalink:null,linkedin_message_url:null});const data=input({inbox_items:[a]});assert.equal(work(data).total,0);assert.ok(work(data).audit[0].defects.includes("destination missing"));
 const conflict=input({inbox_items:[acceptance("a",{permalink:"https://linkedin.com/in/other"})]});assert.equal(work(conflict).total,0);assert.ok(work(conflict).audit[0].defects.includes("ambiguous identity"));
 const profile=work(input({inbox_items:[acceptance()]})).items[0];assert.equal(profile.destinationKind,"profile");
 const messaging=work(input({inbox_items:[acceptance("a",{linkedin_message_url:"https://www.linkedin.com/comm/messaging/compose/?connId=a"})]})).items[0];assert.equal(messaging.destinationKind,"messaging");
 assert.equal(queue.linkedInDestination([acceptance("a",{linkedin_message_url:"https://linkedin.com/messaging/"})]),"https://linkedin.com/in/a");
});
test("foreign acceptance cannot authorise this tenant's followup or appear in evidence",()=>{
 const data=followup({}, {organisation_id:"org-b"});const actual=work(data);assert.equal(actual.total,0);assert.ok(actual.audit.every(c=>c.records.every(r=>r.table!=="inbox_items")));
});
