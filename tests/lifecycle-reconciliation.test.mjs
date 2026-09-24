import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { PGlite } from "@electric-sql/pglite";

function load(file, dependencies = {}) {
  const mod = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { module: mod, exports: mod.exports, URL, require: name => {
    assert.ok(name in dependencies, `Unexpected dependency / send path: ${name}`);
    return dependencies[name];
  } }, { filename: file });
  return mod.exports;
}
const outreach = load("lib/growthOutreach.ts");
const model = load("lib/contactLifecycle.ts", { "@/lib/growthOutreach": outreach });
const planner = load("lib/lifecycleReconciliation.ts", { "@/lib/contactLifecycle": model, "@/lib/growthOutreach": outreach });
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc", TARGET = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const row = (id, fields = {}) => ({ id, organisation_id: A, linkedin_identity: "linkedin.com/in/jane", ...fields });
const acceptance = (fields = {}) => row(ID, { platform: "linkedin", kind: "connection_accepted", author_name: "Jane", status: "needs_reply", response_state: "needs_reply", ...fields });
const target = (fields = {}) => row(TARGET, { target_name: "Jane", stage: "connection", status: "active", ...fields });
const input = (fields = {}) => ({ acquisition_items: [], inbox_items: [], growth_targets: [], ...fields });
const plan = data => JSON.parse(JSON.stringify(planner.planLifecycleReconciliation(A, data)));
function apply(data, repairs) {
  const result = structuredClone(data);
  for (const r of repairs) {
    if (r.id) Object.assign(result[r.table].find(row => row.id === r.id), r.patch);
    else result[r.table].push({ id: TARGET, organisation_id: A, ...r.patch });
  }
  return result;
}

test("acceptance creates one target and repeat runs are no-ops", () => {
  const data = input({ inbox_items: [acceptance()] });
  const first = plan(data);
  assert.equal(first.repairs.length, 1);
  assert.equal(first.repairs[0].patch.stage, "connection");
  const repeated = plan(apply(data, first.repairs));
  assert.equal(repeated.repairs.length, 0);
  assert.equal(repeated.duplicatesAvoided, 1);
});

test("Mark Contacted advances once and uses the existing three-day follow-up date", () => {
  for (const growth_targets of [[], [target()]]) {
    const data = input({ inbox_items: [acceptance({ status: "replied", contacted_at: "2026-09-24T12:00:00Z" })], growth_targets });
    const updated = apply(data, plan(data).repairs);
    assert.equal(updated.growth_targets[0].stage, outreach.nextGrowthStage("connection"));
    assert.equal(updated.inbox_items[0].response_state, "waiting_for_human");
    const [before] = model.buildContactLifecycle(A, updated, Date.parse("2026-09-26"));
    const [due] = model.buildContactLifecycle(A, updated, Date.parse("2026-09-28"));
    assert.equal(before.nextDueDate, "2026-09-27T12:00:00.000Z");
    assert.equal(before.followUpStatus, "waiting"); assert.equal(due.followUpStatus, "due");
    assert.equal(plan(updated).repairs.length, 0);
  }
  const legacy = plan(input({ inbox_items: [acceptance({ status: "replied" })] }));
  assert.equal(legacy.repairs.length, 0); assert.equal(legacy.skippedAmbiguousContacts, 1);
});

test("human reply cancels pending follow-up without sending and preserves engagement", () => {
  for (const platform of ["linkedin", "email"]) {
    const data = input({ inbox_items: [row(ID, { platform, kind: platform === "linkedin" ? "dm" : "email_reply", text: "Please tell me more", email_classification: "question", response_state: "needs_reply", created_at_platform: "2026-09-25", follow_up_at: "2026-09-28" })], growth_targets: [target({ stage: "day3_dm", last_action_at: "2026-09-24" })] });
    const updated = apply(data, plan(data).repairs);
    assert.equal(updated.growth_targets[0].status, "parked");
    assert.equal(updated.growth_targets[0].reply_status, "engaged");
    assert.equal(updated.inbox_items[0].follow_up_at, null);
    assert.equal(model.buildContactLifecycle(A, updated)[0].currentStage, "needs_reply");
    assert.equal(plan(updated).repairs.length, 0);
  }
});

