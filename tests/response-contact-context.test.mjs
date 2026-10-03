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
  assert.doesNotMatch(context.messageTypeLabel(type),/connection_accepted|day3_dm|linkedin_connection_network/);
});

test("first-message rules prohibit fake prior dialogue and aggressive pitching",()=>{
  const briefing={interactionType:"linkedin_connection_first_message",objective:"Open a relevant conversation."};
  const rules=context.responseDraftRules(briefing).join(" ");
  assert.match(rules,/first outbound LinkedIn message/i); assert.match(rules,/not a reply/i); assert.match(rules,/never imply prior dialogue/i); assert.match(rules,/No emojis, pitch, product explanation, question, meeting\/demo\/call ask/i);
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
  assert.match(route,/requireOrganisation\(requested, false\)/); assert.match(server,/readLifecycleInput\(organisationId\)/); assert.match(server,/buildContactLifecycle\(organisationId, input\)/); assert.match(server,/presentResponseLifecycle\(contact, item\)/);
  assert.match(ai,/getResponseContactContext\(tenant\.organisationId, inboxItemId/); assert.match(ai,/Drafting hierarchy: current unified lifecycle stage/);
});

test("existing email and social controls remain in Responses and LinkedIn is never auto-sent",()=>{
  const ui=fs.readFileSync("app/dashboard/responses/page.tsx","utf8");
  assert.match(ui,/Approve & Send/); assert.match(ui,/selected\.platform !== "facebook" && selected\.platform !== "instagram"/); assert.match(ui,/Open on platform/);
  assert.doesNotMatch(ui,/api\/linkedin\/.*send|linkedin.*sendMessage/i);
});

test("Shelley's generic opener and Day 3 discovery questions are rejected", () => {
  for (const draft of [
    "Hi Shelley, great to connect here! I'd love to hear your thoughts on current wellbeing challenges in HR—what's top of mind for you these days?",
    "Hi Shelley, I noticed your role at Acme.",
    "Hi Shelley, I came across Acme and love what you're doing.",
    "Hi Shelley, thanks for connecting. Book a call about our platform at Acme.",
    "Hi Shelley, what is most important in your remit at Acme.",
    "Hi Shelley, good to connect. What's changing at Acme?",
    "Hi Shelley, great to connect here.",
    "Hi Shelley, I'd love to hear your thoughts.",
    "Hi Shelley, what's top of mind?",
    "Hi Shelley, I noticed your team.",
    "Hi Shelley, let me share our pitch.",
    "Hi Shelley, let me show you a demo.",
    "Hi Shelley, let's have a quick call.",
    "Hi Shelley, we help teams improve wellbeing.",
    "Hi Shelley, what are your team's priorities?",
  ]) assert.equal(context.safeLinkedInFirstMessage(draft, {company:'Acme'}), false);
});

test("Day 1 accepts human hellos without literal company or role matches", () => {
  const hello = "Hi Shelley, good to connect. I thought I’d say hello properly.";
  assert.equal(context.safeLinkedInFirstMessage(hello, {company:'Acme', role:'HR director'}), true);
  assert.equal(context.safeLinkedInFirstMessage(hello, {role:'HR director'}), true);
  assert.equal(context.safeLinkedInFirstMessage('Hi Shelley, good to connect. I wanted to say hello to you at Acme properly.', {company:'Acme'}), true);
  assert.equal(context.safeLinkedInFirstMessage('Hi Shelley, good to connect. Your work in workforce planning is a useful point of overlap, so I thought I would say hello properly.', {role:'Workforce planning'}), true);
  assert.equal(context.safeLinkedInFirstMessage('Hi Shelley, good to connect. A hello to a fellow people leader.', {company:'Acme', role:'HR director'}), true);
  assert.equal(context.safeLinkedInFirstMessage('Hi Shelley, good to connect. I thought I would say hello properly.'), true);
  assert.equal(context.safeLinkedInFirstMessage('a'.repeat(301)), false);
  assert.equal(context.safeLinkedInFirstMessage('a'.repeat(300)), false);
  assert.equal(context.safeLinkedInFirstMessage('a'.repeat(299)), true);
  assert.equal(context.safeLinkedInFirstMessage('   '), false);
});

const jamesFiller = 'Hi James, thanks for connecting. Just wanted to say hello and look forward to staying in touch.';
const jamesNatural = 'Hi James, good to connect. I work around workplace wellbeing and stress, so there’s probably some overlap in the things we both see day to day. Thought I’d say hello properly.';
const jamesCorporate = 'Hi James, I work in workplace wellbeing, focusing on stress and resilience. Given your role, I thought it made sense to reach out and say hello.';
const jamesSpoken = 'Hi James, good to connect. I spend a lot of my time around stress and wellbeing at work, so I thought I’d say hello properly.';
const jamesContextual = 'Hi James, good to connect. There’s probably a bit of overlap between the work you’re doing and the stuff I’m involved with around workplace stress, so I thought I’d say hello properly.';

test('Day 1 rejects consultancy introductions and accepts both spoken James examples', () => {
  assert.equal(context.safeLinkedInFirstMessage(jamesCorporate), false);
  for (const draft of [jamesSpoken, jamesContextual]) assert.equal(context.safeLinkedInFirstMessage(draft, {company:'Acme'}), true);
  for (const phrase of ['Given your role', 'I work in workplace wellbeing', 'focusing on stress', 'reach out', 'made sense to reach out', 'given your experience', 'given your background', 'there may be synergies', 'areas of overlap', 'stress, resilience and wellbeing', 'wellbeing, stress, and resilience']) {
    assert.equal(context.safeLinkedInFirstMessage(`Hi James, ${phrase}.`), false, phrase);
  }
});

test('Day 1 rejects networking filler while accepting natural sender-side context', () => {
  assert.equal(context.safeLinkedInFirstMessage(jamesFiller), false);
  assert.equal(context.safeLinkedInFirstMessage(jamesNatural, {company:'Acme', role:'People director'}), true);
  for (const phrase of ['thanks for connecting', 'just wanted to say hello', 'look forward to staying in touch', 'stay in touch', 'pleasure to connect', 'thanks for the connection', "hope you're well", 'hope you’re well', 'hope you are well', 'THANKS FOR\nCONNECTING']) {
    assert.equal(context.safeLinkedInFirstMessage(`Hi James, ${phrase}.`), false, phrase);
  }
});

test('active root-coach endpoint rejects bad model output and returns grounded editable copy', async()=>{
 const briefing={interactionType:'linkedin_connection_first_message',messageType:'First message after connection',company:'Acme',role:'HR director',name:'Shelley',objective:'Say hello',lifecycle:{canDraft:true,currentStage:'outreach_ready'}};
 for(const [draft,status] of [[jamesCorporate,409],[jamesSpoken,200],[jamesContextual,200],[jamesFiller,409],[jamesNatural,200],["Hi Shelley, great to connect here! What's top of mind at Acme?",409],['Hi Shelley, good to connect. I wanted to say hello to you at Acme properly.',200],["Hi Shelley, good to connect. I thought I’d say hello properly.",200],['Hi Shelley, good to connect. A hello to a fellow people leader.',200]]) {
  const mod={exports:{}};let prompt='';
  const deps={'@/lib/tenantRoute.server':{withTenantRoute:fn=>req=>fn(req,{organisationId:'review',profile:{},messages:[]})},'next/server':{NextResponse:{json:(body,o={})=>({body,status:o.status||200})}},'@/lib/responseContactContext.server':{getResponseContactContext:async(org)=>{assert.equal(org,'review');return briefing;}},'@/lib/responseContactContext':context,'@/lib/socialCommentOpportunity':{}};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('app/api/ai/root-coach/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:mod,exports:mod.exports,require:n=>{assert.ok(n in deps,n);return deps[n];},process:{env:{OPENAI_API_KEY:'test'}},console,fetch:async(url,opts)=>{assert.equal(url,'https://api.openai.com/v1/chat/completions');prompt=opts.body;return {ok:true,json:async()=>({choices:[{message:{content:draft}}]})};}});
  const result=await mod.exports.POST({json:async()=>({inboxItemId:'11111111-1111-1111-1111-111111111111'})});
  assert.equal(result.status,status);assert.match(prompt,/Day 1/);assert.match(prompt,/Acme/);assert.match(prompt,/No emojis/);assert.match(prompt,/Exact company names and role words are optional/);
  assert.match(prompt,/prefer natural sender-side context/);assert.match(prompt,/only when supported by the supplied sender profile/);assert.match(prompt,/Never use networking filler/);
  assert.match(prompt,/Use contractions and normal spoken English/);assert.match(prompt,/Only with genuine recipient context/);assert.match(prompt,/Never use corporate introductions/);
  if(status===200)assert.equal(result.body.coachMessage,draft);else assert.equal(result.body.coachMessage,undefined);
 }
});
