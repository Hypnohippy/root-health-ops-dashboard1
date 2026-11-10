import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";

const org = randomUUID(), otherOrg = randomUUID(), actor = randomUUID(), otherActor = randomUUID(), viewer = randomUUID(), relationship = randomUUID(), foreignRelationship = randomUUID(), target = randomUUID();
function load(file, deps = {}) {
  const mod = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, {
    module: mod, exports: mod.exports, Date, Intl, URL, console,
    require: name => name in deps ? deps[name] : (() => { throw new Error(`Unexpected dependency ${name}`); })(),
  });
  return mod.exports;
}
const time = load("lib/diaryAppointments.ts");

test("local timed appointments map to exact instants and reject daylight-saving gaps and folds", () => {
  assert.equal(time.localDateTimeToIso("2026-10-24", "10:00", "Europe/London"), "2026-10-24T09:00:00.000Z");
  assert.throws(() => time.localDateTimeToIso("2026-03-29", "01:30", "Europe/London"), /does not exist/);
  assert.throws(() => time.localDateTimeToIso("2026-10-25", "01:30", "Europe/London"), /occurs twice/);
  const local = time.isoToLocalDateTime("2026-10-25T01:30:00.000Z", "Europe/London");
  assert.equal(local.date, "2026-10-25"); assert.equal(local.time, "01:30");
});

test("input validation preserves all-day exclusive-end semantics and requires increasing timed ranges", () => {
  const allDay = time.parseAppointmentValues({ title: "Planning day", allDay: true, startDate: "2026-11-10", endDate: "2026-11-10", timezone: "Europe/London" });
  assert.equal(allDay.startDate, "2026-11-10"); assert.equal(allDay.endDate, "2026-11-11"); assert.equal(allDay.startsAt, null);
  assert.throws(() => time.parseAppointmentValues({ title: "Bad", startDate: "2026-11-10", startTime: "11:00", endDate: "2026-11-10", endTime: "10:00", timezone: "Europe/London" }), /after start/);
  assert.throws(() => time.parseAppointmentValues({ title: "Bad", startDate: "2026-02-31", startTime: "10:00", endDate: "2026-02-31", endTime: "11:00", timezone: "Europe/London" }), /valid date/);
  assert.throws(() => time.parseAppointmentValues({ title: "Bad", startDate: "2026-11-10", startTime: "10:00", endDate: "2026-11-10", endTime: "11:00", timezone: "Mars/Olympus" }), /IANA/);
});

