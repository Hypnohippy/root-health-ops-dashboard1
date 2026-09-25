import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
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
    Utilities: { newBlob: s => ({ getBytes: () => Buffer.from(s) }) }, UrlFetchApp: { fetch: (url, options) => { sent.push({ url, options }); return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ success: true, received: 1, inserted: 1 }) }; } },
  };
  vm.runInNewContext(script, sandbox); sandbox.opsExportEngineState();
  assert.equal(sent.length, 1); assert.equal(JSON.parse(sent[0].options.payload).records[0].source_record_id, "stable");
  assert.equal(sent[0].options.followRedirects, false);
  assert.doesNotMatch(script, /GmailApp|MailApp|newTrigger|setValue|setValues|sendEmail/);
});
