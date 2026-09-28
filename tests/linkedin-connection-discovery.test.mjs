import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import ts from "typescript";

const nodeRequire = createRequire(import.meta.url);
function load(file, mocks = {}) {
  const mod = { exports: {} };
  const output = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  vm.runInNewContext(output, { module: mod, exports: mod.exports, require: name => mocks[name] || nodeRequire(name), URL, URLSearchParams, Date }, { filename: file });
  return mod.exports;
}
const discovery = load("lib/linkedinConnectionDiscovery.ts");
const html = fs.readFileSync("tests/fixtures/linkedin-acceptance.html", "utf8");
const parsed = discovery.parseLinkedInAcceptanceEmail({ subject: "Nick Fahy accepted your invitation", sender: "invitations@e.linkedin.com", html, gmailMessageId: "gmail-123", discoveredAt: "2026-09-24T12:00:00.000Z" });

test("new identities remain eligible while true acceptance duplicates report their blocking record", () => {
  const record = { id: "existing-1", platform: "linkedin", kind: "connection_accepted", linkedin_identity: "linkedin.com/in/nick-fahy", permalink: "https://www.linkedin.com/in/nick-fahy?trk=old" };
  assert.equal(discovery.linkedInAcceptanceDuplicate({ ...parsed.accepted, profileUrl: "https://linkedin.com/in/nick-fahy-2" }, [record]), null);
  const duplicate = discovery.linkedInAcceptanceDuplicate(parsed.accepted, [record]);
  assert.equal(duplicate.matchedRecordId, "existing-1");
  assert.equal(duplicate.matchedRecordType, "linkedin/connection_accepted");
  assert.equal(duplicate.reason, "existing_acceptance_linkedin_identity");
  assert.equal(duplicate.candidateName, "Nick Fahy");
  assert.equal(duplicate.canonicalIdentity, "linkedin.com/in/nick-fahy");
});

test("legacy permalink matches and conflicting stored identities are visible in diagnostics", () => {
  const record = { id: "legacy-1", platform: "linkedin", kind: "connection_accepted", linkedin_identity: "linkedin.com/in/different-person", permalink: parsed.accepted.profileUrl };
  const duplicate = discovery.linkedInAcceptanceDuplicate(parsed.accepted, [record]);
  assert.equal(duplicate.reason, "existing_acceptance_permalink");
  assert.notEqual(duplicate.storedIdentity, duplicate.canonicalPermalink);
  assert.equal(discovery.linkedInAcceptanceDuplicate(parsed.accepted, [{ ...record, kind: "comment" }]), null);
});

test("similar names and identical companies never collapse different LinkedIn profiles", () => {
  const record = { id: "person-1", platform: "linkedin", kind: "connection_accepted", linkedin_identity: "linkedin.com/in/alex-smith", permalink: "https://linkedin.com/in/alex-smith" };
  const candidate = { ...parsed.accepted, name: "Alex Smith", company: "Same Company", profileUrl: "https://linkedin.com/in/alex-smith-2?trk=email" };
  assert.equal(discovery.linkedInAcceptanceDuplicate(candidate, [record]), null);
  assert.notEqual(discovery.linkedinAcceptanceSourceRecordId(candidate.profileUrl), discovery.linkedinAcceptanceSourceRecordId(record.permalink));
});

