import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { PGlite } from "@electric-sql/pglite";
import { createRequire } from "node:module";
const nodeRequire = createRequire(import.meta.url);

function load(file, deps = {}, extra = {}) {
  const mod = { exports: {} };
  const output = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  vm.runInNewContext(output, { module: mod, exports: mod.exports, Date, Intl, URL, Buffer, console, process: { env: { GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"), ...extra.env } }, require: name => name in deps ? deps[name] : nodeRequire(name) });
  return mod.exports;
}

test("Calendar projection preserves all-day dates, video links and UK DST-safe bounds", () => {
  const model = load("lib/diaryGoogleCalendar.ts", { "@/lib/diaryAppointments": load("lib/diaryAppointments.ts") });
  const range = model.googleCalendarRange("2026-10-25", "2026-10-26");
  assert.equal(range.timeMin, "2026-10-24T23:00:00.000Z");
  assert.equal(range.timeMax, "2026-10-26T00:00:00.000Z");
  const event = model.projectGoogleEvent({ id: "native-1", summary: "Team day", start: { date: "2026-10-25" }, end: { date: "2026-10-26" }, conferenceData: { entryPoints: [{ entryPointType: "video", uri: "https://meet.google.com/abc-defg-hij" }] } }, "primary");
  assert.equal(event.allDay, true); assert.equal(event.startDate, "2026-10-25"); assert.equal(event.endDate, "2026-10-26");
  assert.equal(event.meetingUrl, "https://meet.google.com/abc-defg-hij"); assert.equal(model.projectGoogleEvent({ id: "gone", status: "cancelled" }), null);
  assert.match(model.googleEventId("org", "appointment"), /^root[0-9a-f]{64}$/);
  assert.equal(model.googleEventId("org", "appointment"), model.googleEventId("org", "appointment"));
});

function calendarHarness({ loseFirstInsertResponse = false } = {}) {
  const db = { connection: null, appointments: new Map(), queriedTables: [] };
  class Query {
    constructor(table) { this.table = table; this.filters = {}; this.fields = {}; }
    select() { return this; }
    upsert(row) { db.connection = structuredClone(row); return Promise.resolve({ error: null }); }
    update(fields) { this.fields = fields; return this; }
    eq(key, value) { this.filters[key] = value; return this; }
    maybeSingle() { if (this.table === "appointments") { const current = db.appointments.get(this.filters.id); if (current && current.organisation_id === this.filters.organisation_id) Object.assign(current, structuredClone(this.fields)); return Promise.resolve({ data: current && current.organisation_id === this.filters.organisation_id ? { id: current.id } : null, error: null }); } return Promise.resolve({ data: this.table === "google_calendar_connections" ? db.connection : null, error: null }); }
    then(resolve, reject) {
      if (this.table === "appointments") {
        const current = db.appointments.get(this.filters.id);
        if (current && current.organisation_id === this.filters.organisation_id) Object.assign(current, structuredClone(this.fields));
      }
      return Promise.resolve({ error: null }).then(resolve, reject);
    }
  }
  const supabaseAdmin = { from(table) { db.queriedTables.push(table); return new Query(table); } };
  const events = new Map(); let insertCalls = 0, updateCalls = 0, listArgs;
  const calendar = { events: {
    async list(args) { listArgs = args; return { data: { items: [...events.values()] } }; },
    async insert({ requestBody }) { insertCalls++; if (events.has(requestBody.id)) throw { code: 409 }; const created = { ...structuredClone(requestBody), etag: "etag-1" }; events.set(requestBody.id, created); if (loseFirstInsertResponse && insertCalls === 1) throw { code: 503 }; return { data: created }; },
    async get({ eventId }) { const event = events.get(eventId); if (!event) throw { code: 404 }; return { data: structuredClone(event) }; },
    async update({ eventId, requestBody }, options) { updateCalls++; const current = events.get(eventId); assert.equal(options?.headers?.["If-Match"], current.etag); const updated = { ...structuredClone(requestBody), etag: `etag-${updateCalls + 1}` }; events.set(eventId, updated); return { data: updated }; },
    async delete({ eventId }) { events.delete(eventId); return { data: {} }; },
  } };
  class OAuth2 { setCredentials(value) { this.credentials = value; } }
  const google = { auth: { OAuth2 }, calendar: () => calendar };
  const service = load("lib/diaryGoogleCalendar.server.ts", { googleapis: { google }, "@/lib/supabaseAdmin": { supabaseAdmin }, "@/lib/diaryGoogleCalendar": load("lib/diaryGoogleCalendar.ts", { "@/lib/diaryAppointments": load("lib/diaryAppointments.ts") }) }, { env: { GOOGLE_CALENDAR_CLIENT_ID: "test-client", GOOGLE_CALENDAR_CLIENT_SECRET: "test-secret", GOOGLE_CALENDAR_REDIRECT_URI: "https://app.test/callback" } });
  return { db, events, calendar, service, get insertCalls() { return insertCalls; }, get updateCalls() { return updateCalls; }, get listArgs() { return listArgs; } };
}

const row = (org = "org-1") => ({ id: "apt-1", organisation_id: org, title: "Planning", starts_at: "2026-10-25T10:00:00Z", ends_at: "2026-10-25T10:30:00Z", start_date: null, end_date: null, timezone: "Europe/London", all_day: false, location: "London", meeting_url: "https://meet.google.com/abc-defg-hij", notes: "Discuss plan", status: "confirmed", google_calendar_sync_enabled: false, google_calendar_id: null, google_calendar_event_id: null, google_calendar_etag: null });

test("native events are a read-only Calendar projection with recurring occurrences expanded", async () => {
  const h = calendarHarness();
  await h.service.storeGoogleCalendarConnection({ organisationId: "org-1", ownerUserId: "user-1", accountId: "google-1", email: "david@example.com", refreshToken: "server-only-refresh" });
  h.events.set("native-event", { id: "native-event", summary: "Recurring stand-up", start: { dateTime: "2026-10-25T10:00:00+01:00", timeZone: "Europe/London" }, end: { dateTime: "2026-10-25T10:30:00+01:00", timeZone: "Europe/London" } });
  const result = await h.service.readGoogleCalendar("org-1", "2026-10-25", "2026-10-26");
  assert.equal(result.connection.connected, true); assert.equal(result.events[0].title, "Recurring stand-up");
  assert.equal(h.listArgs.singleEvents, true); assert.equal(h.listArgs.orderBy, "startTime");
  assert.equal(h.db.queriedTables.includes("appointments"), false, "Calendar display does not create or query Root appointment rows");
});

test("Root mirror retries reuse one deterministic event and edits update that exact ID", async () => {
  const h = calendarHarness({ loseFirstInsertResponse: true }), root = row(); h.db.appointments.set(root.id, structuredClone(root));
  await h.service.storeGoogleCalendarConnection({ organisationId: root.organisation_id, ownerUserId: "user-1", accountId: "google-1", email: "david@example.com", refreshToken: "server-only-refresh" });
  await assert.rejects(h.service.syncRootAppointment(root.organisation_id, root), /Root appointment remains saved/);
  assert.equal(h.events.size, 1); assert.equal(h.db.appointments.get(root.id).google_calendar_sync_enabled, true);
  await h.service.syncRootAppointment(root.organisation_id, h.db.appointments.get(root.id));
  const mirrored = h.db.appointments.get(root.id), eventId = mirrored.google_calendar_event_id;
  assert.ok(eventId); assert.equal(h.events.size, 1); assert.equal(mirrored.google_calendar_sync_pending, false);
  const edited = { ...mirrored, title: "Planning rescheduled", starts_at: "2026-10-26T10:00:00Z" };
  await h.service.syncRootAppointment(root.organisation_id, edited);
  assert.equal(h.events.size, 1); assert.equal([...h.events.keys()][0], eventId); assert.equal(h.updateCalls, 1);
  assert.equal(h.events.get(eventId).summary, "Planning rescheduled"); assert.equal(h.events.get(eventId).extendedProperties.private.rootAppointmentId, root.id);
  await h.service.cancelRootMirror(root.organisation_id, h.db.appointments.get(root.id));
  assert.equal(h.events.size, 0, "only the stored Root-owned mirror is cancelled");
});

test("Root tenant mismatch fails closed before any Calendar write", async () => {
  const h = calendarHarness(), wrong = row("org-2");
  await assert.rejects(h.service.syncRootAppointment("org-1", wrong), /cannot be synced/);
  assert.equal(h.insertCalls, 0);
});

test("cancelling a Root appointment without a created mirror never calls Google", async () => {
  const h = calendarHarness(), appointment = { ...row(), google_calendar_sync_enabled: true, google_calendar_sync_pending: true };
  h.db.appointments.set(appointment.id, structuredClone(appointment));
  await h.service.cancelRootMirror(appointment.organisation_id, appointment);
  assert.equal(h.events.size, 0); assert.equal(h.db.appointments.get(appointment.id).google_calendar_sync_pending, false);
});

test("Root create remains saved when the optional Google API call fails", async () => {
  let saved = false, syncCalls = 0;
  const route = load("app/api/diary/appointments/route.ts", {
    "next/server": { NextResponse: { json: (body, options = {}) => ({ body, status: options.status || 200 }) } },
    "@/lib/tenantRoute.server": { withTenantRoute: handler => handler },
    "@/lib/diaryAppointments.server": { DiaryAppointmentError: class DiaryAppointmentError extends Error { constructor(message, status) { super(message); this.status = status; } }, readDiaryAppointments: async () => [], saveDiaryAppointment: async () => { saved = true; return row(); } },
    "@/lib/diaryGoogleCalendar.server": { syncRootAppointment: async () => { syncCalls++; throw new Error("provider details must not escape"); } },
  });
  const rootOnly = await route.POST({ json: async () => ({ title: "Root only" }) }, { organisationId: "org-1" });
  assert.equal(rootOnly.status, 201); assert.equal(syncCalls, 0);
  const response = await route.POST({ json: async () => ({ title: "Planning", syncToGoogle: true }) }, { organisationId: "org-1" });
  assert.equal(saved, true); assert.equal(syncCalls, 1); assert.equal(response.status, 201); assert.equal(response.body.success, true);
  assert.match(response.body.calendarSyncWarning, /Root appointment saved/); assert.doesNotMatch(JSON.stringify(response.body), /provider details|refresh_token/);
});

test("Calendar credentials stay server-only and migration grants no browser access", async () => {
  const migration = fs.readFileSync("supabase/migrations/20261110120000_diary_google_calendar.sql", "utf8");
  assert.match(migration, /enable row level security/i); assert.match(migration, /revoke all on public\.google_calendar_connections from public, anon, authenticated, service_role/i);
  assert.match(migration, /grant select, insert, update, delete on public\.google_calendar_connections to service_role/i);
  assert.match(fs.readFileSync("lib/diaryGoogleCalendar.server.ts", "utf8"), /aes-256-gcm/);
  const connect = fs.readFileSync("app/api/diary/calendar/connect/route.ts", "utf8"); assert.match(connect, /calendar\.events\.owned/); assert.doesNotMatch(connect, /gmail|calendar\.events"/i);
  assert.match(fs.readFileSync("app/api/oauth/google/start/route.ts", "utf8"), /userinfo\.profile/);
  assert.doesNotMatch(fs.readFileSync("lib/diary.ts", "utf8"), /refresh_token|access_token/i);
  assert.doesNotMatch(fs.readFileSync("app/dashboard/diary/Diary.tsx", "utf8"), /refresh_token|access_token/i);
  assert.match(fs.readFileSync("lib/diary.server.ts", "utf8"), /google_calendar_id.*google_calendar_event_id/);
  assert.match(fs.readFileSync("lib/diaryAppointments.server.ts", "utf8"), /google_calendar_sync_pending/);
});

test("Calendar schema is isolated and mirror updates are limited to the service role", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create table organisations(id uuid primary key);
      create table organisation_members(organisation_id uuid not null,user_id uuid not null,role text not null);
      create table relationship_workspaces(id uuid not null,organisation_id uuid not null,founder_only boolean not null default false,unique(organisation_id,id));
      insert into organisations values ('00000000-0000-4000-8000-000000000001');`);
    await db.exec(fs.readFileSync("supabase/migrations/20261109090000_diary_appointments.sql", "utf8"));
    await db.exec(fs.readFileSync("supabase/migrations/20261110120000_diary_google_calendar.sql", "utf8"));
    const result = (await db.query(`select
      (select relrowsecurity from pg_class where relname='google_calendar_connections') as rls,
      has_table_privilege('anon','public.google_calendar_connections','SELECT') as anon_read,
      has_table_privilege('authenticated','public.google_calendar_connections','SELECT') as auth_read,
      has_table_privilege('service_role','public.google_calendar_connections','SELECT') as service_read,
      has_column_privilege('service_role','public.appointments','google_calendar_event_id','UPDATE') as service_mirror_update,
      has_column_privilege('authenticated','public.appointments','google_calendar_event_id','UPDATE') as auth_mirror_update`)).rows[0];
    assert.equal(result.rls, true); assert.equal(result.anon_read, false); assert.equal(result.auth_read, false);
    assert.equal(result.service_read, true); assert.equal(result.service_mirror_update, true); assert.equal(result.auth_mirror_update, false);
  } finally { await db.close(); }
});

test("Diary places Google-native events in the existing primary appointments lane as read-only cards", () => {
  const ui = fs.readFileSync("app/dashboard/diary/Diary.tsx", "utf8"), server = fs.readFileSync("lib/diary.server.ts", "utf8");
  assert.match(ui, /Google Calendar · Read only/); assert.match(ui, /kind: "google"/); assert.match(ui, /Appointments/);
  assert.match(server, /calendar\.events\.filter/); assert.match(server, /mirroredIds/);
  assert.doesNotMatch(ui, /onEdit\(entry\.event|onCancel\(entry\.event/);
});
