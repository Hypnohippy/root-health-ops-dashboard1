import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import ts from "typescript";
import { PGlite } from "@electric-sql/pglite";
const require = createRequire(import.meta.url);
const A = "78fa2ac8-e7b6-4b9b-9604-035723ece6b1", B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", secret = "s".repeat(40);
function load(file, mocks = {}) {
  const mod = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText,
    { module: mod, exports: mod.exports, require: name => mocks[name] || require(name), URL, Buffer, Request, Date, process: { env: { GROWTH_INGESTION_KEYS: JSON.stringify([{ organisation_id: A, secret, source_engines: ["root_health_b2b", "root_health_personal"] }]) } } });
  return mod.exports;
}
const source = load("lib/engineState.ts"), ingestion = load("lib/growthIngestion.server.ts");
const lifecycle = load("lib/contactLifecycle.ts", { "@/lib/engineState": source, "@/lib/growthOutreach": load("lib/growthOutreach.ts") });
const parser = load("lib/engineStateIngestion.server.ts", { "@/lib/growthIngestion.server": ingestion, "@/lib/contactLifecycle": lifecycle, "@/lib/engineState": source });
const adapter = load("lib/responseLifecycle.ts", { "@/lib/contactLifecycle": lifecycle });
const observed = "2026-09-24T12:00:00.000Z";
const record = (state = {}, fields = {}) => ({ source_engine: "root_health_b2b", source_record_id: "lead-1", record_type: "b2b_lead", person: "Person", company: "Business", observed_at: observed,
  state: { Status: "sent", email: "person@example.com", lastOutboundAt: "2026-09-20T12:00:00Z", ...state }, ...fields });
const parse = r => parser.parseEngineStateBatch({ organisation_id: A, records: [r] }).records[0];
const contact = r => lifecycle.buildContactLifecycle(A, { acquisition_items: [{ id: "acq", ...parse(r) }], inbox_items: [], growth_targets: [] }, Date.parse(observed))[0];
const personal = (type, state = {}, extra = {}) => record({ Status: "new", opportunity_type: "search_demand", ...state }, {
  source_engine: "root_health_personal", record_type: type, source_url: "https://www.reddit.com/r/example/comments/abc/discussion/",
  safety: { public_context: true, consumer_outreach: false, health_targeting: false, verified_public_business: true, verified_direct_discussion: true }, ...extra });

test("B2B sheet state maps into the existing lifecycle including due dates and source provenance", () => {
  const c = contact(record({ followUpStage: "followup_2", followUpStatus: "scheduled", nextFollowUpAt: "2026-09-23T12:00:00Z", lastFollowUpAt: "2026-09-22T12:00:00Z" }));
  assert.equal(c.currentStage, "follow_up"); assert.equal(c.followUpStatus, "due"); assert.equal(c.channel, "email");
  assert.equal(c.lastAction.at, "2026-09-22T12:00:00.000Z"); assert.equal(c.engineEvidence[0].state.follow_up_stage, "followup_2");
  assert.equal(c.engineEvidence[0].sourceRecordId, "lead-1");
  assert.equal(contact(record()).currentStage, "waiting");
  assert.equal(contact(record({ followUpStatus: "due" })).followUpStatus, "due");
  assert.equal(contact(record({ followUpStatus: "waiting", nextFollowUpAt: "2026-09-23T12:00:00Z" })).currentStage, "waiting");
  for (const [Status, expected] of [["meeting", "meeting"], ["converted", "converted"], ["closed/lost", "lost"], ["nurture", "nurture"]]) assert.equal(contact(record({ Status })).currentStage, expected);
});

