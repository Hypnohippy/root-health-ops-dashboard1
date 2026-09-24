import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

function load(file) { const mod={exports:{}}; const output=ts.transpileModule(fs.readFileSync(file,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText; vm.runInNewContext(output,{module:mod,exports:mod.exports,require:()=>({})},{filename:file}); return mod.exports; }
const context = load("lib/responseContactContext.ts");

test("LinkedIn acceptance is classified as a first outbound message with plain customer language",()=>{
  const type=context.interactionTypeFor({platform:"linkedin",kind:"connection_accepted"},null);
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

test("later relationship stages use distinct drafting logic",()=>{
  assert.equal(context.interactionTypeFor({platform:"linkedin",kind:"unknown"},{stage:"day3_dm",last_action_at:"2026-09-20"}),"linkedin_followup");
  assert.equal(context.interactionTypeFor({platform:"linkedin",kind:"dm"},{stage:"day3_dm"}),"linkedin_reply");
  assert.equal(context.interactionTypeFor({platform:"email",kind:"email_reply"},null),"email_reply");
  assert.equal(context.interactionTypeFor({platform:"facebook",kind:"comment"},null),"social_reply");
  assert.equal(context.interactionTypeFor({platform:"linkedin"},{stage:"parked"}),"nurture");
  assert.equal(context.interactionTypeFor({platform:"linkedin"},{stage:"day3_dm",reply_status:"interested"}),"warm_opportunity");
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
  assert.match(route,/requireOrganisation\(requested, false\)/); assert.match(server,/from\("inbox_items"\)/); assert.match(server,/from\("acquisition_items"\)/); assert.match(server,/from\("growth_targets"\)/);
  assert.match(ai,/getResponseContactContext\(tenant\.organisationId, inboxItemId/); assert.match(ai,/Drafting hierarchy: interaction type, relationship stage/);
});

test("existing email and social controls remain in Responses and LinkedIn is never auto-sent",()=>{
  const ui=fs.readFileSync("app/dashboard/responses/page.tsx","utf8");
  assert.match(ui,/Approve & Send/); assert.match(ui,/selected\.platform !== "facebook" && selected\.platform !== "instagram"/); assert.match(ui,/Open on platform/);
  assert.doesNotMatch(ui,/api\/linkedin\/.*send|linkedin.*sendMessage/i);
});
