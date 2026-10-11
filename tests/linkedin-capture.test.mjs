import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import ts from "typescript";
const require = createRequire(import.meta.url);
function load(file, mocks = {}, globals = {}) {
  const mod = { exports: {} };
  const compiled = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInNewContext(compiled, { module: mod, exports: mod.exports, URL, URLSearchParams, Date, console, process,
    ...globals, require: name => mocks[name] || (name.startsWith("@/lib/") ? load(name.replace("@/", "") + ".ts", mocks, globals) : name.startsWith(".") ? load(path.join(path.dirname(file), `${name}.ts`), mocks, globals) : require(name)) });
  return mod.exports;
}
const profile = load("lib/linkedinCaptureProfile.ts");
const discovery = load("lib/linkedinConnectionDiscovery.ts");
const capture = load("lib/linkedinCapture.ts");
const person = (i, role = "HR Director at Example Group") => `<section><a href="https://www.linkedin.com/comm/in/person-${i}?trk=email"><img alt="Person ${i}"></a><a href="https://www.linkedin.com/comm/in/person-${i}?trk=email">Person ${i}</a><p>${role}</p><a href="https://www.linkedin.com/messaging/compose/?connId=person-${i}">Message</a></section>`;
const input = html => ({ subject: "See people’s connections, experience, and more", sender: "LinkedIn <invitations@linkedin.com>", html, gmailMessageId: "gmail-1", discoveredAt: "2026-10-11T10:00:00Z" });

test("real recommendation layout separates question link, name, embedded role and primary subject company", () => {
  const url = "https://www.linkedin.com/comm/in/person-1";
  const html = `<a href="${url}">Do you know Alex?</a><a href="${url}"><img></a><a href="${url}"><h2>Alex Example</h2></a><p>HR Director | Chief People Officer</p><p>3 mutual connections</p><a href="${url}">View profile</a><a href="https://linkedin.com/in/person-2"><table><tr><td><p>Jamie Example</p></td></tr><tr><td><p>CEO at Example Trust</p></td></tr></table></a><p>2 mutual connections</p>`;
  const people = capture.parseLinkedInRecommendations({ ...input(html), subject: "Someone at Example Homes you may know" });
  assert.equal(people.length, 2); assert.equal(people[0].name, "Alex Example"); assert.equal(people[0].headline, "HR Director | Chief People Officer"); assert.equal(people[0].company, "Example Homes");
  assert.equal(people[1].name, "Jamie Example"); assert.equal(people[1].headline, "CEO at Example Trust"); assert.equal(people[1].company, "Example Trust");
});

test("recommendation worker is bounded, skips old/acceptance messages, and never installs a trigger or sends", () => {
  const message = (subject, days = 0) => ({ getSubject: () => subject, getDate: () => new Date(Date.now() - days * 86400000), getFrom: () => "LinkedIn <invitations@linkedin.com>", getBody: () => person(1), getId: () => "mail" });
  let calls = 0;
  const context = { PropertiesService: { getScriptProperties: () => ({ getProperty: key => key === "OPS_ORGANISATION_ID" ? "org" : "x".repeat(32) }) },
    PHASE4D_EXPECTED_ORGANISATION_ID_: "org", isLinkedInAcceptanceMessage_: m => m.getSubject().includes("accepted"), Logger: { log() {} },
    GmailApp: { search(query, start, limit) { assert.match(query, /newer_than:14d/); assert.equal(start, 0); assert.equal(limit, 50); return [{ getMessages: () => [message("People you may know"), message("People you may know", 30), message("accepted your invitation"), message("Other mail")] }]; } },
    UrlFetchApp: { fetch(url, options) { calls++; assert.match(url, /linkedin-connections\/recommendations$/); assert.equal(JSON.parse(options.payload).source_engine, "root_health_b2b"); return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ success: true, inserted: 1, skipped: 0 }) }; } } };
  vm.createContext(context); vm.runInContext(fs.readFileSync("docs/linkedin-recommendation-intake.gs", "utf8"), context);
  assert.equal(context.runLinkedInRecommendationIntake().inserted, 1); assert.equal(calls, 1);
});

