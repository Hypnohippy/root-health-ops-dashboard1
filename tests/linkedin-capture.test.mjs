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
  vm.runInNewContext(compiled, { module: mod, exports: mod.exports, URL, URLSearchParams, Date, console, process, AbortController, setTimeout, clearTimeout,
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
  const Component = load("app/linkedin-capture/page.tsx", {}, { window: { location: { href: "https://ops.test/linkedin-capture?profile_url=https%3A%2F%2Flinkedin.com%2Fin%2Falex", pathname: "/linkedin-capture", search: "?profile_url=https%3A%2F%2Flinkedin.com%2Fin%2Falex" } }, fetch: (url, options) => { if (options.signal) return Promise.resolve({ ok: false, status: 401, json: async () => ({}) }); calls++; return new Promise(resolve => { resolveRequest = resolve; }); } }).default;
  let tree; await renderer.act(async () => { tree = renderer.create(React.createElement(Component)); });
  assert.equal(tree.root.findByType("button").props.disabled, true);
  await renderer.act(async () => tree.root.findAllByType("input")[1].props.onChange({ target: { value: "Alex Example" } }));
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
  const value = { profile_url: "https://linkedin.com/comm/in/person-1?trk=x", name: "Alex Example", source: "manual_iphone_share", acceptance_confirmed: true, captured_at: "2026-10-11T10:00:00Z" };
  const result = capture.validateManualCapture(value, new Date("2026-10-11T11:00:00Z"));
  assert.equal(result.profileUrl, "https://www.linkedin.com/in/person-1");
  for (const invalid of [{ acceptance_confirmed: false }, { source: "gmail" }, { captured_at: "invalid" }, { captured_at: "2099-01-01" }]) assert.throws(() => capture.validateManualCapture({ ...value, ...invalid }));
});
function memoryDb(initial = []) {
  const rows = [...initial]; let writes = 0; let reads = 0;
  return { rows, get writes() { return writes; }, get reads() { return reads; }, from(table) {
    const filters = []; let pending = null, patch = null, range = [0, Infinity];
    const query = { order() { return query; }, range(start, end) { range = [start, end]; return query; }, is(k, v) { filters.push(r => r[k] === v); return query; }, update(value) { patch = value; return query; }, select() { return query; }, eq(k, v) { filters.push(r => r[k] === v); return query; },
      maybeSingle() { return Promise.resolve({ data: rows.find(r => r.table === table && filters.every(f => f(r))) || null, error: null }); },
      single() { return query.maybeSingle(); },
      upsert(values) { pending = values; return query; },
      then(resolve, reject) { return Promise.resolve().then(() => {
        reads++;
        if (patch) { const matched = rows.filter(r => r.table === table && filters.every(f => f(r))); for (const row of matched) { Object.assign(row, patch); writes++; } return { data: matched, error: null }; }
        if (!pending) return { data: rows.filter(r => r.table === table && filters.every(f => f(r))).slice(range[0], range[1] + 1), error: null };
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
  const run = (origin, acceptance = true) => route.POST(new Request("https://ops.test/api/growth/linkedin-connections/capture", { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify({ profile_url: "https://linkedin.com/in/person-1", captured_at: "2026-10-11T10:00:00Z", name: "Alex Example", acceptance_confirmed: acceptance, source: "manual_iphone_share" }) }));
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
const names = load("lib/linkedinCaptureName.ts");
test("trusted canonical names outrank slugs; ambiguous identities and conflicting names fail closed", () => {
 const url = "https://www.linkedin.com/in/kate-bates-chartered-fcipd-6193401b";
 assert.equal(names.resolveLinkedInName(url, [{ linkedin_identity: "linkedin.com/in/kate-bates-chartered-fcipd-6193401b", author_name: "Kate Bates FCIPD" }]).name, "Kate Bates FCIPD");
 assert.equal(names.resolveLinkedInName(url, [{ source_url: url, person: "Kate Bates" }]).source, "stored");
 assert.equal(names.resolveLinkedInName(url, [{ linkedin_url: url, target_name: "Kate Bates" }]).source, "stored");
 assert.equal(names.resolveLinkedInName(url, [{ permalink: url, author_name: "Kate Bates" }, { permalink: url, author_name: "Different Person" }]).source, "manual");
 assert.equal(names.resolveLinkedInName("https://evil.test/article", [{ permalink: "https://evil.test/article", author_name: "Wrong" }]).name, "");
 assert.equal(names.linkedInSlugName(url), "Kate Bates");
 assert.equal(names.linkedInSlugName("https://linkedin.com/in/alex-smith-123456"), "Alex Smith");
 for (const slug of ["123456", "alex", "hr-director", "alex-smith-coach", "alex-smith-jones", "alex123-smith"]) assert.equal(names.linkedInSlugName(`https://linkedin.com/in/${slug}`), null);
});

test("name resolver is tenant scoped and accepted Acquisition references perform no writes", async () => {
 const db = memoryDb([
  { table: "inbox_items", id: "accepted-1", organisation_id: org, platform: "linkedin", kind: "connection_accepted", linkedin_identity: "linkedin.com/in/alex-smith", author_name: "Alex Smith", status: "needs_reply" },
  { table: "inbox_items", id: "foreign", organisation_id: "foreign-org", platform: "linkedin", kind: "connection_accepted", linkedin_identity: "linkedin.com/in/alex-smith", author_name: "Wrong Person" },
 ]);
 const api = server(db);
 assert.equal((await api.resolveCaptureName(org, "https://linkedin.com/comm/in/alex-smith?trk=test")).name, "Alex Smith");
 const items = await api.acceptedLinkedInOpportunities(org);
 assert.equal(items.length, 1); assert.equal(items[0].id, "accepted:accepted-1"); assert.equal(items[0].linkedinConnectionState.acceptedConnectionId, "accepted-1");
 assert.equal(items[0].source_url, "https://www.linkedin.com/in/alex-smith"); assert.equal(db.writes, 0);
});

test("URL-only capture resolves known name and keeps user edits when async lookup finishes", async () => {
 const React = require("react"), renderer = require("react-test-renderer"); globalThis.IS_REACT_ACT_ENVIRONMENT = true;
 let finish;
 const Component = load("app/linkedin-capture/page.tsx", {}, { window: { location: { href: "https://ops.test/linkedin-capture?profile_url=https%3A%2F%2Flinkedin.com%2Fin%2Falex-smith", pathname: "/linkedin-capture", search: "" } }, fetch: async url => url.startsWith("/api/org/") ? { ok: true, json: async () => ({ organisationId: org }) } : new Promise(resolve => { finish = resolve; }) }).default;
 let tree; await renderer.act(async () => { tree = renderer.create(React.createElement(Component)); });
 assert.equal(tree.root.findAllByType("input")[1].props.value, "Alex Smith");
 assert.equal(tree.root.findByType("button").props.disabled, true);
 await renderer.act(async () => finish({ ok: true, json: async () => ({ name: "Alexandra Smith", source: "stored" }) }));
 assert.equal(tree.root.findAllByType("input")[1].props.value, "Alexandra Smith");
 await renderer.act(async () => tree.root.findAllByType("input")[0].props.onChange({ target: { value: "https://linkedin.com/in/jamie-smith" } }));
 await renderer.act(async () => tree.root.findAllByType("input")[1].props.onChange({ target: { value: "My edited name" } }));
 await renderer.act(async () => finish({ ok: true, json: async () => ({ name: "Jamie Smith", source: "stored" }) }));
 assert.equal(tree.root.findAllByType("input")[1].props.value, "My edited name");
 await renderer.act(async () => tree.unmount());
});

test("ambiguous URL-only capture requires name and server rejects nameless creation", async () => {
 const React = require("react"), renderer = require("react-test-renderer");
 const Component = load("app/linkedin-capture/page.tsx", {}, { window: { location: { href: "https://ops.test/linkedin-capture?profile_url=https%3A%2F%2Flinkedin.com%2Fin%2F123456", pathname: "/linkedin-capture", search: "" } }, fetch: async () => ({ ok: false, status: 401, json: async () => ({}) }) }).default;
 let tree; await renderer.act(async () => { tree = renderer.create(React.createElement(Component)); });
 await renderer.act(async () => tree.root.findAllByType("input")[2].props.onChange({ target: { checked: true } }));
 assert.equal(tree.root.findByType("button").props.disabled, true);
 assert.throws(() => capture.validateManualCapture({ name: "", profile_url: "https://linkedin.com/in/123456", source: "manual_iphone_share", acceptance_confirmed: true, captured_at: "2026-10-11T10:00:00Z" }));
 const db = memoryDb(); await assert.rejects(server(db).recordManualLinkedInAcceptance(org, "actor", { name: "", profileUrl: "https://linkedin.com/in/123456", capturedAt: "2026-10-11T10:00:00Z" })); assert.equal(db.writes, 0);
 await renderer.act(async () => tree.unmount());
});

test("accepted references link to the exact existing Responses record and never expose invitations", async () => {
 const React = require("react"), renderer = require("react-test-renderer");
 const Component = load("app/dashboard/growth/acquisition/LinkedInConnectionOpportunity.tsx").default;
 let tree; await renderer.act(async () => { tree = renderer.create(React.createElement(Component, { organisationId: org, item: { id: "accepted:real-id", person: "Alex Smith", source_url: "https://linkedin.com/in/alex-smith", status: "connected", metadata: {}, linkedinConnectionState: { acceptedConnectionId: "real-id", alreadyKnown: true } }, onSave() { throw Error("no write"); }, onDismiss() { throw Error("no write"); } })); });
 assert.equal(tree.root.findAllByType("button").length, 0);
 assert.match(tree.root.findAllByType("a")[0].props.href, /^\/dashboard\/responses\?/);
 assert.match(tree.root.findAllByType("a")[0].props.href, /itemId=real-id/);
 assert.match(tree.root.findAllByType("a")[0].props.href, new RegExp(`organisationId=${org}`));
 await renderer.act(async () => tree.unmount());
});

test("explicit recapture only fills a blank name, preserving all acceptance and send evidence", async () => {
 const original = { table: "inbox_items", id: "existing", organisation_id: org, platform: "linkedin", kind: "connection_accepted", linkedin_identity: "linkedin.com/in/alex-smith", author_name: null, raw: { actor: "gmail-worker", evidence: "Original Gmail" }, contacted_at: "2026-01-01", created_at_platform: "2025-01-01", manual_completion: { message: "Preserved" } };
 const db = memoryDb([structuredClone(original)]);
 const input = { profileUrl: "https://linkedin.com/in/alex-smith", capturedAt: "2026-10-11T10:00:00Z", name: "Alex Smith" };
 const result = await server(db).recordManualLinkedInAcceptance(org, "operator", input);
 assert.equal(result.duplicate, true); assert.equal(result.nameUpdated, true);
 assert.deepEqual(db.rows[0], { ...original, author_name: "Alex Smith" });
 await server(db).recordManualLinkedInAcceptance(org, "operator", { ...input, name: "Wrong name" });
 assert.equal(db.writes, 1); assert.equal(db.rows[0].author_name, "Alex Smith");
});

test("LinkedIn Acquisition view references accepted inbox records and dedupes recommendations before pagination", async () => {
 const db = memoryDb(Array.from({ length: 26 }, (_, i) => ({ table: "acquisition_items", id: `rec-${i}`, organisation_id: org, source_engine: "linkedin_connection_recommendation", source_url: `https://linkedin.com/in/person-${i}`, person: `Person ${i}`, created_at: "2026-01-01" })));
 const accepted = [
  { id: "accepted:existing", source_url: "https://linkedin.com/in/person-0", linkedinConnectionState: { acceptedConnectionId: "existing" }, created_at: "2026-01-02" },
  { id: "accepted:manual", source_url: "https://linkedin.com/in/alex-smith", linkedinConnectionState: { acceptedConnectionId: "manual" }, created_at: "2026-01-02" },
 ];
 const route = load("app/api/growth/acquisition/route.ts", {
  "next/server": { NextResponse: { json: (body, opts = {}) => ({ body, status: opts.status || 200 }) } },
  "@/lib/tenantAuth": { requireOrganisation: async requested => { assert.equal(requested, org); return { organisationId: org }; }, accessErrorResponse: () => null },
  "@/lib/supabaseAdmin": { supabaseAdmin: db },
  "@/lib/growthIngestion.server": { uuid: /^[a-f0-9-]{36}$/, recordTypes: ["personal_opportunity"], statuses: ["new"] },
  "@/lib/personalDistribution.server": { personalPerformance: () => { throw Error("LinkedIn view must not change distribution"); } },
  "@/lib/linkedinCapture.server": { acceptedLinkedInOpportunities: async () => accepted, linkedInRecommendationStates: async (tenant, rows) => Object.fromEntries(rows.map(row => [row.id, { acceptedConnectionId: row.id === "rec-0" ? "existing" : null, alreadyKnown: row.id === "rec-0" }])) },
 });
 const url = `https://ops.test/api/growth/acquisition?organisationId=${org}&source_engine=linkedin_connection_recommendation&record_type=personal_opportunity`;
 const first = await route.GET(new Request(url)); assert.equal(first.status, 200); assert.equal(first.body.total, 27); assert.equal(first.body.items.length, 25);
 assert.ok(first.body.items.some(row => row.id === "accepted:manual")); assert.ok(!first.body.items.some(row => row.id === "accepted:existing"));
 const second = await route.GET(new Request(url + "&page=1")); assert.equal(second.body.items.length, 2);
 assert.equal(db.writes, 0);
});

test("Responses AI first-message route blocks missing name before contacting the provider", async () => {
 let providerCalls = 0, contact = { name: null, interactionType: "linkedin_connection_first_message", lifecycle: { canDraft: true, currentStage: "outreach_ready" } };
 const route = load("app/api/ai/root-coach/route.ts", {
  "next/server": { NextResponse: { json: (body, opts = {}) => ({ body, status: opts.status || 200 }) } },
  "@/lib/tenantRoute.server": { withTenantRoute: fn => req => fn(req, { organisationId: org, profile: {}, messages: [] }) },
  "@/lib/responseContactContext.server": { getResponseContactContext: async () => contact },
 }, { process: { env: { OPENAI_API_KEY: "fixture" } }, fetch: async (url, opts) => { providerCalls++; assert.match(JSON.parse(opts.body).messages.at(-1).content, /Alex Smith/); return { ok: true, json: async () => ({ choices: [{ message: { content: "Hi Alex, thanks for connecting. I wanted to introduce the work behind my profile. I focus on practical support for organisations, with an interest in making early intervention useful rather than offering another benefit. That is the context behind connecting, without assuming it is a priority for you. That practical approach is why connecting made sense to me. It is good to be connected here." } }] }) }; } });
 const req = { json: async () => ({ inboxItemId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", context: "responses_linkedin" }) };
 assert.equal((await route.POST(req)).status, 409); assert.equal(providerCalls, 0);
 contact = { ...contact, name: "Alex Smith" }; assert.equal((await route.POST(req)).status, 200); assert.equal(providerCalls, 1);
});
