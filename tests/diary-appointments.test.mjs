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
    const oldAppointment = (await db.query("select save_appointment($1,$2,'create',null,null,null,'Before Meet migration','2026-11-10T08:00:00Z','2026-11-10T08:30:00Z',null,null,'Europe/London',false,null,'https://calls.example/legacy',null,'confirmed') as row", [org, actor])).rows[0].row;
    await db.exec(fs.readFileSync("supabase/migrations/20261111120000_diary_google_meet_invitations.sql", "utf8"));
    const rpcSignatures = (await db.query(`select
      to_regprocedure('public.save_appointment(uuid,uuid,text,uuid,bigint,uuid,text,timestamptz,timestamptz,date,date,text,boolean,text,text,text,text)') is not null as legacy_exists,
      to_regprocedure('public.save_appointment(uuid,uuid,text,uuid,bigint,uuid,text,timestamptz,timestamptz,date,date,text,boolean,text,text,text,text,boolean,text)') is not null as meet_exists`)).rows[0];
    assert.deepEqual(rpcSignatures, { legacy_exists: true, meet_exists: true }, "migration retains the old RPC and adds the Meet-aware overload");
    const oldState = (await db.query("select google_meet_enabled,google_meet_request_id,google_meet_url,google_calendar_attendee_email,meeting_url from appointments where id=$1", [oldAppointment.id])).rows[0];
    assert.deepEqual(oldState, { google_meet_enabled: false, google_meet_request_id: null, google_meet_url: null, google_calendar_attendee_email: null, meeting_url: "https://calls.example/legacy" }, "existing appointments default safely without backfilling or changing meeting_url");
    const call = async ({ action, id, revision, relationshipId = null, title = "Auriel Wetherall call", start = "2026-11-10T10:00:00Z", end = "2026-11-10T10:30:00Z", status = "tentative", actorId = actor, tenant = org, googleMeetEnabled = false, attendeeEmail = null, meetingUrl = null } = {}) => (await db.query(
      "select save_appointment($1,$2,$3,$4,$5,$6,$7,$8,$9,null,null,'Europe/London',false,null,$13,null,$10,$11,$12) as row",
      [tenant, actorId, action, id ?? null, revision ?? null, relationshipId, title, start, end, status, googleMeetEnabled, attendeeEmail, meetingUrl],
    )).rows[0].row;
    const legacyCall = async ({ action, id = null, revision = null, relationshipId = null, title = "Legacy Diary appointment", start = "2026-11-10T10:00:00Z", end = "2026-11-10T10:30:00Z", status = "confirmed", actorId = actor, tenant = org, meetingUrl = null } = {}) => (await db.query(
      "select save_appointment($1,$2,$3,$4,$5,$6,$7,$8,$9,null,null,'Europe/London',false,null,$10,null,$11) as row",
      [tenant, actorId, action, id, revision, relationshipId, title, start, end, meetingUrl, status],
    )).rows[0].row;
    const legacyCreated = await legacyCall({ action: "create", title: "Legacy create after Meet migration", meetingUrl: "https://calls.example/legacy-after-migration" });
    assert.equal(legacyCreated.google_meet_enabled, false); assert.equal(legacyCreated.google_calendar_attendee_email, null);
    const legacyEdited = await legacyCall({ action: "update", id: legacyCreated.id, revision: 1, title: "Legacy edit after Meet migration", meetingUrl: "https://calls.example/legacy-after-migration" });
    assert.equal(legacyEdited.title, "Legacy edit after Meet migration"); assert.equal(legacyEdited.revision, 2);
    const legacyRescheduled = await legacyCall({ action: "update", id: legacyCreated.id, revision: 2, title: "Legacy reschedule after Meet migration", start: "2026-11-11T11:00:00Z", end: "2026-11-11T11:30:00Z", meetingUrl: "https://calls.example/legacy-after-migration" });
    assert.equal(new Date(legacyRescheduled.starts_at).toISOString(), "2026-11-11T11:00:00.000Z"); assert.equal(legacyRescheduled.revision, 3);
    assert.equal(legacyRescheduled.meeting_url, "https://calls.example/legacy-after-migration");
    const legacyCancelled = await legacyCall({ action: "cancel", id: legacyCreated.id, revision: 3, title: null, start: null, end: null, meetingUrl: null, status: null });
    assert.equal(legacyCancelled.status, "cancelled"); assert.equal(legacyCancelled.revision, 4);
    const created = await call({ action: "create", relationshipId: relationship, status: "confirmed", googleMeetEnabled: true, attendeeEmail: "sam@example.com" });
    assert.deepEqual(Object.keys(created).sort(), [
      "id", "organisation_id", "owner_user_id", "relationship_id", "title", "starts_at", "ends_at", "start_date", "end_date",
      "timezone", "all_day", "location", "meeting_url", "notes", "status", "source", "revision", "created_at", "updated_at", "cancelled_at",
      "google_meet_enabled", "google_meet_request_id", "google_meet_url", "google_calendar_attendee_email",
    ].sort(), "JSONB RPC result contains every DiaryAppointmentRow field");
    assert.equal(created.owner_user_id, actor); assert.equal(created.source, "relationship"); assert.equal(created.status, "confirmed"); assert.equal(created.revision, 1);
    assert.equal(created.google_meet_enabled, true); assert.equal(created.google_calendar_attendee_email, "sam@example.com");
    const meetPreservationCandidate = await call({ action: "create", title: "Meet state preservation", status: "confirmed", googleMeetEnabled: true, attendeeEmail: "sam@example.com", meetingUrl: "https://calls.example/meet-preserved" });
    const oldEditOfMeetAppointment = await legacyCall({ action: "update", id: meetPreservationCandidate.id, revision: 1, title: "Legacy edit preserves Meet", start: "2026-11-10T10:00:00Z", end: "2026-11-10T10:30:00Z", status: "confirmed", meetingUrl: "https://calls.example/meet-preserved" });
    assert.equal(oldEditOfMeetAppointment.google_meet_enabled, true, "legacy UPDATE omits the Meet column and preserves its value");
    assert.equal(oldEditOfMeetAppointment.google_calendar_attendee_email, "sam@example.com", "legacy UPDATE preserves attendee intent");
    assert.equal(oldEditOfMeetAppointment.meeting_url, "https://calls.example/meet-preserved", "legacy UPDATE leaves the existing meeting_url unchanged");
    const oldCancelOfMeetAppointment = await legacyCall({ action: "cancel", id: meetPreservationCandidate.id, revision: 2, title: null, start: null, end: null, meetingUrl: null, status: null });
    assert.equal(oldCancelOfMeetAppointment.google_meet_enabled, true, "legacy CANCEL preserves Meet intent");
    assert.equal(oldCancelOfMeetAppointment.google_calendar_attendee_email, "sam@example.com", "legacy CANCEL preserves attendee intent");
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
    assert.equal((await db.query("select count(*)::int n from appointments where organisation_id=$1", [org])).rows[0].n, 5, "cancelled, legacy, preservation, pre-migration and completed appointments remain stored");
    assert.equal((await db.query("select count(*)::int n from appointments where organisation_id=$1", [otherOrg])).rows[0].n, 1, "foreign appointment remains isolated in its tenant");
    assert.equal((await db.query("select count(*)::int n from growth_targets")).rows[0].n, 1, "existing meeting source is unchanged");
    assert.equal((await db.query("select count(*)::int n from relationship_tasks")).rows[0].n, 1, "existing task source is unchanged");
    const perms = (await db.query(`select has_table_privilege('anon','appointments','SELECT') anon_read,
      has_table_privilege('authenticated','appointments','INSERT') user_write,
      has_table_privilege('service_role','appointments','SELECT') service_read,
      has_table_privilege('service_role','appointments','INSERT') service_direct_write,
      has_column_privilege('service_role','public.appointments','google_meet_request_id','UPDATE') service_request_id_update,
      has_column_privilege('service_role','public.appointments','google_meet_url','UPDATE') service_meet_url_update,
      has_column_privilege('authenticated','public.appointments','google_meet_request_id','UPDATE') user_request_id_update,
      has_column_privilege('authenticated','public.appointments','google_meet_url','UPDATE') user_meet_url_update,
      has_function_privilege('anon','save_appointment(uuid,uuid,text,uuid,bigint,uuid,text,timestamptz,timestamptz,date,date,text,boolean,text,text,text,text)','EXECUTE') anon_legacy_execute,
      has_function_privilege('authenticated','save_appointment(uuid,uuid,text,uuid,bigint,uuid,text,timestamptz,timestamptz,date,date,text,boolean,text,text,text,text)','EXECUTE') authenticated_legacy_execute,
      has_function_privilege('service_role','save_appointment(uuid,uuid,text,uuid,bigint,uuid,text,timestamptz,timestamptz,date,date,text,boolean,text,text,text,text)','EXECUTE') service_legacy_execute,
      has_function_privilege('anon','save_appointment(uuid,uuid,text,uuid,bigint,uuid,text,timestamptz,timestamptz,date,date,text,boolean,text,text,text,text,boolean,text)','EXECUTE') anon_meet_execute,
      has_function_privilege('authenticated','save_appointment(uuid,uuid,text,uuid,bigint,uuid,text,timestamptz,timestamptz,date,date,text,boolean,text,text,text,text,boolean,text)','EXECUTE') authenticated_meet_execute,
      has_function_privilege('service_role','save_appointment(uuid,uuid,text,uuid,bigint,uuid,text,timestamptz,timestamptz,date,date,text,boolean,text,text,text,text,boolean,text)','EXECUTE') service_meet_execute,
      (select relrowsecurity from pg_class where relname='appointments') rls`)).rows[0];
    assert.deepEqual(perms, {
      anon_read: false, user_write: false, service_read: true, service_direct_write: false,
      service_request_id_update: true, service_meet_url_update: true, user_request_id_update: false, user_meet_url_update: false,
      anon_legacy_execute: false, authenticated_legacy_execute: false, service_legacy_execute: true,
      anon_meet_execute: false, authenticated_meet_execute: false, service_meet_execute: true, rls: true,
    });
    const rpcArgumentNames = (await db.query(`select
      (select proargnames from pg_proc where oid=to_regprocedure('public.save_appointment(uuid,uuid,text,uuid,bigint,uuid,text,timestamptz,timestamptz,date,date,text,boolean,text,text,text,text)')) legacy,
      (select proargnames from pg_proc where oid=to_regprocedure('public.save_appointment(uuid,uuid,text,uuid,bigint,uuid,text,timestamptz,timestamptz,date,date,text,boolean,text,text,text,text,boolean,text)')) meet`)).rows[0];
    for (const argName of ["p_google_meet_request_id", "p_google_meet_url"]) {
      assert.equal(rpcArgumentNames.legacy.includes(argName), false, `legacy RPC cannot accept ${argName}`);
      assert.equal(rpcArgumentNames.meet.includes(argName), false, `Meet-aware RPC cannot accept ${argName}`);
    }
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
      publicDiaryAppointment: row => row,
      DiaryAppointmentError: class extends Error {},
    },
    "@/lib/diaryGoogleCalendar.server": { syncRootAppointment: async () => {} },
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