test("recommendation failure cannot break the existing acceptance timer result", () => {
  const context = vm.createContext({ Logger: { log() {} } });
  vm.runInContext(fs.readFileSync("docs/b2b-phase4d-apps-script.gs", "utf8"), context);
  context.processLinkedInAcceptanceIntake_ = () => ({ inserted: 4 });
  context.runLinkedInRecommendationIntake = () => { throw Error("configuration unavailable"); };
  assert.equal(context.runLinkedInAcceptanceIntake_().inserted, 4);
  assert.equal(context.runLinkedInAcceptanceIntake_().recommendations.failed, 1);
});

test("mobile capture retains input after failure, clears saving, and saves only after explicit acceptance", async () => {
  const React = require("react"), renderer = require("react-test-renderer"); globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  let resolveRequest, calls = 0;
  const Component = load("app/linkedin-capture/page.tsx", {}, { window: { location: { href: "https://ops.test/linkedin-capture?profile_url=https%3A%2F%2Flinkedin.com%2Fin%2Falex", pathname: "/linkedin-capture", search: "?profile_url=https%3A%2F%2Flinkedin.com%2Fin%2Falex" } }, fetch: () => { calls++; return new Promise(resolve => { resolveRequest = resolve; }); } }).default;
  let tree; await renderer.act(async () => { tree = renderer.create(React.createElement(Component)); });
  assert.equal(tree.root.findByType("button").props.disabled, true);
  await renderer.act(async () => tree.root.findAllByType("input").find(i => i.props.type === "checkbox").props.onChange({ target: { checked: true } }));
  await renderer.act(async () => { tree.root.findByType("button").props.onClick(); });
  assert.equal(tree.root.findByType("button").props.disabled, true); assert.equal(tree.root.findByType("button").children.join(""), "Saving…");
  await renderer.act(async () => tree.root.findByType("button").props.onClick()); assert.equal(calls, 1);
  await renderer.act(async () => resolveRequest({ ok: false, status: 401, json: async () => ({}) }));
  assert.equal(tree.root.findByType("button").props.disabled, false); assert.equal(tree.root.findAllByType("input")[0].props.value, "https://linkedin.com/in/alex");
  assert.match(tree.root.findByProps({ role: "status" }).children.join(""), /retained/);
  assert.match(tree.root.findByType("a").props.href, /next=/); await renderer.act(async () => tree.unmount());
});

