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
  assert.match(rules,/first outbound LinkedIn message/i); assert.match(rules,/not a reply/i); assert.match(rules,/never imply prior dialogue/i); assert.match(rules,/No question mark/i); assert.match(rules,/No hard pitch/i);
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

const rich = "Hi Shelley, thanks for connecting. Your people work at Acme gives us a useful point of overlap. I work with organisations around stress, resilience and early intervention, especially where support needs to be practical rather than simply another benefit. Good to be connected.";
const sparse = "Hi Shelley, thanks for connecting. I wanted to introduce the work behind my profile. My work is around practical stress support and early intervention for organisations. That is the context behind connecting, without assuming that it is your priority. Good to be connected.";

test("rich first opener uses context without questions; short generic/fake-dialogue/pitch outputs are rejected", () => {
 assert.equal(context.safeLinkedInFirstMessage(rich, {name:'Shelley',company:'Acme',role:'People director'}), true);
 assert.equal(context.safeLinkedInFirstMessage(sparse, {name:'Shelley'}), true);
 for(const draft of ["Hi Kate, I work with workplace wellbeing around stress and resilience. It's good to connect here.", "Hi Shelley, thanks for connecting. What are your priorities?", rich + ' How are you approaching this?' , rich + ' Another question?', rich.replace('Hi Shelley,','Hi James,'), rich.replace('Acme','OtherCo').replace('people','finance'), rich.replace('thanks for connecting','thanks for getting in touch'), rich.replace('thanks for connecting','glad to help after our previous conversation'), rich + ' Book a call.', 'a'.repeat(500)]) {
  assert.equal(context.safeLinkedInFirstMessage(draft, {name:'Shelley',company:'Acme',role:'People director'}), false, draft);
 }
});