test("B2B human reply suspends source cadence, acknowledgements wait, bounce and redirect require review", () => {
  const fields = { followUpStatus: "scheduled", nextFollowUpAt: "2026-09-25T12:00:00Z", lastInboundAt: "2026-09-23T12:00:00Z" };
  const reply = contact(record({ ...fields, reply_state: "human_reply_required" }));
  assert.equal(reply.currentStage, "needs_reply"); assert.equal(reply.nextDueDate, null);
  assert.equal(reply.nextAction, "reply_in_source_engine");
  assert.equal(contact(record({ ...fields, Status: "replied", reply_state: "auto_acknowledgement" })).currentStage, "waiting");
  for (const [reply_state, action] of [["bounce", "review_delivery_failure"], ["redirect", "review_referral_or_route"]]) assert.equal(contact(record({ ...fields, reply_state })).nextAction, action);
  assert.equal(contact(record({ ...fields, reply_state: "bounce" })).engineEvidence[0].humanActionRequired, true);
  const item = { id: "inbox", organisation_id: A, platform: "email", sender_email: "person@example.com", status: "replied", response_state: "engaged" };
  const projected = lifecycle.buildContactLifecycle(A, { acquisition_items: [{ id: "acq", ...parse(record({ ...fields, reply_state: "human_reply_required" })) }], inbox_items: [item], growth_targets: [] })[0];
  assert.equal(adapter.presentResponseLifecycle(projected, item).canDraft, false);
});

test("Personal opportunity, partner, social, approval and funnel evidence stays visibility-only", () => {
  for (const type of ["personal_opportunity", "partner_opportunity", "social_opportunity"]) {
    const row = parse(personal(type, { lastOutboundAt: null, approval_state: "pending" }));
    assert.equal(row.status, "new"); assert.equal(row.metadata.engine_safety.consumer_outreach, false);
    assert.equal(contact(personal(type, { lastOutboundAt: null, approval_state: "pending" })).currentStage, "reviewing");
  }
  assert.equal(contact(personal("partner_opportunity", { Status: "contacted" })).currentStage, "waiting");
  assert.equal(contact(personal("social_opportunity", { Status: "replied" })).currentStage, "engaged");
  assert.equal(contact(personal("personal_opportunity", { funnel_state: "signup_complete" })).currentStage, "converted");
  assert.notEqual(contact(personal("personal_opportunity", { Status: "capacity_check_completed", lastOutboundAt: null })).currentStage, "converted");
  for (const safety of [{ public_context: false }, { consumer_outreach: true }, { health_targeting: true }, { verified_public_business: false }]) {
    const r = personal("partner_opportunity"); r.safety = { ...r.safety, ...safety }; assert.throws(() => parse(r));
  }
  assert.throws(() => parse(personal("social_opportunity", {}, { source_url: "https://reddit.com/r/example/" })));
  assert.throws(() => parse(personal("personal_opportunity", {}, { source_engine: "root_health_b2b" })));
});

test("identity, event timestamp and advanced-stage regressions are rejected", () => {
  const before = parse(record({ Status: "converted" })).engine_state;
  assert.equal(parser.engineStateConflict(before, parse(record()).engine_state), "stage_regression");
  assert.equal(parser.engineStateConflict(before, { ...before, email: "other@example.com" }), "identity_conflict");
  assert.equal(parser.engineStateConflict(before, { ...before, last_outbound_at: null }), "evidence_regression");
  const pending = parse(record({ reply_state: "human_reply_required", lastInboundAt: "2026-09-21T12:00:00Z" })).engine_state;
  assert.equal(parser.engineStateConflict(pending, { ...pending, last_outbound_at: "2026-09-22T12:00:00.000Z" }), null);
  const r = { id: "acq", ...parse(record()), status: "converted" };
  assert.equal(lifecycle.buildContactLifecycle(A, { acquisition_items: [r], inbox_items: [], growth_targets: [] })[0].currentStage, "converted");
  assert.equal(lifecycle.buildContactLifecycle(B, { acquisition_items: [r], inbox_items: [], growth_targets: [] }).length, 0);
  assert.throws(() => parse(record({ nextFollowUpAt: "tomorrow" })));
  assert.throws(() => parse(record({ Status: "sent", status: "waiting" })));
});

