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

function calendarHarness({ loseFirstInsertResponse = false, conferenceStatus = "success" } = {}) {
  const db = { connection: null, appointments: new Map(), queriedTables: [] };
  class Query {
    constructor(table) { this.table = table; this.filters = {}; this.fields = {}; }
    select(fields) { this.selected = fields; return this; }
    upsert(row) { db.connection = structuredClone(row); return Promise.resolve({ error: null }); }
    update(fields) { this.fields = fields; return this; }
    eq(key, value) { this.filters[key] = value; return this; }
    is(key, value) { this.filters[key] = value; return this; }
    maybeSingle() { if (this.table === "appointments") { const current = db.appointments.get(this.filters.id); const matches = current && current.organisation_id === this.filters.organisation_id && (!Object.hasOwn(this.filters, "google_meet_request_id") || current.google_meet_request_id === this.filters.google_meet_request_id); if (matches) Object.assign(current, structuredClone(this.fields)); const keys = (this.selected || "id").split(",").map(value => value.trim()); return Promise.resolve({ data: matches ? Object.fromEntries(keys.map(key => [key, current[key]])) : null, error: null }); } return Promise.resolve({ data: this.table === "google_calendar_connections" ? db.connection : null, error: null }); }
    then(resolve, reject) {
      if (this.table === "appointments") {
        const current = db.appointments.get(this.filters.id);
        if (current && current.organisation_id === this.filters.organisation_id) Object.assign(current, structuredClone(this.fields));
      }
      return Promise.resolve({ error: null }).then(resolve, reject);
    }
  }
  const supabaseAdmin = { from(table) { db.queriedTables.push(table); return new Query(table); } };
  const events = new Map(); let insertCalls = 0, updateCalls = 0, listArgs; const operations = [];
  const withConference = (event, request) => {
    if (!request) return event;
    const existing = event.conferenceData?.createRequest;
    if (existing?.requestId === request.requestId && existing.status?.statusCode === "success") return event;
    const statusCode = conferenceStatus;
    event.conferenceData = { createRequest: { ...structuredClone(request), status: { statusCode } }, ...(statusCode === "success" ? { conferenceSolution: { key: { type: "hangoutsMeet" } }, entryPoints: [{ entryPointType: "video", uri: "https://meet.google.com/abc-defg-hij" }] } : {}) };
    if (statusCode === "success") event.hangoutLink = "https://meet.google.com/abc-defg-hij";
    return event;
  };
  const calendar = { events: {
    async list(args) { listArgs = args; return { data: { items: [...events.values()] } }; },
    async insert({ requestBody, sendUpdates, conferenceDataVersion }) { insertCalls++; operations.push({ kind: "insert", sendUpdates, conferenceDataVersion, requestId: requestBody.conferenceData?.createRequest?.requestId, requestBody: structuredClone(requestBody) }); if (events.has(requestBody.id)) throw { code: 409 }; const created = withConference({ ...structuredClone(requestBody), etag: "etag-1" }, requestBody.conferenceData?.createRequest); events.set(requestBody.id, created); if (loseFirstInsertResponse && insertCalls === 1) throw { code: 503 }; return { data: structuredClone(created) }; },
    async get({ eventId }) { const event = events.get(eventId); if (!event) throw { code: 404 }; return { data: structuredClone(event) }; },
    async update({ eventId, requestBody, sendUpdates, conferenceDataVersion }, options) { updateCalls++; const current = events.get(eventId); assert.equal(options?.headers?.["If-Match"], current.etag); operations.push({ kind: "update", sendUpdates, conferenceDataVersion, requestId: requestBody.conferenceData?.createRequest?.requestId, requestBody: structuredClone(requestBody) }); const updated = { ...structuredClone(requestBody), etag: `etag-${updateCalls + 1}` }; if (requestBody.conferenceData?.createRequest) withConference(updated, requestBody.conferenceData.createRequest); else if (requestBody.conferenceData && Object.keys(requestBody.conferenceData).length === 0) { updated.conferenceData = null; updated.hangoutLink = null; } events.set(eventId, updated); return { data: structuredClone(updated) }; },
    async delete({ eventId, sendUpdates }) { operations.push({ kind: "delete", sendUpdates }); events.delete(eventId); return { data: {} }; },
  } };
  class OAuth2 { setCredentials(value) { this.credentials = value; } }
  const google = { auth: { OAuth2 }, calendar: () => calendar };
  const calendarModel = load("lib/diaryGoogleCalendar.ts", { "@/lib/diaryAppointments": load("lib/diaryAppointments.ts") });
  const service = load("lib/diaryGoogleCalendar.server.ts", { googleapis: { google }, "@/lib/supabaseAdmin": { supabaseAdmin }, "@/lib/diaryGoogleCalendar": calendarModel }, { env: { GOOGLE_CALENDAR_CLIENT_ID: "test-client", GOOGLE_CALENDAR_CLIENT_SECRET: "test-secret", GOOGLE_CALENDAR_REDIRECT_URI: "https://app.test/callback" } });
  return { db, events, calendar, service, googleEventId: calendarModel.googleEventId, operations, get insertCalls() { return insertCalls; }, get updateCalls() { return updateCalls; }, get listArgs() { return listArgs; }, set conferenceStatus(value) { conferenceStatus = value; } };
}