test("automatic acknowledgements stay waiting and cannot overwrite a human reply", () => {
  const ack = row(ID, { platform: "email", kind: "email_reply", email_classification: "auto_acknowledgement", response_state: "needs_reply", follow_up_at: "2026-09-28" });
  const data = input({ inbox_items: [ack], growth_targets: [target({ stage: "day3_dm", last_action_at: "2026-09-24" })] });
  const updated = apply(data, plan(data).repairs);
  assert.equal(updated.growth_targets[0].status, "waiting");
  assert.equal(updated.growth_targets[0].reply_status, undefined);
  assert.equal(updated.inbox_items[0].response_state, "waiting_for_human");
  assert.equal(model.buildContactLifecycle(A, updated)[0].currentStage, "waiting");
  assert.equal(plan(updated).repairs.length, 0);
  const engaged = input({ inbox_items: [ack], growth_targets: [target({ reply_status: "engaged", status: "parked" })] });
  const preserved = apply(engaged, plan(engaged).repairs);
  assert.equal(preserved.growth_targets[0].reply_status, "engaged");
  assert.equal(preserved.inbox_items[0].response_state, "waiting_for_human");
  const combined = input({ inbox_items: [acceptance(), { ...ack, id: TARGET }] });
  const created = apply(combined, plan(combined).repairs);
  assert.equal(created.growth_targets[0].status, "waiting");
  assert.equal(plan(created).repairs.length, 0);
});

test("sequence completion repairs parked status but elapsed time never implies a send", () => {
  const data = input({ growth_targets: [target({ stage: outreach.nextGrowthStage("day17_followup"), status: "active" })] });
  const updated = apply(data, plan(data).repairs);
  assert.equal(updated.growth_targets[0].status, "parked");
  assert.equal(model.buildContactLifecycle(A, updated)[0].currentStage, "nurture");
  assert.equal(plan(updated).repairs.length, 0);
  assert.equal(plan(input({ growth_targets: [target({ stage: "day17_followup", last_action_at: "2020-01-01" })] })).repairs.length, 0);
});

test("commercial, engaged and nurture stages never regress to contacted or outreach ready", () => {
  for (const fields of [{ deal_stage: "converted" }, { deal_stage: "meeting" }, { deal_stage: "lost" }, { reply_status: "engaged" }, { stage: "parked", status: "parked" }]) {
    const data = input({ inbox_items: [acceptance({ status: "replied", contacted_at: "2026-09-24" })], growth_targets: [target(fields)] });
    const before = model.buildContactLifecycle(A, input({ growth_targets: data.growth_targets }))[0].currentStage;
    const updated = apply(data, plan(data).repairs);
    assert.equal(model.buildContactLifecycle(A, input({ growth_targets: updated.growth_targets }))[0].currentStage, before);
    assert.equal(plan(updated).repairs.length, 0);
  }
  const data = input({ acquisition_items: [row(ID, { status: "converted" })], growth_targets: [target()] });
  const updated = apply(data, plan(data).repairs);
  assert.equal(updated.growth_targets[0].deal_stage, "converted");
  assert.equal(updated.growth_targets[0].status, "parked");
  const positive = input({ growth_targets: [target({ reply_status: "positive" })] });
  assert.equal(apply(positive, plan(positive).repairs).growth_targets[0].reply_status, "positive");
});

test("ambiguous and weak identities are skipped, foreign tenant rows never repaired", () => {
  for (const data of [input({ inbox_items: [acceptance({ linkedin_identity: null, author_name: "Jane", raw: { company: "Acme" } })] }), input({ inbox_items: [acceptance()], growth_targets: [target(), target({ id: ID })] }), input({ inbox_items: [acceptance({ permalink: "https://linkedin.com/in/someone-else" })] })]) {
    assert.equal(plan(data).skippedAmbiguousContacts, 1); assert.equal(plan(data).repairs.length, 0);
  }
  const foreign = plan(input({ inbox_items: [acceptance({ organisation_id: B })] }));
  assert.equal(foreign.contactsInspected, 0); assert.equal(foreign.repairs.length, 0);
  assert.equal(plan(input({ inbox_items: [acceptance({ status: "archived" })] })).repairs.length, 0);
  assert.equal(plan(input({ inbox_items: [acceptance({ response_state: "nurture" })] })).repairs.length, 0);
});