test("five/four-person digests process all available profiles independently, including repeated image links", () => {
  for (const count of [5, 4]) {
    const parsed = discovery.parseLinkedInAcceptanceEmail(input(`<h1>You have ${count} new connections</h1>${Array.from({ length: count }, (_, i) => person(i)).join("")}<footer>Unsubscribe</footer>`));
    assert.equal(parsed.acceptedConnections.length, count);
    assert.equal(new Set(parsed.acceptedConnections.map(p => discovery.linkedinAcceptanceSourceRecordId(p.profileUrl))).size, count);
  }
});
test("digest body is authoritative without a particular subject or per-person messaging link", () => {
  const parsed = discovery.parseLinkedInAcceptanceEmail({ ...input(`<h1>You have <b>2</b> new connections</h1>${person(1)}${person(2)}`), subject: "Your new network" });
  assert.equal(parsed.acceptedConnections.length, 2);
});
test("a person repeated across a single email and digest retains the same source identity", () => {
  const digest = discovery.parseLinkedInAcceptanceEmail(input(`<h1>You have 2 new connections</h1>${person(1)}${person(2)}`));
  const single = discovery.parseLinkedInAcceptanceEmail({ ...input(person(1)), subject: "Person 1 accepted your invitation" });
  assert.equal(discovery.linkedinAcceptanceSourceRecordId(single.accepted.profileUrl), discovery.linkedinAcceptanceSourceRecordId(digest.acceptedConnections[0].profileUrl));
});
test("recommendations are not acceptances; digests are not recommendations", () => {
  const recommendation = { ...input(person(1)), subject: "Someone at Example Group you may know" };
  assert.equal(discovery.parseLinkedInAcceptanceEmail(recommendation), null);
  const people = capture.parseLinkedInRecommendations(recommendation);
  assert.equal(people.length, 1);
  assert.equal(people[0].name, "Person 1");
  assert.match(people[0].headline, /HR Director/);
  assert.match(people[0].company, /Example Group/);
  assert.equal(capture.parseLinkedInRecommendations(input(`<h1>You have 2 new connections</h1>${person(1)}${person(2)}`)).length, 0);
});
test("strict direct-profile URLs reject spoof domains, private URLs, redirects and unexpected paths", () => {
  assert.equal(profile.verifiedLinkedInProfile("https://www.linkedin.com/comm/in/person-1/?trk=foo"), "https://www.linkedin.com/in/person-1");
  for (const url of ["http://linkedin.com/in/person", "https://evil.test/linkedin.com/in/person", "https://linkedin.com.evil.test/in/person", "https://linkedin.com/feed/", "https://linkedin.com/in/a/extra", "https://user:secret@linkedin.com/in/person", "https://127.0.0.1/in/person"]) assert.equal(profile.verifiedLinkedInProfile(url), null);
  assert.equal(capture.parseLinkedInRecommendations({ ...input(person(1)), subject: "People you may know", sender: "invitations@linkedin.com.evil.test" }).length, 0);
  assert.equal(discovery.parseLinkedInAcceptanceEmail({ ...input(person(1)), subject: "Person accepted your invitation", sender: "invitations@linkedin.com.evil.test" }), null);
});
test("manual profile alone cannot assert acceptance; source and actual capture timestamp required", () => {
  const value = { profile_url: "https://linkedin.com/comm/in/person-1?trk=x", source: "manual_iphone_share", acceptance_confirmed: true, captured_at: "2026-10-11T10:00:00Z" };
  const result = capture.validateManualCapture(value, new Date("2026-10-11T11:00:00Z"));
  assert.equal(result.profileUrl, "https://www.linkedin.com/in/person-1");
  for (const invalid of [{ acceptance_confirmed: false }, { source: "gmail" }, { captured_at: "invalid" }, { captured_at: "2099-01-01" }]) assert.throws(() => capture.validateManualCapture({ ...value, ...invalid }));
});
function memoryDb(initial = []) {
  const rows = [...initial]; let writes = 0; let reads = 0;
  return { rows, get writes() { return writes; }, get reads() { return reads; }, from(table) {
    const filters = []; let pending = null;
    const query = { select() { return query; }, eq(k, v) { filters.push(r => r[k] === v); return query; },
      maybeSingle() { return Promise.resolve({ data: rows.find(r => r.table === table && filters.every(f => f(r))) || null, error: null }); },
      single() { return query.maybeSingle(); },
      upsert(values) { pending = values; return query; },
      then(resolve, reject) { return Promise.resolve().then(() => {
        reads++;
        if (!pending) return { data: rows.filter(r => r.table === table && filters.every(f => f(r))), error: null };
        const data = [];
        for (const value of pending) if (!rows.some(r => r.table === table && r.organisation_id === value.organisation_id && (value.linkedin_identity ? r.linkedin_identity === value.linkedin_identity : r.source_record_id === value.source_record_id))) { writes++; rows.push({ ...value, table }); data.push(value); }
        return { data, error: null };
      }).then(resolve, reject); } };
    return query;
  } };
}
const org = "78fa2ac8-e7b6-4b9b-9604-035723ece6b1";
function server(db) { return load("lib/linkedinCapture.server.ts", { "@/lib/supabaseAdmin": { supabaseAdmin: db }, "@/lib/linkedinConnectionDiscovery": discovery, "@/lib/linkedinCapture": capture }); }
test("manual share creates once, preserves actor/provenance, and Gmail acceptance dedupes without changing history", async () => {
  const db = memoryDb(); const api = server(db);
  const input = { profileUrl: "https://www.linkedin.com/in/person-1", capturedAt: "2026-10-11T10:00:00.000Z", name: "Person 1" };
  const first = await api.recordManualLinkedInAcceptance(org, "owner", input);
  const original = JSON.stringify(db.rows[0]);
  const second = await api.recordManualLinkedInAcceptance(org, "owner", input);
  assert.equal(first.duplicate, false); assert.equal(second.duplicate, true); assert.equal(db.writes, 1); assert.equal(JSON.stringify(db.rows[0]), original);
  assert.equal(db.rows[0].raw.actor, "owner"); assert.equal(db.rows[0].raw.source_format, "manual_iphone_share");
  assert.equal(discovery.linkedInAcceptanceDuplicate({ profileUrl: input.profileUrl, name: input.name }, db.rows).matchedRecordId, first.id);
  assert.equal(db.rows[0].contacted_at, undefined); assert.equal(db.rows[0].first_outbound_at, undefined);
});
test("existing Gmail acceptance wins manual share, while a different-kind identity fails closed", async () => {
  const existing = { table: "inbox_items", id: "gmail-existing", organisation_id: org, platform: "linkedin", kind: "connection_accepted", linkedin_identity: "linkedin.com/in/person-1" };
  const db = memoryDb([existing]);
  assert.equal((await server(db).recordManualLinkedInAcceptance(org, "owner", { profileUrl: "https://linkedin.com/in/person-1", capturedAt: "2026-10-11T10:00:00Z", name: "" })).id, existing.id);
  assert.equal(db.writes, 0);
  db.rows[0].kind = "comment";
  await assert.rejects(server(db).recordManualLinkedInAcceptance(org, "owner", { profileUrl: "https://linkedin.com/in/person-1", capturedAt: "2026-10-11T10:00:00Z", name: "" }));
});
test("accepted recommendation projects into Responses without rewriting the opportunity; unrelated Acquisition does no additional reads", async () => {
  const db = memoryDb([{ table: "inbox_items", id: "accepted-1", organisation_id: org, platform: "linkedin", kind: "connection_accepted", linkedin_identity: "linkedin.com/in/person-1" }]);
  const api = server(db);
  assert.equal(Object.keys(await api.linkedInRecommendationStates(org, [{ id: "commercial", source_engine: "root_health_b2b", source_url: null }])).length, 0);
  assert.equal(db.reads, 0);
  const state = await api.linkedInRecommendationStates(org, [{ id: "recommendation", source_engine: "linkedin_connection_recommendation", source_url: "https://linkedin.com/in/person-1?trk=email" }]);
  assert.equal(state.recommendation.acceptedConnectionId, "accepted-1"); assert.equal(state.recommendation.alreadyKnown, true); assert.equal(db.writes, 0);
});
test("manual endpoint authenticates tenant before origin/body checks; rejects cross-site or unconfirmed captures", async () => {
  let writes = 0; let tenantChecks = 0;
  const route = load("app/api/growth/linkedin-connections/capture/route.ts", {
    "next/server": { NextResponse: { json: (body, options = {}) => ({ body, status: options.status || 200 }) } },
    "@/lib/tenantRoute.server": { withTenantRoute: fn => req => { tenantChecks++; return fn(req, { organisationId: org, userId: "owner" }); } },
    "@/lib/growthIngestion.server": { readIngestionBody: req => req.json(), IngestionError: class extends Error { constructor(message) { super(message); this.status = 400; } } },
    "@/lib/linkedinCapture": capture,
    "@/lib/linkedinCapture.server": { recordManualLinkedInAcceptance: () => { writes++; return { id: "a", duplicate: false }; } },
  });
  const run = (origin, acceptance = true) => route.POST(new Request("https://ops.test/api/growth/linkedin-connections/capture", { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify({ profile_url: "https://linkedin.com/in/person-1", captured_at: "2026-10-11T10:00:00Z", acceptance_confirmed: acceptance, source: "manual_iphone_share" }) }));
  assert.equal((await run("https://evil.test")).status, 403);
  assert.equal((await run("https://ops.test", false)).status, 400);
  assert.equal((await run("https://ops.test")).status, 200);
  assert.equal(writes, 1); assert.equal(tenantChecks, 3);
});
test("recommendation RPC route uses existing tenant credentials, qualifies role, and only inserts Acquisition once", async () => {
  const db = memoryDb(); let authChecks = 0;
  const route = load("app/api/growth/linkedin-connections/recommendations/route.ts", {
    "next/server": { NextResponse: { json: (body, options = {}) => ({ body, status: options.status || 200 }) } },
    "@/lib/supabaseAdmin": { supabaseAdmin: db }, "@/lib/linkedinCapture": capture, "@/lib/linkedinConnectionDiscovery": discovery,
    "@/lib/growthIngestion.server": { readIngestionBody: req => req.json(), uuid: /^[a-f0-9-]{36}$/,
      authorizeIngestion(header, tenant, engines) { authChecks++; assert.equal(tenant, org); assert.equal(engines[0], "root_health_b2b"); assert.equal(header, "Bearer scoped-key"); },
      IngestionError: class extends Error { constructor(message) { super(message); this.status = 400; } } },
    "@/lib/brandGrowthProfile": { normaliseProfile: x => x, toGenerationProfile: () => ({ customers: {}, offer: {}, business: {} }) },
  });
  const run = html => route.POST(new Request("https://ops.test/api", { method: "POST", headers: { authorization: "Bearer scoped-key", "content-type": "application/json" },
    body: JSON.stringify({ organisation_id: org, source_engine: "root_health_b2b", subject: "People you may know", sender: "LinkedIn <invitations@linkedin.com>", html, gmail_message_id: "recommendation-mail", discovered_at: "2026-10-11T10:00:00Z" }) }));
  assert.equal((await run(person(1))).body.inserted, 1);
  assert.equal((await run(person(1))).body.inserted, 0);
  assert.equal(db.writes, 1); assert.equal(db.rows[0].table, "acquisition_items"); assert.equal(db.rows[0].metadata.acceptance_verified, false);
  assert.equal((await run(person(2, "School pupil"))).body.inserted, 0);
  assert.equal((await run(`<h1>You have 1 new connections</h1>${person(3)}`)).body.detected, 0);
  assert.equal(authChecks, 4); assert.equal(db.rows.some(r => r.table === "inbox_items"), false);
});
test("recommendation UI drafts editable current text and copies without lifecycle action; accepted contact cannot draft another invitation", async () => {
  const React = require("react"), renderer = require("react-test-renderer");
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  let copied = "", lifecycleCalls = 0;
  const Component = load("app/dashboard/growth/acquisition/LinkedInConnectionOpportunity.tsx", { "@/lib/linkedinCaptureProfile": profile }, { navigator: { clipboard: { writeText: async text => { copied = text; } } } }).default;
  const item = { id: "recommendation", person: "Alex", source_url: "https://linkedin.com/in/alex", status: "new", signal: "HR Director", metadata: { headline: "HR Director" }, linkedinConnectionState: { alreadyKnown: false, acceptedConnectionId: null } };
  let tree;
  const props = { item, organisationId: org, onSave: () => { lifecycleCalls++; }, onDismiss: () => { lifecycleCalls++; } };
  await renderer.act(async () => { tree = renderer.create(React.createElement(Component, props)); });
  const button = label => tree.root.findAllByType("button").find(b => b.children.join("") === label);
  await renderer.act(async () => button("Draft connection note").props.onClick());
  await renderer.act(async () => tree.root.findByType("textarea").props.onChange({ target: { value: "My edited connection note" } }));
  await renderer.act(async () => button("Copy current note").props.onClick());
  assert.equal(copied, "My edited connection note"); assert.equal(lifecycleCalls, 0);
  assert.equal(tree.root.findAllByType("a")[0].props.target, "_blank");
  await renderer.act(async () => tree.update(React.createElement(Component, { ...props, item: { ...item, linkedinConnectionState: { alreadyKnown: true, acceptedConnectionId: "accepted-1" } } })));
  assert.equal(button("Draft connection note"), undefined); assert.equal(tree.root.findAllByType("textarea").length, 0);
  assert.match(tree.root.findAllByType("a")[0].props.href, /itemId=accepted-1/);
  await renderer.act(async () => tree.unmount());
});