const row = (org = "org-1") => ({ id: "apt-1", organisation_id: org, title: "Planning", starts_at: "2026-10-25T10:00:00Z", ends_at: "2026-10-25T10:30:00Z", start_date: null, end_date: null, timezone: "Europe/London", all_day: false, location: "London", meeting_url: "https://calls.example/existing", notes: "Discuss plan", status: "confirmed", google_calendar_sync_enabled: false, google_calendar_id: null, google_calendar_event_id: null, google_calendar_etag: null, google_meet_enabled: false, google_meet_request_id: null, google_meet_url: null, google_calendar_attendee_email: null });

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

test("Google Meet is confirmed on the deterministic event before an explicitly requested attendee is invited", async () => {
  const h = calendarHarness(), appointment = { ...row(), google_meet_enabled: true, google_calendar_attendee_email: "sam@example.com" };
  h.db.appointments.set(appointment.id, structuredClone(appointment));
  await h.service.storeGoogleCalendarConnection({ organisationId: appointment.organisation_id, ownerUserId: "user-1", accountId: "google-1", email: "david@example.com", refreshToken: "server-only-refresh" });

  const result = await h.service.syncRootAppointment(appointment.organisation_id, appointment);
  const stored = h.db.appointments.get(appointment.id), eventId = h.googleEventId(appointment.organisation_id, appointment.id), event = h.events.get(eventId);
  assert.equal(result.googleMeetPending, false);
  assert.equal(result.googleMeetUrl, "https://meet.google.com/abc-defg-hij");
  assert.equal(stored.google_meet_request_id, h.operations[0].requestId);
  assert.equal(stored.google_meet_url, "https://meet.google.com/abc-defg-hij");
  assert.equal(h.operations[0].kind, "insert");
  assert.equal(h.operations[0].conferenceDataVersion, 1);
  assert.equal(h.operations[0].sendUpdates, "none", "event creation does not invite before Meet is confirmed");
  assert.equal(h.operations[0].requestBody.attendees, undefined);
  assert.equal(h.operations[1].kind, "update");
  assert.equal(h.operations[1].conferenceDataVersion, 1);
  assert.equal(h.operations[1].sendUpdates, "all");
  assert.deepEqual(eventAttendees(event), ["sam@example.com"]);
  assert.equal(event.conferenceData.createRequest.requestId, stored.google_meet_request_id);
  assert.equal(event.description, "Discuss plan\n\nMeeting link: https://calls.example/existing", "the existing meeting_url is preserved as separate event content");
});

test("Meet pending state sends no invitation and later confirmation reuses the request and event", async () => {
  const h = calendarHarness({ conferenceStatus: "pending" }), appointment = { ...row(), google_meet_enabled: true, google_calendar_attendee_email: "sam@example.com" };
  h.db.appointments.set(appointment.id, structuredClone(appointment));
  await h.service.storeGoogleCalendarConnection({ organisationId: appointment.organisation_id, ownerUserId: "user-1", accountId: "google-1", email: "david@example.com", refreshToken: "server-only-refresh" });

  const pending = await h.service.syncRootAppointment(appointment.organisation_id, appointment);
  const savedPending = h.db.appointments.get(appointment.id), eventId = savedPending.google_calendar_event_id;
  assert.equal(pending.googleMeetPending, true);
  assert.equal(savedPending.google_meet_url, null);
  assert.ok(savedPending.google_meet_request_id);
  assert.equal(h.operations.length, 1);
  assert.equal(h.operations[0].sendUpdates, "none");
  assert.equal(h.events.get(eventId).attendees, undefined);

  const event = h.events.get(eventId);
  event.conferenceData.createRequest.status.statusCode = "success";
  event.conferenceData.conferenceSolution = { key: { type: "hangoutsMeet" } };
  event.conferenceData.entryPoints = [{ entryPointType: "video", uri: "https://meet.google.com/abc-defg-hij" }];
  event.hangoutLink = "https://meet.google.com/abc-defg-hij";
  const confirmed = await h.service.syncRootAppointment(appointment.organisation_id, savedPending);
  assert.equal(confirmed.googleMeetPending, false);
  assert.equal(confirmed.googleMeetUrl, "https://meet.google.com/abc-defg-hij");
  assert.equal(h.events.size, 1);
  assert.equal(h.operations[1].kind, "update");
  assert.equal(h.operations[1].requestBody.id, eventId);
  assert.equal(h.operations[1].requestBody.conferenceData.createRequest.requestId, savedPending.google_meet_request_id);
  assert.deepEqual(eventAttendees(h.events.get(eventId)), ["sam@example.com"]);
  assert.equal(h.operations[1].sendUpdates, "all");
});