async function database() {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create table organisations(id uuid primary key); insert into organisations values('${A}'),('${B}');
    create table acquisition_items(id uuid primary key, organisation_id uuid not null references organisations(id), status text);
    create table inbox_items(id uuid primary key, organisation_id uuid not null references organisations(id), platform text, kind text, status text, response_state text, follow_up_at timestamptz);
    create table growth_targets(id uuid primary key default gen_random_uuid(), organisation_id uuid not null references organisations(id), target_name text, company text, linkedin_url text, linkedin_identity text, stage text, status text, last_action_at timestamptz, reply_status text, replied_at timestamptz, deal_stage text, source_type text, source_record_id text);
    create unique index growth_identity on growth_targets(organisation_id, linkedin_identity) where linkedin_identity is not null;`);
  await db.exec(fs.readFileSync("supabase/migrations/20260924210000_lifecycle_reconciliation.sql", "utf8"));
  return db;
}

test("migration applies atomically, rejects stale/replayed work and enforces tenant boundaries", async () => {
  const db = await database();
  try {
    const repair = plan(input({ inbox_items: [acceptance()] })).repairs;
    const run = (tenant, version, repairs) => db.query("select apply_lifecycle_repairs($1,$2,$3) result", [tenant, version, JSON.stringify(repairs)]);
    assert.equal((await run(A, 0, repair)).rows[0].result.applied, 1);
    assert.equal((await run(A, 0, repair)).rows[0].result.stale, true);
    assert.equal((await db.query("select count(*)::int n from growth_targets")).rows[0].n, 1);
    const id = (await db.query("select id from growth_targets")).rows[0].id;
    await assert.rejects(run(B, 0, [{ table: "growth_targets", id, patch: { status: "parked" } }]), /target_not_found/);
    await assert.rejects(run(A, 1, [{ table: "growth_targets", id, patch: { status: "parked" } }, { table: "growth_targets", id: ID, patch: { status: "parked" } }]), /target_not_found/);
    assert.equal((await db.query("select status from growth_targets")).rows[0].status, "active");
    assert.equal((await db.query("select revision from lifecycle_revisions where organisation_id=$1", [A])).rows[0].revision, 1);
    await db.query("update growth_targets set deal_stage='converted' where id=$1", [id]);
    assert.equal((await run(A, 1, [{ table: "growth_targets", id, patch: { stage: "day3_dm" } }])).rows[0].result.stale, true);
    await assert.rejects(run(A, 2, [{ table: "growth_targets", id, patch: { organisation_id: B } }]), /invalid_growth_patch/);
    await db.exec("set role authenticated");
    await assert.rejects(run(A, 2, []), /permission denied/);
    await assert.rejects(db.query("select * from lifecycle_revisions"), /permission denied/);
  } finally { await db.close(); }
});

test("Mark Contacted trigger records time once, never backfills legacy or touches email sending", async () => {
  const db = await database();
  try {
    await db.query("insert into inbox_items(id,organisation_id,platform,kind,status) values($1,$2,'linkedin','connection_accepted','needs_reply')", [ID, A]);
    await db.query("update inbox_items set status='replied' where id=$1", [ID]);
    const at = (await db.query("select contacted_at from inbox_items")).rows[0].contacted_at;
    assert.ok(at);
    await db.query("update inbox_items set status='replied' where id=$1", [ID]);
    assert.deepEqual((await db.query("select contacted_at from inbox_items")).rows[0].contacted_at, at);
    await db.query("insert into inbox_items(id,organisation_id,platform,kind,status) values($1,$2,'email','email_reply','needs_reply')", [TARGET, A]);
    await db.query("update inbox_items set status='replied' where id=$1", [TARGET]);
    assert.equal((await db.query("select contacted_at from inbox_items where id=$1", [TARGET])).rows[0].contacted_at, null);
  } finally { await db.close(); }
});

test("service retries stale plans, hides database errors and never calls a provider", async () => {
  let attempts = 0;
  const service = load("lib/lifecycleReconciliation.server.ts", {
    "@/lib/lifecycleReconciliation": planner,
    "@/lib/lifecycleSnapshot.server": { readLifecycleInput: async tenant => { assert.equal(tenant, A); return input({ inbox_items: [acceptance()] }); } },
    "@/lib/supabaseAdmin": { supabaseAdmin: {
      from: table => { assert.equal(table, "lifecycle_revisions"); const q = { select: () => q, eq: (key, value) => { assert.equal(key, "organisation_id"); assert.equal(value, A); return q; }, maybeSingle: async () => ({ data: { revision: 0 } }) }; return q; },
      rpc: async (name, args) => { assert.equal(name, "apply_lifecycle_repairs"); assert.equal(args.p_organisation_id, A); attempts++; return attempts === 1 ? { data: { stale: true } } : { data: { applied: 1 } }; },
    } },
  });
  const result = await service.reconcileLifecycle(A);
  assert.equal(result.repairsApplied, 1); assert.equal(attempts, 2);
  const broken = load("lib/lifecycleReconciliation.server.ts", { "@/lib/lifecycleReconciliation": planner, "@/lib/lifecycleSnapshot.server": {}, "@/lib/supabaseAdmin": { supabaseAdmin: { from: () => { throw Error("secret credential"); } } } });
  const failure = await broken.reconcileLifecycle(A);
  assert.equal(failure.repairsApplied, 0); assert.equal(failure.errors.length, 1); assert.doesNotMatch(JSON.stringify(failure), /secret credential/);
});

test("reconciliation endpoint requires write membership and returns only summary results", async () => {
  let called = 0;
  const summary = { contactsInspected: 1, repairsApplied: 1, skippedAmbiguousContacts: 0, duplicatesAvoided: 0, errors: [] };
  const route = load("app/api/growth/lifecycle/reconcile/route.ts", {
    "next/server": { NextResponse: { json: (body, options) => ({ body, ...options }) } },
    "@/lib/tenantRoute.server": { withTenantRoute: (handler, options) => {
      assert.equal(options.write, true); assert.equal(options.generation, false);
      return req => handler(req, { organisationId: A });
    } },
    "@/lib/lifecycleReconciliation.server": { reconcileLifecycle: async tenant => { assert.equal(tenant, A); called++; return summary; } },
  });
  const result = await route.POST({});
  assert.equal(called, 1); assert.equal(result.status, 200); assert.equal(result.body, summary);
  assert.equal(result.headers["Cache-Control"], "private, no-store");
  summary.errors.push("Concurrent changes prevented reconciliation; retry later.");
  assert.equal((await route.POST({})).status, 503);
});

test("overlapping reconciliations replan after a revision race and create only one target", async () => {
  let state = input({ inbox_items: [acceptance()] });
  let version = 0, applied = 0;
  const service = load("lib/lifecycleReconciliation.server.ts", {
    "@/lib/lifecycleReconciliation": planner,
    "@/lib/lifecycleSnapshot.server": { readLifecycleInput: async () => structuredClone(state) },
    "@/lib/supabaseAdmin": { supabaseAdmin: {
      from: () => { const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: { revision: version } }) }; return q; },
      rpc: async (_name, args) => {
        if (Number(args.p_expected_revision) !== version) return { data: { stale: true } };
        state = apply(state, args.p_repairs);
        version += args.p_repairs.length;
        applied += args.p_repairs.length;
        return { data: { applied: args.p_repairs.length } };
      },
    } },
  });
  const results = await Promise.all([service.reconcileLifecycle(A), service.reconcileLifecycle(A)]);
  assert.equal(state.growth_targets.length, 1);
  assert.equal(applied, 1);
  assert.ok(results.every(r => r.errors.length === 0));
  assert.equal((await service.reconcileLifecycle(A)).repairsApplied, 0);
});
