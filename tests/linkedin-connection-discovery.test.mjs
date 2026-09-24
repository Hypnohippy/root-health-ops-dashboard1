import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import ts from "typescript";

const nodeRequire = createRequire(import.meta.url);
function load(file) {
  const mod = { exports: {} };
  const output = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  vm.runInNewContext(output, { module: mod, exports: mod.exports, require: nodeRequire, URLSearchParams, Date }, { filename: file });
  return mod.exports;
}
const discovery = load("lib/linkedinConnectionDiscovery.ts");
const html = fs.readFileSync("tests/fixtures/linkedin-acceptance.html", "utf8");
const parsed = discovery.parseLinkedInAcceptanceEmail({ subject: "Nick Fahy accepted your invitation", sender: "invitations@e.linkedin.com", html, gmailMessageId: "gmail-123", discoveredAt: "2026-09-24T12:00:00.000Z" });

test("extracts the accepted contact, role, profile and direct message link", () => {
  assert.equal(parsed.accepted.name, "Nick Fahy");
  assert.match(parsed.accepted.headline, /Director of People at Example Care Group/);
  assert.equal(parsed.accepted.company, "Example Care Group");
  assert.match(parsed.accepted.profileUrl, /linkedin\.com\/in\/nick-fahy/);
  assert.match(parsed.accepted.messageUrl, /linkedin\.com\/messaging\/compose/);
});

test("extracts unique network suggestions without footer recommendations", () => {
  assert.deepEqual(Array.from(parsed.suggestions, item => item.name), ["Alison Anderson", "Sam Designer"]);
  assert.equal(parsed.suggestions[0].mutualConnections, 1);
  assert.equal(parsed.suggestions.some(item => item.name.includes("Footer")), false);
});

test("uses stable context identity and filters existing candidates", () => {
  const alison = parsed.suggestions[0];
  const id = discovery.linkedinNetworkSourceRecordId(parsed.accepted.profileUrl, alison.profileUrl);
  assert.equal(id, discovery.linkedinNetworkSourceRecordId(`${parsed.accepted.profileUrl}?different=email`, `${alison.profileUrl}?trk=again`));
  assert.equal(discovery.uniqueLinkedInSuggestions(parsed, new Set([id]), new Set()).some(item => item.name === "Alison Anderson"), false);
  assert.equal(discovery.uniqueLinkedInSuggestions(parsed, new Set(), new Set(["https://www.linkedin.com/in/sam-designer"])).some(item => item.name === "Sam Designer"), false);
});

test("buyer targeting keeps relevant people and filters irrelevant suggestions", () => {
  assert.equal(discovery.qualifiesForBuyerTargeting(parsed.suggestions[0], { audience: "People leaders", priorityServices: ["wellbeing"] }).relevant, true);
  assert.equal(discovery.qualifiesForBuyerTargeting(parsed.suggestions[1], { audience: "People leaders", priorityServices: ["wellbeing"] }).relevant, false);
});

test("builds an Acquisition candidate with stable provenance and customer-facing context", () => {
  const record = discovery.buildLinkedInCandidateRecord(parsed, parsed.suggestions[0]);
  assert.equal(record.source_engine, "linkedin_connection_network");
  assert.equal(record.record_type, "personal_opportunity");
  assert.match(record.signal, /Suggested via Nick Fahy → Alison Anderson/);
  assert.equal(record.metadata.source_gmail_message_id, "gmail-123");
  assert.equal(record.metadata.profile_url, parsed.suggestions[0].profileUrl);
});

test("accepted-contact output is a human-review draft and never sends LinkedIn messages", () => {
  const draft = discovery.acceptedConnectionDraft(parsed.accepted);
  assert.match(draft, /Director of People/);
  assert.doesNotMatch(draft, /Thanks for connecting/i);
  const source = fs.readFileSync("lib/linkedinConnectionDiscovery.ts", "utf8");
  assert.doesNotMatch(source, /fetch\(|axios|linkedin.*POST|sendMessage/i);
});

test("rejects promotional or non-acceptance mail", () => {
  assert.equal(discovery.parseLinkedInAcceptanceEmail({ subject: "People you may know", sender: "news@e.linkedin.com", html, gmailMessageId: "x" }), null);
  assert.equal(discovery.parseLinkedInAcceptanceEmail({ subject: "Nick accepted your invitation", sender: "attacker@example.com", html, gmailMessageId: "x" }), null);
});