test("a Meet-shaped link is not stored while Google's conference request is still pending", async () => {
  const h = calendarHarness({ conferenceStatus: "pending" }), appointment = { ...row(), google_meet_enabled: true };
  h.db.appointments.set(appointment.id, structuredClone(appointment));
  await h.service.storeGoogleCalendarConnection({ organisationId: appointment.organisation_id, ownerUserId: "user-1", accountId: "google-1", email: "david@example.com", refreshToken: "server-only-refresh" });
  const result = await h.service.syncRootAppointment(appointment.organisation_id, appointment);
  const event = h.events.get(h.googleEventId(appointment.organisation_id, appointment.id));
  event.hangoutLink = "https://meet.google.com/abc-defg-hij";
  event.conferenceData.conferenceSolution = { key: { type: "hangoutsMeet" } };
  const next = await h.service.syncRootAppointment(appointment.organisation_id, h.db.appointments.get(appointment.id));
  assert.equal(result.googleMeetPending, true);
  assert.equal(next.googleMeetPending, true);
  assert.equal(next.googleMeetUrl, null);
  assert.equal(h.db.appointments.get(appointment.id).google_meet_url, null);
  assert.equal(h.operations.length, 1, "pending conference is not replaced by a second request");
});

test("lost Meet insert response retries the same request ID and does not duplicate the event or conference", async () => {
  const h = calendarHarness({ loseFirstInsertResponse: true }), appointment = { ...row(), google_meet_enabled: true };
  h.db.appointments.set(appointment.id, structuredClone(appointment));
  await h.service.storeGoogleCalendarConnection({ organisationId: appointment.organisation_id, ownerUserId: "user-1", accountId: "google-1", email: "david@example.com", refreshToken: "server-only-refresh" });

  await assert.rejects(h.service.syncRootAppointment(appointment.organisation_id, appointment), /retry is safe/);
  const requestId = h.db.appointments.get(appointment.id).google_meet_request_id;
  assert.ok(requestId);
  const result = await h.service.syncRootAppointment(appointment.organisation_id, h.db.appointments.get(appointment.id));
  assert.equal(result.googleMeetPending, false);
  assert.equal(h.operations[0].requestId, requestId);
  assert.equal(h.operations[1].kind, "insert");
  assert.equal(h.operations[1].requestId, requestId);
  assert.equal(h.events.size, 1);
  assert.equal(h.db.appointments.get(appointment.id).google_calendar_event_id, h.googleEventId(appointment.organisation_id, appointment.id));
  assert.equal(h.db.appointments.get(appointment.id).google_meet_request_id, requestId);
});

test("rescheduling and attendee changes update the same Root event and retain its Meet request identity", async () => {
  const h = calendarHarness(), appointment = { ...row(), google_meet_enabled: true, google_calendar_attendee_email: "sam@example.com" };
  h.db.appointments.set(appointment.id, structuredClone(appointment));
  await h.service.storeGoogleCalendarConnection({ organisationId: appointment.organisation_id, ownerUserId: "user-1", accountId: "google-1", email: "david@example.com", refreshToken: "server-only-refresh" });
  await h.service.syncRootAppointment(appointment.organisation_id, appointment);
  const before = h.db.appointments.get(appointment.id), requestId = before.google_meet_request_id, eventId = before.google_calendar_event_id;
  const updated = { ...before, starts_at: "2026-10-26T12:00:00Z", ends_at: "2026-10-26T12:45:00Z", google_calendar_attendee_email: "alex@example.com" };
  await h.service.syncRootAppointment(appointment.organisation_id, updated);
  const event = h.events.get(eventId);
  assert.equal(h.events.size, 1);
  assert.equal(h.insertCalls, 1);
  assert.equal(h.updateCalls, 2);
  assert.equal(event.id, eventId);
  assert.equal(event.start.dateTime, updated.starts_at);
  assert.equal(event.conferenceData.createRequest.requestId, requestId);
  assert.equal(h.db.appointments.get(appointment.id).google_meet_request_id, requestId);
  assert.equal(h.db.appointments.get(appointment.id).google_meet_url, "https://meet.google.com/abc-defg-hij");
  assert.deepEqual(eventAttendees(event), ["alex@example.com"]);
  assert.equal(h.operations[2].sendUpdates, "all", "a changed attendee is explicitly notified on the same event");
});