test("actual migration and route deduplicate, CAS conflicts, preserve manual state and isolate tenants", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls; create table organisations(id uuid primary key); insert into organisations values('${A}'),('${B}');`);
    for (const file of ["20260923140000_acquisition_ingestion.sql", "20260924100000_actionable_acquisition_queue.sql", "20260925100000_acquisition_engine_state.sql"]) await db.exec(fs.readFileSync(`supabase/migrations/${file}`, "utf8"));
    const admin = {
      from(table) { assert.equal(table, "acquisition_items"); const filters = {}; const q = { select() { return q; }, eq(k,v) { filters[k] = v; return q; }, async maybeSingle() {
        assert.equal(filters.organisation_id, A);
        const result = await db.query("select * from acquisition_items where organisation_id=$1 and source_engine=$2 and source_record_id=$3", [filters.organisation_id, filters.source_engine, filters.source_record_id]); return { data: result.rows[0] || null, error: null };
      } }; return q; },
      async rpc(name, p) { assert.equal(name, "sync_acquisition_engine_state"); const result = await db.query("select sync_acquisition_engine_state($1,$2,$3,$4) as result", [p.p_organisation_id, JSON.stringify(p.p_record), p.p_expected_state == null ? null : JSON.stringify(p.p_expected_state), p.p_expected_observed_at]); return { data: result.rows[0].result, error: null }; },
    };
    const route = load("app/api/growth/engine-state/route.ts", { "next/server": { NextResponse: { json: (body, opts = {}) => ({ body, status: opts.status || 200 }) } }, "@/lib/supabaseAdmin": { supabaseAdmin: admin }, "@/lib/growthIngestion.server": ingestion, "@/lib/engineStateIngestion.server": parser, "@/lib/contactLifecycle": lifecycle });
    const run = (records, organisation_id = A, token = secret) => route.POST(new Request("https://ops.example/api/growth/engine-state", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify({ organisation_id, records }) }));
    assert.equal((await run([record()])).body.inserted, 1);
    assert.equal((await run([record()])).body.duplicates, 1);
    assert.equal((await run([record()], B)).status, 403);
    assert.equal((await run([record()], A, "wrong")).status, 403);
    assert.equal((await run([record()], A, "")).status, 403);
    await db.exec("update acquisition_items set status='converted', current_action='mark_converted', metadata='{" + '"manual":"preserve"' + "}'::jsonb");
    const newer = record({ Status: "meeting" }, { observed_at: "2026-09-25T00:00:00Z" });
    assert.equal((await run([newer])).body.updated, 1);
    assert.equal((await run([record()])).body.stale, 1);
    assert.equal((await run([record({ Status: "waiting" }, { observed_at: "2026-09-25T01:00:00Z" })])).body.conflicts, 1);
    assert.equal((await run([personal("partner_opportunity", {}, { source_record_id: "partner-1" })])).body.inserted, 1);
    const saved = (await db.query("select * from acquisition_items where source_engine='root_health_b2b'")).rows[0];
    assert.equal(saved.status, "converted"); assert.equal(saved.metadata.manual, "preserve");
    const conflict = await admin.rpc("sync_acquisition_engine_state", { p_organisation_id: A, p_record: parse(record({ Status: "converted" }, { observed_at: "2026-09-25T02:00:00Z" })), p_expected_state: null, p_expected_observed_at: null });
    assert.equal(conflict.data, "conflicts");
    const sameTimestampConflict = await admin.rpc("sync_acquisition_engine_state", { p_organisation_id: A, p_record: parse(record({ Status: "converted" }, { observed_at: newer.observed_at })), p_expected_state: saved.engine_state, p_expected_observed_at: saved.engine_observed_at });
    assert.equal(sameTimestampConflict.data, "conflicts");
    assert.equal((await db.query("select count(*)::int n from acquisition_items")).rows[0].n, 2);
    const other = { ...parse(record()), organisation_id: B };
    assert.equal((await admin.rpc("sync_acquisition_engine_state", { p_organisation_id: B, p_record: other, p_expected_state: null, p_expected_observed_at: null })).data, "inserted");
    assert.equal((await db.query("select count(*)::int n from acquisition_items where organisation_id=$1", [A])).rows[0].n, 2);
    await db.exec("set role authenticated");
    await assert.rejects(db.query("select sync_acquisition_engine_state($1,$2,null,null)", [A, JSON.stringify(parse(record()))]), /permission denied/);
    await assert.rejects(db.query("select engine_state from acquisition_items"), /permission denied/);
  } finally { await db.close(); }
});

test("manual exporter reads configured headers, forwards timestamps, and never writes or schedules", () => {
  const script = fs.readFileSync("docs/google-engine-state-export.gs", "utf8");
  const sent = [];
  const config = { organisation_id: A, source_engine: "root_health_b2b", spreadsheet_id: "book", sheets: [{ name: "Leads", id_header: "Lead ID", record_type: "b2b_lead", state: { Status: "Status", lastOutboundAt: "lastOutboundAt" } }] };
  const sandbox = { PropertiesService: { getScriptProperties: () => ({ getProperty: key => key === "OPS_STATE_SYNC_CONFIG" ? JSON.stringify(config) : secret }) },
    SpreadsheetApp: { openById: () => ({ getSheetByName: () => ({ getDataRange: () => ({ getValues: () => [["Lead ID", "Status", "lastOutboundAt"], ["stable", "sent", "2026-09-20T12:00:00Z"]] }) }) }) },
    Utilities: { DigestAlgorithm: { SHA_256: "SHA_256" }, Charset: { UTF_8: "UTF_8" }, computeDigest: (algorithm, input, charset) => { assert.equal(algorithm, "SHA_256"); assert.equal(charset, "UTF_8"); return Array.from(createHash("sha256").update(input, "utf8").digest(), b => b > 127 ? b - 256 : b); }, newBlob: s => ({ getBytes: () => Buffer.from(s) }) }, UrlFetchApp: { fetch: (url, options) => { sent.push({ url, options }); return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ success: true, received: 1, inserted: 1 }) }; } },
  };
  vm.runInNewContext(script, sandbox); sandbox.opsExportEngineState();
  assert.equal(sent.length, 1); assert.equal(JSON.parse(sent[0].options.payload).records[0].source_record_id, "stable");
  assert.equal(sent[0].options.followRedirects, false);
  assert.doesNotMatch(script, /GmailApp|MailApp|newTrigger|setValue|setValues|sendEmail/);
});

function runMappedExport(config, sheets) {
  const sent = [], reads = [];
  const sandbox = { Date, PropertiesService: { getScriptProperties: () => ({ getProperty: key => key === "OPS_STATE_SYNC_CONFIG" ? JSON.stringify(config) : secret }) },
    SpreadsheetApp: { openById: id => { assert.equal(id, config.spreadsheet_id); return { getSheetByName: name => { reads.push(name); assert.ok(sheets[name], name); return { getDataRange: () => ({ getValues: () => sheets[name] }) }; } }; } },
    Utilities: { DigestAlgorithm: { SHA_256: "SHA_256" }, Charset: { UTF_8: "UTF_8" }, computeDigest: (algorithm, input, charset) => { assert.equal(algorithm, "SHA_256"); assert.equal(charset, "UTF_8"); return Array.from(createHash("sha256").update(input, "utf8").digest(), b => b > 127 ? b - 256 : b); }, newBlob: s => ({ getBytes: () => Buffer.from(s) }) }, UrlFetchApp: { fetch: (_url, options) => { sent.push(JSON.parse(options.payload)); return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ success: true, received: 1, inserted: 1 }) }; } },
  };
  vm.runInNewContext(fs.readFileSync("docs/google-engine-state-export.gs", "utf8"), sandbox);
  const results = sandbox.opsExportEngineState(); return { sent, reads, results };
}
const liveConfig = engine => JSON.parse(fs.readFileSync(`docs/google-engine-state-${engine}.config.json`, "utf8"));

test("verified live configurations identify exact spreadsheets and isolate only pending tabs/fields", () => {
  const b2b = liveConfig("b2b"), personalConfig = liveConfig("personal");
  assert.equal(b2b.spreadsheet_id, "1HXba9e-_WBh8oyJ-hOykpfR993T7-RCSmxWpkX5I1Po");
  assert.equal(personalConfig.spreadsheet_id, "1ZfyIebRh6G8HkuJrM6cizPocd8oBh3Cu1u_Lh9M2UAM");
  assert.equal(b2b.sheets[0].id_rule, "rootOpsStableLeadId_");
  assert.equal(personalConfig.sheets[0].id_header, "Outreach ID");
  assert.equal(personalConfig.sheets[0].id_prefix, undefined);
  const pending = runMappedExport(personalConfig, {});
  assert.equal(pending.sent.length, 0); assert.equal(pending.reads.length, 0);
  assert.deepEqual(Array.from(pending.results, r => r.sheet), ["Partner Outreach", "Acquisition Queue", "Social Queue", "Search Demand", "Funnel Events", "Action Outputs", "Leads"]);
  b2b.sheets[0].pending = [];
  assert.throws(() => runMappedExport(b2b, { Leads: [["Email"], ["contact@example.com"]] }), /Missing or duplicate mapped source header/);
});

test("live B2B columns export cadence, discovery/count and Sent at fallback without generating IDs", () => {
  for (const field of ["follow_up_count", "discovery_source", "discovered_at", "conversions"]) assert.equal(field in parse(record()).engine_state, false);
  const config = liveConfig("b2b");
  const values = { "Source URL": "https://example.com/source", Organisation: "Business", Person: "Person", Email: "person@example.com", Status: "sent",
    "Sent at": new Date("2026-09-20T12:00:00Z"), followUpStage: "followup_2", lastFollowUpAt: "", nextFollowUpAt: new Date("2026-09-28T12:00:00Z"),
    followUpCount: 0, followUpStatus: "scheduled", lastInboundAt: "", lastOutboundAt: "", discoverySource: "public directory", discoveredAt: new Date("2026-09-19T12:00:00Z") };
  const exportRow = () => runMappedExport(config, { Leads: [Object.keys(values), Object.values(values)] }).sent[0].records[0];
  let row = exportRow();
  assert.equal(row.source_record_id, "b2b-" + createHash("sha256").update("business|person@example.com|https://example.com/source").digest("hex")); assert.equal(row.company, "Business");
  assert.equal(row.state.lastOutboundAt, "2026-09-20T12:00:00.000Z"); assert.equal(row.state.followUpCount, "0");
  let parsed = parse(row);
  assert.equal(parsed.engine_state.discovery_source, "public directory"); assert.equal(parsed.engine_state.discovered_at, "2026-09-19T12:00:00.000Z");
  assert.equal(parsed.engine_state.follow_up_count, "0");
  const originalId = row.source_record_id;
  values.Organisation = " Business "; values.Email = "PERSON@EXAMPLE.COM "; values["Source URL"] = " HTTPS://EXAMPLE.COM/SOURCE ";
  assert.equal(exportRow().source_record_id, originalId);
  values.lastOutboundAt = new Date("2026-09-22T12:00:00Z"); row = exportRow(); parsed = parse(row);
  assert.equal(parsed.engine_state.last_outbound_at, "2026-09-22T12:00:00.000Z");
  assert.equal(parsed.engine_state.next_follow_up_at, "2026-09-28T12:00:00.000Z");
});

test("Partner Outreach maps exact source IDs and state, preserves safety gates and skips unrelated pending tabs", () => {
  const config = liveConfig("personal"), mapping = config.sheets[0]; mapping.pending = [];
  const values = { "Outreach ID": "outreach-original-5", "Action ID": "action-9", "Queue row": 27, "Partner / Organisation": "Business", Website: "https://example.com",
    "Contact name": "Person", "Role / Team": "Partners", Email: "person@example.com", "Contact page": "https://example.com/contact", "Email source URL": "",
    Verification: "uninterpreted source value", "Business context": "Public business partnership", "Draft subject": "PRIVATE DRAFT", "Draft body": "PRIVATE BODY", "Approval status": "pending",
    "Send status": "", "Sent at": "", "Reply status": "", "Reply at": "", "Referral link": "https://example.com/ref", Conversions: 2, Notes: "PRIVATE NOTES" };
  const exportRow = () => runMappedExport(config, { "Partner Outreach": [Object.keys(values), Object.values(values)] });
  const first = exportRow(), row = first.sent[0].records[0];
  assert.equal(first.results.filter(r => r.pending).length, 6); assert.deepEqual(first.reads, ["Partner Outreach"]);
  assert.equal(row.source_record_id, "outreach-original-5"); assert.equal(row.metadata.queue_row_reference, "27");
  assert.equal(row.source_url, "https://example.com/contact"); assert.equal(row.state.approval_state, "pending");
  assert.equal(row.state.conversions, "2"); assert.doesNotMatch(JSON.stringify(row), /PRIVATE/);
  assert.throws(() => parse(row), /Personal records require public context/);
  // Explicit fixture safety evidence only; no equivalent live headers are claimed.
  for (const [field, value] of Object.entries({ public_context: true, consumer_outreach: false, health_targeting: false, verified_public_business: true })) {
    const header = `Fixture ${field}`; mapping.safety[field] = header; values[header] = value;
  }
  const safe = exportRow().sent[0].records[0];
  assert.equal(parse(safe).engine_state.conversions, "2"); assert.equal(contact(safe).currentStage, "reviewing");
  values["Send status"] = "sent"; values["Sent at"] = new Date("2026-09-20T12:00:00Z"); values["Reply status"] = "human_reply_required"; values["Reply at"] = new Date("2026-09-21T12:00:00Z");
  assert.equal(contact(exportRow().sent[0].records[0]).currentStage, "needs_reply");
});

test("Social Queue and Action Outputs preserve exact stable IDs and do not infer safety from source labels", () => {
  for (const [tab, idHeader, id] of [["Social Queue", "Social ID", "social-existing-17"], ["Action Outputs", "Action ID", "action-existing-4"]]) {
    const config = liveConfig("personal"), mapping = config.sheets.find(s => s.name === tab);
    assert.equal(mapping.id_header, idHeader); assert.equal(mapping.id_prefix, undefined);
    mapping.pending = [];
    const headers = [...new Set([idHeader, ...Object.values(mapping.fields), ...Object.values(mapping.state), ...Object.values(mapping.metadata)].flat())];
    const values = Object.fromEntries(headers.map(h => [h, ""]));
    Object.assign(values, { [idHeader]: id, "Source URL": "https://www.reddit.com/r/example/comments/abc/discussion/", "Queue row": 83 });
    if (tab === "Social Queue") Object.assign(values, { Status: "READY", Mode: "REACTIVE", Risk: "LOW", Platform: "reddit", "Context / Question": "Public question", "Published at": new Date("2026-09-20T12:00:00Z") });
    else Object.assign(values, { "Review status": "REVIEW", "Action type": "CONTENT_BRIEF", Opportunity: "Public content opportunity", Lane: "Intent content" });
    const result = runMappedExport(config, { [tab]: [Object.keys(values), Object.values(values)] });
    const row = result.sent[0].records[0];
    assert.equal(row.source_record_id, id); assert.equal(row.metadata.queue_row_reference, "83");
    assert.equal(result.results.filter(r => r.pending).length, 6);
    assert.throws(() => parse(row), /Personal records require public context/);
    assert.equal(row.safety.public_context, undefined); assert.equal(row.safety.verified_direct_discussion, undefined);
    if (tab === "Social Queue") assert.equal(row.state.last_outbound_at, "2026-09-20T12:00:00.000Z");
    else assert.equal(row.state.approval_state, "REVIEW");
  }
});
