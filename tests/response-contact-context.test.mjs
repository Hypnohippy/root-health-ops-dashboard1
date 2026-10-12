import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

function load(file) { const mod={exports:{}}; const output=ts.transpileModule(fs.readFileSync(file,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText; vm.runInNewContext(output,{module:mod,exports:mod.exports,require:()=>({})},{filename:file}); return mod.exports; }
const context = load("lib/responseContactContext.ts");

test("LinkedIn acceptance is classified as a first outbound message with plain customer language",()=>{
  const type=context.interactionTypeFor({platform:"linkedin",kind:"connection_accepted"},{canDraft:true,currentStage:"outreach_ready"});
  assert.equal(type,"linkedin_connection_first_message");
  assert.equal(context.messageTypeLabel(type),"First message after connection");
  assert.equal(context.plainSource(null,"connection_accepted"),"LinkedIn connection acceptance email");
  assert.doesNotMatch(context.messageTypeLabel(type),/connection_accepted|day3_followup|linkedin_connection_network/);
});

test("first-message rules prohibit fake prior dialogue and aggressive pitching",()=>{
  const briefing={interactionType:"linkedin_connection_first_message",objective:"Open a relevant conversation."};
  const rules=context.responseDraftRules(briefing).join(" ");
  assert.match(rules,/first outbound LinkedIn message/i); assert.match(rules,/not a reply/i); assert.match(rules,/never imply prior dialogue/i); assert.match(rules,/one natural low-pressure question/i); assert.match(rules,/No hard pitch/i);
});

test("interaction types require the current lifecycle instead of inferring from the event",()=>{
  const mapped=(platform,currentStage)=>context.interactionTypeFor({platform,kind:"connection_accepted"},{canDraft:true,currentStage});
  assert.equal(mapped("linkedin","follow_up"),"linkedin_followup");
  assert.equal(mapped("linkedin","needs_reply"),"linkedin_reply");
  assert.equal(mapped("email","needs_reply"),"email_reply");
  assert.equal(mapped("facebook","needs_reply"),"social_reply");
  assert.equal(mapped("linkedin","nurture"),"nurture");
  assert.equal(mapped("linkedin","engaged"),"relationship_message");
  assert.equal(context.interactionTypeFor({platform:"linkedin",kind:"connection_accepted"}),"no_action");
});

test("profile fit uses only stored role/company terms and sparse context invents nothing",()=>{
  const profile={customers:{audience:"People Directors",problems:["retention"]},offer:{priorityServices:["workplace wellbeing"]}};
  assert.deepEqual(Array.from(context.profileFit("People Director","Example Ltd",profile)),["People Directors"]);
  assert.deepEqual(Array.from(context.profileFit("","",profile)),[]);
});

test("Responses briefing and AI Suggest use the same server-enriched tenant context",()=>{
  const ui=fs.readFileSync("app/dashboard/responses/page.tsx","utf8");
  const route=fs.readFileSync("app/api/responses/[id]/context/route.ts","utf8");
  const server=fs.readFileSync("lib/responseContactContext.server.ts","utf8");
  const ai=fs.readFileSync("app/api/ai/root-coach/route.ts","utf8");
  assert.match(ui,/Why this contact matters/); assert.match(ui,/Message type:/); assert.match(ui,/inboxItemId: selected\.id/);
  assert.doesNotMatch(ui,/No linked contact history was found/);
  assert.match(route,/requireOrganisation\(requested, false\)/); assert.match(server,/readLifecycleInput\(organisationId\)/); assert.match(server,/buildContactLifecycle\(organisationId, input\)/); assert.match(server,/responseLifecycleMap\(organisationId, input\)\.get\(item\.id\)/);
  assert.match(ai,/getResponseContactContext\(tenant\.organisationId, inboxItemId/); assert.match(ai,/Drafting hierarchy: current unified lifecycle stage/);
});

test("existing email and social controls remain in Responses and LinkedIn is never auto-sent",()=>{
  const ui=fs.readFileSync("app/dashboard/responses/page.tsx","utf8");
  assert.match(ui,/Approve & Send/); assert.match(ui,/selected\.platform !== "facebook" && selected\.platform !== "instagram"/); assert.match(ui,/Open on platform/);
  assert.doesNotMatch(ui,/api\/linkedin\/.*send|linkedin.*sendMessage/i);
});

const rich = "Hi Shelley, thanks for connecting. Your people work at Acme gives us a useful point of overlap. I work with organisations around stress, resilience and early intervention, especially where support needs to be practical rather than simply another benefit. How are you approaching that side of things at the moment?";
const sparse = "Hi Shelley, thanks for connecting. I wanted to say hello properly rather than leave it at a profile link. My work is around practical stress support and early intervention for organisations. There may be a useful perspective to exchange, without assuming that is your priority. How are you approaching that side of things at the moment?";

test("rich first opener uses context and question; short generic/fake-dialogue/pitch outputs are rejected", () => {
 assert.equal(context.safeLinkedInFirstMessage(rich, {name:'Shelley',company:'Acme',role:'People director'}), true);
 assert.equal(context.safeLinkedInFirstMessage(sparse, {name:'Shelley'}), true);
 for(const draft of ["Hi Kate, I work with workplace wellbeing around stress and resilience. It's good to connect here.", "Hi Shelley, thanks for connecting. What are your priorities?", rich.replace('?', '.'), rich + ' Another question?', rich.replace('Hi Shelley,','Hi James,'), rich.replace('Acme','OtherCo').replace('people','finance'), rich.replace('thanks for connecting','thanks for getting in touch'), rich.replace('thanks for connecting','glad to help after our previous conversation'), rich + ' Book a call.', 'a'.repeat(500)]) {
  assert.equal(context.safeLinkedInFirstMessage(draft, {name:'Shelley',company:'Acme',role:'People director'}), false, draft);
 }
});

test("first opener is multi-tenant, while follow-up 1 and 2 have distinct history-led intent", () => {
 const first=context.responseDraftRules({interactionType:'linkedin_connection_first_message',objective:'Open conversation'}).join(' ');
 assert.match(first,/60-110 words/);assert.match(first,/saved person's actual first name/);assert.match(first,/Growth Profile/);assert.doesNotMatch(first,/Under 300|no question|Root|David/);
 const one=context.responseDraftRules({interactionType:'linkedin_followup',cadenceStage:'day3_followup',objective:'Explore relevance'}).join(' ');
 const two=context.responseDraftRules({interactionType:'linkedin_followup',cadenceStage:'day7_parity',objective:'Explore relevance'}).join(' ');
 assert.match(one,/actual previous outbound text/);assert.match(one,/Follow-up 1/);assert.match(one,/one relevant thought/);assert.match(one,/one low-pressure question/);assert.doesNotMatch(one,/Follow-up 2/);
 assert.match(two,/Follow-up 2/);assert.match(two,/shorter and more direct/i);assert.match(two,/brief conversation conditionally/);assert.match(two,/only if actually supported/);
 for(const type of ['linkedin_reply','nurture','warm_opportunity','relationship_message'])assert.doesNotMatch(context.responseDraftRules({interactionType:type}).join(' '),/60-110 words|Follow-up 1|Follow-up 2/);
});

test('active root-coach endpoint rejects collapsed copy and returns a rich editable first message', async()=>{
 const briefing={interactionType:'linkedin_connection_first_message',messageType:'First message after connection',company:'Acme',role:'People director',name:'Shelley',objective:'Open conversation',lifecycle:{canDraft:true,currentStage:'outreach_ready'}};
 for(const [draft,status] of [["Hi Shelley, good to connect. I work with workplace wellbeing.",409],[rich,200],[sparse,409]]) {
  const mod={exports:{}};let prompt='';
  const deps={'@/lib/tenantRoute.server':{withTenantRoute:fn=>req=>fn(req,{organisationId:'review',profile:{},messages:[]})},'next/server':{NextResponse:{json:(body,o={})=>({body,status:o.status||200})}},'@/lib/responseContactContext.server':{getResponseContactContext:async()=>briefing},'@/lib/responseContactContext':context,'@/lib/socialCommentOpportunity':{}};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('app/api/ai/root-coach/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:mod,exports:mod.exports,require:n=>deps[n],process:{env:{OPENAI_API_KEY:'test'}},console,fetch:async(url,opts)=>{prompt=opts.body;return {ok:true,json:async()=>({choices:[{message:{content:draft}}]})};}});
  const result=await mod.exports.POST({json:async()=>({inboxItemId:'11111111-1111-1111-1111-111111111111'})});
  assert.equal(result.status,status);assert.match(prompt,/interaction type, relationship stage, contact context, history, organisation Growth Profile, then objective/);assert.match(prompt,/60-110 words/);assert.doesNotMatch(prompt,/Under 300|save questions/);
  if(status===200)assert.equal(result.body.coachMessage,rich);else assert.equal(result.body.coachMessage,undefined);
 }
});

test("Responses follow-up endpoint requires exact outbound history and uses actual cadence stage", async()=>{
 let briefing={interactionType:'linkedin_followup',name:'Shelley',cadenceStage:'day3_followup',history:[],objective:'Explore relevance',lifecycle:{canDraft:true,currentStage:'follow_up'}};let calls=0,prompt='';
 const mod={exports:{}};const deps={'@/lib/tenantRoute.server':{withTenantRoute:fn=>req=>fn(req,{organisationId:'review',profile:{},messages:[]})},'next/server':{NextResponse:{json:(body,o={})=>({body,status:o.status||200})}},'@/lib/responseContactContext.server':{getResponseContactContext:async()=>briefing},'@/lib/responseContactContext':context,'@/lib/socialCommentOpportunity':{}};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync('app/api/ai/root-coach/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:mod,exports:mod.exports,require:n=>deps[n],process:{env:{OPENAI_API_KEY:'test'}},console,fetch:async(url,opts)=>{calls++;prompt=opts.body;return {ok:true,json:async()=>({choices:[{message:{content:'An editable stage-specific follow-up'}}]})};}});
 const req={json:async()=>({inboxItemId:'11111111-1111-1111-1111-111111111111'})};
 assert.equal((await mod.exports.POST(req)).status,409);assert.equal(calls,0);
 for(const [stage,label] of [['day3_followup','Follow-up 1'],['day7_parity','Follow-up 2']]){briefing={...briefing,cadenceStage:stage,history:['Actual previous outbound message: Exact actual earlier message']};assert.equal((await mod.exports.POST(req)).status,200);assert.ok(prompt.includes(label));assert.ok(prompt.includes('Exact actual earlier message'));assert.doesNotMatch(prompt,/60-110 words/);}
});