test("a stored email without explicit invitation intent never becomes a Calendar attendee", async () => {
  const h = calendarHarness(), appointment = { ...row(), google_calendar_attendee_email: null };
  h.db.appointments.set(appointment.id, structuredClone(appointment));
  await h.service.storeGoogleCalendarConnection({ organisationId: appointment.organisation_id, ownerUserId: "user-1", accountId: "google-1", email: "david@example.com", refreshToken: "server-only-refresh" });
  await h.service.syncRootAppointment(appointment.organisation_id, appointment);
  const event = h.events.get(h.googleEventId(appointment.organisation_id, appointment.id));
  assert.deepEqual(eventAttendees(event), []);
  assert.equal(h.operations[0].sendUpdates, "none");
});

test("disabling a confirmed Meet removes that conference before a later request receives a new identity", async () => {
  const h = calendarHarness(), appointment = { ...row(), google_meet_enabled: true };
  h.db.appointments.set(appointment.id, structuredClone(appointment));
  await h.service.storeGoogleCalendarConnection({ organisationId: appointment.organisation_id, ownerUserId: "user-1", accountId: "google-1", email: "david@example.com", refreshToken: "server-only-refresh" });
  await h.service.syncRootAppointment(appointment.organisation_id, appointment);
  const confirmed = h.db.appointments.get(appointment.id), firstRequest = confirmed.google_meet_request_id, eventId = confirmed.google_calendar_event_id;
  await h.service.syncRootAppointment(appointment.organisation_id, { ...confirmed, google_meet_enabled: false });
  const cleared = h.db.appointments.get(appointment.id);
  assert.equal(cleared.google_meet_request_id, null);
  assert.equal(cleared.google_meet_url, null);
  assert.equal(h.events.get(eventId).conferenceData, null);

  await h.service.syncRootAppointment(appointment.organisation_id, { ...cleared, google_meet_enabled: true });
  const secondRequest = h.db.appointments.get(appointment.id).google_meet_request_id;
  assert.ok(secondRequest);
  assert.notEqual(secondRequest, firstRequest, "a deliberate new conference request gets a fresh identity only after the old conference is removed");
  assert.equal(h.events.size, 1);
  assert.equal([...h.events.keys()][0], eventId);
});

function eventAttendees(event) { return (event.attendees || []).map(item => item.email.toLowerCase()).sort(); }

test("Root tenant mismatch fails closed before any Calendar write", async () => {
  const h = calendarHarness(), wrong = row("org-2");
  await assert.rejects(h.service.syncRootAppointment("org-1", wrong), /cannot be synced/);
  assert.equal(h.insertCalls, 0);
});

test("cancelling a Root appointment without a created mirror never calls Google", async () => {
  const h = calendarHarness(), appointment = { ...row(), google_calendar_sync_enabled: false, google_calendar_sync_pending: false };
  h.db.appointments.set(appointment.id, structuredClone(appointment));
  await h.service.cancelRootMirror(appointment.organisation_id, appointment);
  assert.equal(h.events.size, 0); assert.equal(h.db.appointments.get(appointment.id).google_calendar_sync_pending, false);
});

test("cancellation recovers and deletes a deterministic Root mirror after Google accepted an insert but its response was lost", async () => {
  const h = calendarHarness({ loseFirstInsertResponse: true }), appointment = row();h.db.appointments.set(appointment.id,structuredClone(appointment));
  await h.service.storeGoogleCalendarConnection({organisationId:appointment.organisation_id,ownerUserId:"user-1",accountId:"google-1",email:"david@example.com",refreshToken:"server-only-refresh"});
  await assert.rejects(h.service.syncRootAppointment(appointment.organisation_id,appointment),/retry is safe/);
  const uncertain=h.db.appointments.get(appointment.id);assert.equal(uncertain.google_calendar_event_id,null);assert.equal(uncertain.google_calendar_sync_pending,true);assert.equal(h.events.size,1);
  await h.service.cancelRootMirror(appointment.organisation_id,uncertain);
  assert.equal(h.events.size,0);assert.equal(h.db.appointments.get(appointment.id).google_calendar_sync_pending,false);assert.equal(h.db.appointments.get(appointment.id).google_calendar_event_id,h.googleEventId(appointment.organisation_id,appointment.id));
});