test("save RPC persists only user-controlled Meet and invite choices and ignores forged server-managed fields", async () => {
  let args;
  const service = load("lib/diaryAppointments.server.ts", {
    "@/lib/supabaseAdmin": { supabaseAdmin: { rpc: async (name, values) => { assert.equal(name, "save_appointment"); args = values; return { data: { id: "apt", organisation_id: org }, error: null }; } } },
    "@/lib/relationshipWorkspace.server": {}, "@/lib/diaryAppointments": time, "@/lib/operationalIntelligence.server": {},
  });
  await service.saveDiaryAppointment({ organisationId: org, userId: actor, role: "owner" }, "create", {
    title: "Meet and invite", startDate: "2026-11-12", startTime: "10:00", endDate: "2026-11-12", endTime: "10:30", timezone: "Europe/London",
    googleMeetEnabled: true, inviteAttendee: true, googleCalendarAttendeeEmail: "Sam@example.com",
    googleMeetRequestId: "forged-request", googleMeetUrl: "https://meet.google.com/not-root-generated",
  });
  assert.equal(args.p_google_meet_enabled, true);
  assert.equal(args.p_google_calendar_attendee_email, "sam@example.com");
  assert.equal(Object.hasOwn(args, "p_google_meet_request_id"), false);
  assert.equal(Object.hasOwn(args, "p_google_meet_url"), false);
  const publicRow = service.publicDiaryAppointment({ id: "apt", organisation_id: org, google_meet_request_id: "server-only", google_meet_url: "https://meet.google.com/abc-defg-hij" });
  assert.equal(Object.hasOwn(publicRow, "google_meet_request_id"), false, "request identity remains server-only in API responses");
  assert.equal(publicRow.google_meet_url, "https://meet.google.com/abc-defg-hij", "confirmed Meet URL is intentionally visible to the user");
  assert.throws(() => time.parseAppointmentValues({ title: "Invite", startDate: "2026-11-12", startTime: "10:00", endDate: "2026-11-12", endTime: "10:30", timezone: "Europe/London", inviteAttendee: true, googleCalendarAttendeeEmail: "bad address" }), /valid attendee email/);
  const noInvite = time.parseAppointmentValues({ title: "No invite", startDate: "2026-11-12", startTime: "10:00", endDate: "2026-11-12", endTime: "10:30", timezone: "Europe/London", inviteAttendee: false, googleCalendarAttendeeEmail: "sam@example.com" });
  assert.equal(noInvite.googleCalendarAttendeeEmail, null, "email alone never authorizes a guest invite");
});

test("verified relationship email route scopes the lookup to authenticated tenant context", async () => {
  let captured;
  const route = load("app/api/diary/relationships/route.ts", {
    "next/server": { NextResponse: { json: (body, init = {}) => ({ body, status: init.status || 200 }) } },
    "@/lib/tenantRoute.server": { withTenantRoute: handler => (request, tenant) => handler(request, tenant) },
    "@/lib/diaryAppointments.server": { searchDiaryRelationships: async () => [] },
    "@/lib/operationalIntelligence.server": { verifiedRelationshipEmails: async (tenant, id) => { captured = { tenant, id }; return ["sam@example.com"]; } },
  });
  const response = await route.GET({ url: `https://app.test/api/diary/relationships?organisationId=${otherOrg}&relationshipId=workspace-1` }, { organisationId: org, userId: actor });
  assert.deepEqual(captured, { tenant: { organisationId: org, userId: actor }, id: "workspace-1" });
  assert.equal(JSON.stringify(response.body), JSON.stringify({ verifiedEmails: ["sam@example.com"] }));
  assert.equal(response.status, 200);
});