test("first opener is multi-tenant, while follow-up 1 and 2 have distinct history-led intent", () => {
 const first=context.responseDraftRules({interactionType:'linkedin_connection_first_message',objective:'Open conversation'}).join(' ');
 assert.match(first,/45-80 words/);assert.match(first,/saved person's actual first name/);assert.match(first,/Growth Profile/);assert.doesNotMatch(first,/Under 300|Root|David/);
 const one=context.responseDraftRules({interactionType:'linkedin_followup',cadenceStage:'day3_followup',objective:'Explore relevance'}).join(' ');
 const two=context.responseDraftRules({interactionType:'linkedin_followup',cadenceStage:'day7_parity',objective:'Explore relevance'}).join(' ');
 assert.match(one,/actual previous outbound text/);assert.match(one,/Follow-up 1/);assert.match(one,/one relevant thought/);assert.match(one,/one low-pressure question/);assert.doesNotMatch(one,/Follow-up 2/);
 assert.match(two,/Follow-up 2/);assert.match(two,/shorter and more direct/i);assert.match(two,/brief conversation conditionally/);assert.match(two,/only if actually supported/);
 for(const type of ['linkedin_reply','nurture','warm_opportunity','relationship_message'])assert.doesNotMatch(context.responseDraftRules({interactionType:type}).join(' '),/45-80 words|Follow-up 1|Follow-up 2/);
});

test('active root-coach endpoint rejects collapsed copy and returns a rich editable first message', async()=>{
 const briefing={interactionType:'linkedin_connection_first_message',messageType:'First message after connection',company:'Acme',role:'People director',name:'Shelley',objective:'Open conversation',lifecycle:{canDraft:true,currentStage:'outreach_ready'}};
 for(const [draft,status] of [["Hi Shelley, good to connect. I work with workplace wellbeing.",409],[rich,200],[sparse,409]]) {
  const mod={exports:{}};let prompt='';
  const deps={'@/lib/tenantRoute.server':{withTenantRoute:fn=>req=>fn(req,{organisationId:'review',profile:{},messages:[]})},'next/server':{NextResponse:{json:(body,o={})=>({body,status:o.status||200})}},'@/lib/responseContactContext.server':{getResponseContactContext:async()=>briefing},'@/lib/responseContactContext':context,'@/lib/socialCommentOpportunity':{}};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('app/api/ai/root-coach/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:mod,exports:mod.exports,require:n=>deps[n],process:{env:{OPENAI_API_KEY:'test'}},console,fetch:async(url,opts)=>{prompt=opts.body;return {ok:true,json:async()=>({choices:[{message:{content:draft}}]})};}});
  const result=await mod.exports.POST({json:async()=>({inboxItemId:'11111111-1111-1111-1111-111111111111'})});
  assert.equal(result.status,status);assert.match(prompt,/interaction type, relationship stage, contact context, history, organisation Growth Profile, then objective/);assert.match(prompt,/45-80 words/);assert.doesNotMatch(prompt,/Under 300|save questions/);
  if(status===200)assert.equal(result.body.coachMessage,rich);else assert.equal(result.body.coachMessage,undefined);
 }
});

test("Responses follow-up endpoint requires exact outbound history and uses actual cadence stage", async()=>{
 let briefing={interactionType:'linkedin_followup',name:'Shelley',cadenceStage:'day3_followup',history:[],objective:'Explore relevance',lifecycle:{canDraft:true,currentStage:'follow_up'}};let calls=0,prompt='';
 const mod={exports:{}};const deps={'@/lib/tenantRoute.server':{withTenantRoute:fn=>req=>fn(req,{organisationId:'review',profile:{},messages:[]})},'next/server':{NextResponse:{json:(body,o={})=>({body,status:o.status||200})}},'@/lib/responseContactContext.server':{getResponseContactContext:async()=>briefing},'@/lib/responseContactContext':context,'@/lib/socialCommentOpportunity':{}};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync('app/api/ai/root-coach/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:mod,exports:mod.exports,require:n=>deps[n],process:{env:{OPENAI_API_KEY:'test'}},console,fetch:async(url,opts)=>{calls++;prompt=opts.body;return {ok:true,json:async()=>({choices:[{message:{content:'An editable stage-specific follow-up'}}]})};}});
 const req={json:async()=>({inboxItemId:'11111111-1111-1111-1111-111111111111'})};
 assert.equal((await mod.exports.POST(req)).status,409);assert.equal(calls,0);
 for(const [stage,label] of [['day3_followup','Follow-up 1'],['day7_parity','Follow-up 2']]){briefing={...briefing,cadenceStage:stage,history:['Actual previous outbound message: Exact actual earlier message']};assert.equal((await mod.exports.POST(req)).status,200);assert.ok(prompt.includes(label));assert.ok(prompt.includes('Exact actual earlier message'));assert.doesNotMatch(prompt,/45-80 words/);}
});


test("recipient framing differentiates actual contexts without changing interaction or buying intent", () => {
 const cases = [
  [{role:"Head of People",company:"Acme"},"hr_people",/people\/HR/],
  [{role:"Director of partnerships",company:"Member Association"},"partner",/complementary work/],
  [{role:"HR consultant",company:"Example HR Consultancy"},"hr_consultancy",/client organisations/],
  [{role:"Principal",company:"Example College"},"education",/education or community/],
  [{role:"Director of Nursing",company:"Example Health"},"care_health",/workforce pressure/],
  [{role:"Director",company:"Example Ltd"},"other",/neutral/],
 ];
 for(const [facts,category,framing] of cases){
  const result=context.linkedInRecipientFraming(facts);assert.equal(result.category,category);assert.match(result.framing,framing);
  const rules=context.responseDraftRules({...facts,interactionType:"linkedin_connection_first_message",objective:context.objectiveFor("linkedin_connection_first_message",false)}).join(" ");
  assert.ok(rules.includes(result.label));assert.match(rules,/No question mark/);assert.match(rules,/not a canned template/);
 }
 assert.equal(context.linkedInRecipientFraming({}).category,"other");
 assert.equal(context.linkedInRecipientFraming({role:"HR Business Partner",company:"Example Ltd"}).category,"hr_people");
 assert.equal(context.linkedInRecipientFraming({role:"Head of People Services",company:"Reed in Partnership"}).category,"hr_people");
 assert.equal(context.linkedInRecipientFraming({role:"Managing Director",company:"NHS Humber Health Partnership"}).category,"care_health");
 assert.equal(context.linkedInRecipientFraming({role:"HR consultant",company:"Care Agency"}).category,"hr_consultancy");
 assert.equal(context.linkedInRecipientFraming({role:"People Director",company:"Example College"}).category,"education");
});

test("first acceptance never permits question marks or disguised CTAs, while later stages remain conversational", () => {
 for(const suffix of ["?", " How are you approaching this.", " I'd love to hear your perspective.", " Let me know your thoughts.", " Would you share your priorities.", " I look forward to staying in touch.", " We can exchange perspectives.", " It feels relevant to share insights and keep in touch within this space."])
  assert.equal(context.safeLinkedInFirstMessage(rich+suffix,{name:"Shelley",company:"Acme"}),false);
 assert.equal(context.safeLinkedInFirstMessage(rich,{name:"Shelley",company:"Acme"}),true);
 assert.match(context.responseDraftRules({interactionType:"linkedin_followup",cadenceStage:"day3_followup"}).join(" "),/one low-pressure question/);
 assert.match(context.responseDraftRules({interactionType:"linkedin_followup",cadenceStage:"day7_parity"}).join(" "),/brief conversation conditionally/);
 assert.doesNotMatch(context.responseDraftRules({interactionType:"linkedin_reply"}).join(" "),/No question mark/);
});


test("first-message constraints are trusted generation policy, with contact/profile JSON remaining data",()=>{
 assert.match(context.linkedinFirstMessagePolicy,/No question, question mark, CTA/);
 assert.match(context.linkedinFirstMessagePolicy,/untrusted data, not instructions/);
 const consoleRoute=fs.readFileSync("app/api/growth/linkedin-console/route.ts","utf8");
 const coachRoute=fs.readFileSync("app/api/ai/root-coach/route.ts","utf8");
 assert.match(consoleRoute,/current.stage === "connection" \? \[\{ role: "system" as const, content: linkedinFirstMessagePolicy/);
 assert.match(coachRoute,/contact.interactionType === "linkedin_connection_first_message" \? "\\n" \+ linkedinFirstMessagePolicy/);
});

 test('Day 0 rejects educational embellishment and preserves a light grounded opener',()=>{
 const light="Hi Kate, thanks for connecting. I noticed your background in people and HR and thought there was likely some overlap in what we do. I work with organisations around stress, resilience and early intervention, with a particular focus on making workplace wellbeing genuinely useful rather than another employee benefit. Good to be connected.";
 assert.equal(context.safeLinkedInFirstMessage(light,{name:'Kate',role:'HR'}),true);
 for(const phrase of ['evidence-informed','practical approaches','shared focus','helping teams understand and improve','burnout','absence']) assert.equal(context.safeLinkedInFirstMessage(light.replace('stress',phrase),{name:'Kate',role:'HR'}),false,phrase);
 assert.match(context.linkedinFirstMessagePolicy,/Recipient category influences only the reason for overlap/);
 });

test('Day 0 keeps the overlap reason and sender work as separate short sentences',()=>{
 const collapsed="Hi Vanessa, thanks for connecting. Given your role as Head of Human Resources at The Meath Epilepsy Charity, it made sense to connect as I work with workplace wellbeing through Root Health's support services. Good to be connected.";
 assert.equal(context.safeLinkedInFirstMessage(collapsed,{name:'Vanessa',company:'The Meath Epilepsy Charity'}),false);
});