test("real SQL: current revisions update and reschedule; stale revisions fail; cancellation is retained", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create table organisations(id uuid primary key);
      create table organisation_members(organisation_id uuid not null,user_id uuid not null,role text not null);
      create table relationship_workspaces(id uuid not null,organisation_id uuid not null,founder_only boolean not null default false,unique(organisation_id,id));
      create table growth_targets(id uuid primary key,organisation_id uuid not null,call_date timestamptz);
      create table relationship_tasks(id uuid primary key,organisation_id uuid not null,task text);
      insert into organisations values ('${org}'),('${otherOrg}');
      insert into organisation_members values ('${org}','${actor}','owner'),('${org}','${viewer}','viewer'),('${otherOrg}','${otherActor}','owner');
      insert into relationship_workspaces values ('${relationship}','${org}',false),('${randomUUID()}','${org}',true),('${foreignRelationship}','${otherOrg}',false);
      insert into growth_targets values ('${target}','${org}','2026-11-10T10:00:00Z');
      insert into relationship_tasks values ('${randomUUID()}','${org}','Existing task');`);
    const migration = fs.readFileSync("supabase/migrations/20261109090000_diary_appointments.sql", "utf8");
    await db.exec(migration);
    const call = async ({ action, id = null, revision = null, relationshipId = null, title = "Auriel Wetherall call", start = "2026-11-10T10:00:00Z", end = "2026-11-10T10:30:00Z", status = "tentative", actorId = actor, tenant = org } = {}) => (await db.query(
      "select save_appointment($1,$2,$3,$4,$5,$6,$7,$8,$9,null,null,'Europe/London',false,null,null,null,$10) as row",
      [tenant, actorId, action, id, revision, relationshipId, title, start, end, status],
    )).rows[0].row;
    const created = await call({ action: "create", relationshipId: relationship, status: "confirmed" });
    assert.deepEqual(Object.keys(created).sort(), [
      "id", "organisation_id", "owner_user_id", "relationship_id", "title", "starts_at", "ends_at", "start_date", "end_date",
      "timezone", "all_day", "location", "meeting_url", "notes", "status", "source", "revision", "created_at", "updated_at", "cancelled_at",
    ].sort(), "JSONB RPC result contains every DiaryAppointmentRow field");
    assert.equal(created.owner_user_id, actor); assert.equal(created.source, "relationship"); assert.equal(created.status, "confirmed"); assert.equal(created.revision, 1);
    const edited = await call({ action: "update", id: created.id, revision: 1, title: "Auriel follow-up", start: "2026-11-12T11:00:00Z", end: "2026-11-12T11:45:00Z", status: "confirmed" });
    assert.equal(edited.title, "Auriel follow-up"); assert.equal(new Date(edited.starts_at).toISOString(), "2026-11-12T11:00:00.000Z"); assert.equal(edited.revision, 2);
    const rescheduled = await call({ action: "update", id: created.id, revision: 2, title: "Auriel follow-up", start: "2026-11-13T14:00:00Z", end: "2026-11-13T14:45:00Z", status: "confirmed" });
    assert.equal(new Date(rescheduled.starts_at).toISOString(), "2026-11-13T14:00:00.000Z"); assert.equal(rescheduled.revision, 3);
    await assert.rejects(call({ action: "update", id: created.id, revision: 1 }), error => error.message.includes("appointment_revision_conflict"));
    await assert.rejects(call({ action: "cancel", id: created.id, revision: 2, title: null, start: null, end: null, status: null }), error => error.message.includes("appointment_revision_conflict"));
    const foreign = await call({ action: "create", tenant: otherOrg, actorId: otherActor, relationshipId: foreignRelationship });
    await assert.rejects(call({ action: "create", actorId: viewer }), error => error.message.includes("appointment_actor_not_authorized"));
    await assert.rejects(call({ action: "create", tenant: otherOrg, actorId: otherActor, relationshipId: relationship }), error => error.message.includes("appointment_relationship_unavailable"));
    await assert.rejects(call({ action: "update", id: foreign.id, revision: foreign.revision }), error => error.message.includes("appointment_not_found"));
    const cancelled = await call({ action: "cancel", id: created.id, revision: 3, title: null, start: null, end: null, status: null });
    assert.equal(cancelled.status, "cancelled"); assert.ok(cancelled.cancelled_at); assert.equal(cancelled.revision, 4);
    await assert.rejects(call({ action: "cancel", id: created.id, revision: 3, title: null, start: null, end: null, status: null }), error => error.message.includes("appointment_revision_conflict"));
    await assert.rejects(call({ action: "update", id: created.id, revision: 4 }), error => error.message.includes("appointment_not_editable"));

    const completedCandidate = await call({ action: "create", status: "confirmed" });
    const completed = await call({ action: "update", id: completedCandidate.id, revision: 1, status: "completed" });
    assert.equal(completed.status, "completed"); assert.equal(completed.revision, 2);
    await assert.rejects(call({ action: "update", id: completed.id, revision: 2 }), error => error.message.includes("appointment_not_editable"));
    assert.equal((await db.query("select count(*)::int n from appointments where organisation_id=$1", [org])).rows[0].n, 2, "cancelled appointment remains stored alongside the completed appointment");
    assert.equal((await db.query("select count(*)::int n from appointments where organisation_id=$1", [otherOrg])).rows[0].n, 1, "foreign appointment remains isolated in its tenant");
    assert.equal((await db.query("select count(*)::int n from growth_targets")).rows[0].n, 1, "existing meeting source is unchanged");
    assert.equal((await db.query("select count(*)::int n from relationship_tasks")).rows[0].n, 1, "existing task source is unchanged");
    const perms = (await db.query(`select has_table_privilege('anon','appointments','SELECT') anon_read,
      has_table_privilege('authenticated','appointments','INSERT') user_write,
      has_table_privilege('service_role','appointments','SELECT') service_read,
      has_table_privilege('service_role','appointments','INSERT') service_direct_write,
      (select relrowsecurity from pg_class where relname='appointments') rls`)).rows[0];
    assert.deepEqual(perms, { anon_read: false, user_write: false, service_read: true, service_direct_write: false, rls: true });
    assert.equal((await db.query("select has_function_privilege('anon','save_appointment(uuid,uuid,text,uuid,bigint,uuid,text,timestamptz,timestamptz,date,date,text,boolean,text,text,text,text)','EXECUTE') allowed")).rows[0].allowed, false);
  } finally { await db.close(); }
});

test("appointment API read is behind tenant middleware and list query is organisation-filtered", async () => {
  const queried = [], row = { id: "appointment", organisation_id: org };
  const query = { select: () => query, eq: (column, value) => { queried.push([column, value]); return query; }, order: () => query, limit: async () => ({ data: [row], error: null }) };
  const service = load("lib/diaryAppointments.server.ts", {
    "@/lib/supabaseAdmin": { supabaseAdmin: { from: name => { assert.equal(name, "appointments"); return query; } } },
    "@/lib/relationshipWorkspace.server": {}, "@/lib/diaryAppointments": {}, "@/lib/operationalIntelligence.server": {},
  });
  const rows = await service.readDiaryAppointments(org);
  assert.deepEqual(rows, [row]); assert.deepEqual(queried[0], ["organisation_id", org]);
});

test("appointment create route takes organisation and actor only from authenticated tenant context", async () => {
  let captured;
  const route = load("app/api/diary/appointments/route.ts", {
    "next/server": { NextResponse: { json: (body, init) => ({ body, init }) } },
    "@/lib/tenantRoute.server": { withTenantRoute: handler => async request => handler(request, { organisationId: org, userId: actor }) },
    "@/lib/diaryAppointments.server": {
      readDiaryAppointments: async () => [],
      saveDiaryAppointment: async (tenant, action, input) => { captured = { tenant, action, input }; return { id: "created", organisation_id: tenant.organisationId }; },
      DiaryAppointmentError: class extends Error {},
    },
  });
  const response = await route.POST({ json: async () => ({ organisationId: otherOrg, ownerUserId: viewer, title: "Planning call" }) });
  assert.equal(response.init.status, 201);
  assert.deepEqual(captured.tenant, { organisationId: org, userId: actor });
  assert.equal(captured.action, "create");
  assert.equal(captured.input.organisationId, otherOrg, "untrusted fields may arrive but are never used as tenant authority");
  assert.equal(response.body.appointment.organisation_id, org);
});

test("server never accepts an unvalidated relationship ID or caller-supplied owner/organisation", () => {
  const serviceSource = fs.readFileSync("lib/diaryAppointments.server.ts", "utf8"), routeSource = fs.readFileSync("app/api/diary/appointments/route.ts", "utf8");
  assert.match(serviceSource, /readOperationalIntelligence\(tenant, `workspace_\$\{values\.relationshipId\}`\)/);
  assert.match(serviceSource, /p_org: tenant\.organisationId, p_actor: tenant\.userId/);
  assert.doesNotMatch(serviceSource, /input\.organisationId|input\.ownerUserId/);
  assert.match(routeSource, /withTenantRoute/);
});