test("intake imports new people, blocks retries and diagnoses database conflicts within the tenant", async () => {
  const organisationId = "78fa2ac8-e7b6-4b9b-9604-035723ece6b1";
  const stored = [];
  const db = { from(table) {
    const filters = [];
    let pending = null;
    const query = {
      select() { return query; },
      eq(key, value) { filters.push(row => row[key] === value); return query; },
      in(key, values) { filters.push(row => values.includes(row[key])); return query; },
      maybeSingle() { return Promise.resolve({ data: null, error: null }); },
      upsert(rows, options) { assert.equal(options.onConflict, "organisation_id,linkedin_identity"); pending = rows; return query; },
      then(resolve, reject) {
        return Promise.resolve().then(() => {
          if (table !== "inbox_items") return { data: [], error: null };
          if (!pending) return { data: stored.filter(row => filters.every(filter => filter(row))), error: null };
          const data = [];
          for (const row of pending) {
            if (!stored.some(item => item.organisation_id === row.organisation_id && item.linkedin_identity === row.linkedin_identity)) { stored.push(row); data.push(row); }
          }
          return { data, error: null };
        }).then(resolve, reject);
      },
    };
    return query;
  } };
  class IngestionError extends Error {}
  const route = load("app/api/growth/linkedin-connections/ingest/route.ts", {
    "next/server": { NextResponse: { json: (body, options = {}) => ({ body, status: options.status || 200 }) } },
    "@/lib/supabaseAdmin": { supabaseAdmin: db },
    "@/lib/growthIngestion.server": { IngestionError, uuid: /^[a-f0-9-]{36}$/, readIngestionBody: req => req.json(), authorizeIngestion() {} },
    "@/lib/brandGrowthProfile": { normaliseProfile: value => value, toGenerationProfile: () => ({ customers: {}, offer: {}, business: {} }) },
    "@/lib/growthOutreach": { canonicalLinkedInProfile: discovery.canonicalLinkedInAcceptanceProfile },
    "@/lib/linkedinConnectionDiscovery": discovery,
  });
  const run = (diagnostics = true) => route.POST(new Request("https://ops.test/ingest", { method: "POST", body: JSON.stringify({
    organisation_id: organisationId, source_engine: "root_health_b2b", subject: "Your connections", sender: "invitations@linkedin.com",
    html: digestHtml(2).replaceAll("Accepted Person 2", "Accepted Person 1"), gmail_message_id: "digest-1", diagnostics,
  }) }));
  const first = await run();
  assert.equal(first.status, 200);
  assert.equal(first.body.acceptedConnectionsRecorded, 2);
  const retry = await run();
  assert.equal(retry.body.acceptedConnectionsRecorded, 0);
  assert.equal(retry.body.duplicateDiagnostics.length, 2);
  assert.equal(retry.body.duplicateDiagnostics[0].matchedRecordId, stored[0].id);
  stored[0].kind = "comment";
  const conflict = await run();
  const diagnostic = conflict.body.duplicateDiagnostics.find(item => item.reason === "database_linkedin_identity_conflict");
  assert.equal(diagnostic.matchedRecordId, stored[0].id);
  assert.equal(diagnostic.matchedRecordType, "linkedin/comment");
  assert.equal((await run(false)).body.duplicateDiagnostics, undefined);
  stored.forEach(row => { row.organisation_id = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"; });
  assert.equal((await run()).body.acceptedConnectionsRecorded, 2);
});

test("extracts the accepted contact, role, profile and direct message link", () => {
  assert.equal(parsed.acceptedConnections.length, 1);
  assert.equal(parsed.accepted.name, "Nick Fahy");
  assert.match(parsed.accepted.headline, /Director of People at Example Care Group/);
  assert.equal(parsed.accepted.company, "Example Care Group");
  assert.match(parsed.accepted.profileUrl, /linkedin\.com\/in\/nick-fahy/);
  assert.match(parsed.accepted.messageUrl, /linkedin\.com\/messaging\/compose/);
});

function digestHtml(count) {
  const people = Array.from({ length: count }, (_, index) => `<section><a href="https://www.linkedin.com/in/accepted-${index + 1}?trk=email">Accepted Person ${index + 1}</a><div>${index === 0 ? "Chief People Officer at Company One" : `Role ${index + 1} at Company ${index + 1}`}</div><a href="https://www.linkedin.com/messaging/compose/?recipient=accepted-${index + 1}">Message</a></section>`).join("");
  return `<html><body><h1>You have ${count} new connections</h1>${people}<h2>Suggestions from Kate’s network</h2><a href="https://www.linkedin.com/in/suggested-person">Suggested Person</a><div>People Partner at Other Co</div><footer><a href="https://www.linkedin.com/in/footer-junk">Footer Junk</a><a href="https://linkedin.com/help">Help</a><a href="https://linkedin.com/unsubscribe">Unsubscribe</a></footer></body></html>`;
}

function parseDigest(count) { return discovery.parseLinkedInAcceptanceEmail({ subject: "See Kate’s and other people’s connections, experience, and more", sender: "LinkedIn <invitations@linkedin.com>", html: digestHtml(count), gmailMessageId: `digest-${count}`, discoveredAt: "2026-09-24T12:00:00.000Z" }); }

test("accepted-invitation digests yield every accepted connection with correctly paired context", () => {
  for (const count of [2, 3, 9]) {
    const result = parseDigest(count);
    assert.equal(result.sourceFormat, "digest");
    assert.equal(result.acceptedConnections.length, count);
    assert.equal(result.suggestions.length, 0);
    result.acceptedConnections.forEach((person, index) => {
      assert.equal(person.name, `Accepted Person ${index + 1}`);
      assert.match(person.profileUrl, new RegExp(`accepted-${index + 1}`));
      assert.match(person.messageUrl, new RegExp(`accepted-${index + 1}`));
      assert.match(person.headline, new RegExp(index === 0 ? "Chief People Officer" : `Role ${index + 1}`));
    });
  }
});

test("digest parsing excludes suggestion sections, footer, help and unsubscribe links", () => {
  const names = parseDigest(3).acceptedConnections.map(person => person.name);
  assert.deepEqual(Array.from(names), ["Accepted Person 1", "Accepted Person 2", "Accepted Person 3"]);
  assert.equal(names.includes("Suggested Person"), false);
  assert.equal(names.includes("Footer Junk"), false);
});

test("accepted-person identity is stable across Gmail messages and tracking parameters", () => {
  assert.equal(discovery.linkedinAcceptanceSourceRecordId("https://www.linkedin.com/comm/in/person?trk=one"), discovery.linkedinAcceptanceSourceRecordId("https://linkedin.com/in/person/?trk=two"));
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
  assert.equal(discovery.uniqueLinkedInSuggestions(parsed, new Set(), new Set([discovery.canonicalLinkedInAcceptanceProfile("https://www.linkedin.com/in/sam-designer")])).some(item => item.name === "Sam Designer"), false);
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
  assert.match(draft, /Example Care Group/);
  assert.ok(draft.length < 300);
  assert.doesNotMatch(draft, /most important|caught my attention|\?/);
  assert.doesNotMatch(draft, /Thanks for connecting/i);
  const source = fs.readFileSync("lib/linkedinConnectionDiscovery.ts", "utf8");
  assert.doesNotMatch(source, /fetch\(|axios|linkedin.*POST|sendMessage/i);
});

test("rejects promotional or non-acceptance mail", () => {
  assert.equal(discovery.parseLinkedInAcceptanceEmail({ subject: "People you may know", sender: "news@e.linkedin.com", html, gmailMessageId: "x" }), null);
  assert.equal(discovery.parseLinkedInAcceptanceEmail({ subject: "Nick accepted your invitation", sender: "attacker@example.com", html, gmailMessageId: "x" }), null);
  assert.equal(discovery.parseLinkedInAcceptanceEmail({ subject: "See people’s connections, experience, and more", sender: "invitations@linkedin.com", html: "<p>People you may know</p>", gmailMessageId: "x" }), null);
});

test("ingestion uses person-level tenant dedupe and never routes digest contacts into Acquisition", () => {
  const route = fs.readFileSync("app/api/growth/linkedin-connections/ingest/route.ts", "utf8");
  const migration = fs.readFileSync("supabase/migrations/20260924193000_linkedin_acceptance_identity.sql", "utf8");
  assert.match(route, /parsed\.acceptedConnections/);
  assert.match(route, /onConflict: "organisation_id,linkedin_identity"/);
  assert.match(route, /source_format: parsed\.sourceFormat/);
  assert.match(route, /from\("growth_targets"\)/); assert.match(route, /from\("acquisition_items"\)/); assert.match(route, /from\("inbox_items"\)/);
  assert.match(migration, /unique index[\s\S]*organisation_id, linkedin_identity/i);
  assert.match(route, /suggestions: digest \? \[\] : suggestions|uniqueLinkedInSuggestions/);
});

test("worker detects individual and digest mail, provides bounded label-independent backfill, and never sends LinkedIn messages", () => {
  const worker = fs.readFileSync("docs/b2b-phase4d-apps-script.gs", "utf8");
  assert.match(worker, /backfillLinkedInAcceptanceLast30Days_/);
  assert.match(worker, /newer_than:30d/);
  assert.match(worker, /You have\\s\+\\d\+\\s\+new connections/);
  assert.doesNotMatch(worker, /LinkedIn.*sendMessage|linkedin\.com\/.*UrlFetchApp\.fetch/i);
  assert.match(worker, /doPost\(e\)/);
  const statusRoute = fs.readFileSync("app/api/responses/update-status/route.ts", "utf8");
  assert.match(statusRoute, /requireOrganisation\(organisationId, true\)/);
  const responses = fs.readFileSync("app/dashboard/responses/page.tsx", "utf8");
  assert.match(responses, /Open LinkedIn Message/); assert.match(responses, /Mark Contacted/); assert.match(responses, /responses_lifecycle_draft_v1/);
});
