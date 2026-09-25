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
  assert.match(rules,/first outbound LinkedIn message/i); assert.match(rules,/not a reply/i); assert.match(rules,/never imply prior dialogue/i); assert.match(rules,/avoid a hard pitch/i);
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