test("uncertain-create cancellation completes when the deterministic Google event is absent", async () => {
  const h=calendarHarness(),appointment={...row(),google_calendar_sync_enabled:true,google_calendar_sync_pending:true};h.db.appointments.set(appointment.id,structuredClone(appointment));
  await h.service.storeGoogleCalendarConnection({organisationId:appointment.organisation_id,ownerUserId:"user-1",accountId:"google-1",email:"david@example.com",refreshToken:"server-only-refresh"});
  await h.service.cancelRootMirror(appointment.organisation_id,appointment);
  assert.equal(h.events.size,0);assert.equal(h.db.appointments.get(appointment.id).google_calendar_sync_pending,false);
});

test("uncertain-create cancellation fails closed and leaves an ownership-mismatched deterministic event untouched", async () => {
  const h=calendarHarness(),appointment={...row(),google_calendar_sync_enabled:true,google_calendar_sync_pending:true},eventId=h.googleEventId(appointment.organisation_id,appointment.id);h.db.appointments.set(appointment.id,structuredClone(appointment));
  await h.service.storeGoogleCalendarConnection({organisationId:appointment.organisation_id,ownerUserId:"user-1",accountId:"google-1",email:"david@example.com",refreshToken:"server-only-refresh"});
  h.events.set(eventId,{id:eventId,summary:"Not Root's event",etag:"etag-1",extendedProperties:{private:{rootManaged:"true",rootOrganisationId:appointment.organisation_id,rootAppointmentId:"another-appointment"}}});
  await assert.rejects(h.service.cancelRootMirror(appointment.organisation_id,appointment),/not verifiably owned/);
  assert.equal(h.events.size,1);assert.equal(h.db.appointments.get(appointment.id).google_calendar_sync_pending,true);
});

test("409 recovery reconciles a lost insert response to the current rescheduled Root appointment before marking synced",async()=>{
  const h=calendarHarness({loseFirstInsertResponse:true}),initial=row();h.db.appointments.set(initial.id,structuredClone(initial));
  await h.service.storeGoogleCalendarConnection({organisationId:initial.organisation_id,ownerUserId:"user-1",accountId:"google-1",email:"david@example.com",refreshToken:"server-only-refresh"});
  await assert.rejects(h.service.syncRootAppointment(initial.organisation_id,initial),/retry is safe/);
  const current={...initial,title:"Planning moved",starts_at:"2026-10-27T15:00:00Z",ends_at:"2026-10-27T15:45:00Z",timezone:"Europe/London",location:"Manchester",notes:"Updated plan"};
  await h.service.syncRootAppointment(current.organisation_id,current);
  const id=h.googleEventId(current.organisation_id,current.id),event=h.events.get(id),stored=h.db.appointments.get(current.id);
  assert.equal(h.updateCalls,1);assert.equal(event.summary,"Planning moved");assert.equal(event.start.dateTime,current.starts_at);assert.equal(event.end.dateTime,current.ends_at);assert.equal(event.start.timeZone,current.timezone);assert.equal(event.location,current.location);assert.match(event.description,/Updated plan/);
  assert.equal(stored.google_calendar_event_id,id);assert.equal(stored.google_calendar_etag,event.etag);assert.equal(stored.google_calendar_sync_pending,false);assert.ok(stored.google_calendar_synced_at);
});

test("Root create remains saved when the optional Google API call fails", async () => {
  let saved = false, syncCalls = 0;
  const route = load("app/api/diary/appointments/route.ts", {
    "next/server": { NextResponse: { json: (body, options = {}) => ({ body, status: options.status || 200 }) } },
    "@/lib/tenantRoute.server": { withTenantRoute: handler => handler },
    "@/lib/diaryAppointments.server": { DiaryAppointmentError: class DiaryAppointmentError extends Error { constructor(message, status) { super(message); this.status = status; } }, readDiaryAppointments: async () => [], saveDiaryAppointment: async () => { saved = true; return row(); }, publicDiaryAppointment: value => value },
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
