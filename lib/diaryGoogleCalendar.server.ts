import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from "node:crypto";
import { google } from "googleapis";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { googleEventId, googleCalendarRange, projectGoogleEvent, rootGoogleEventBody, type GoogleCalendarAppointment } from "@/lib/diaryGoogleCalendar";

type ConnectionRow = { organisation_id: string; owner_user_id: string; google_account_id: string; google_email: string | null; calendar_id: string; refresh_token_ciphertext: string; refresh_token_iv: string; refresh_token_tag: string };
type CalendarCredentialErrorCode = "google_calendar_client_id_missing" | "google_calendar_client_secret_missing" | "google_calendar_redirect_uri_missing" | "refresh_token_fields_missing" | "token_encryption_key_missing" | "token_encryption_key_invalid" | "refresh_token_decryption_failed";
class CalendarCredentialSetupError extends Error {
  constructor(readonly safeCode: CalendarCredentialErrorCode) { super("Google Calendar credentials are not ready."); }
}
export type CalendarConnectionSummary = { connected: boolean; email: string | null };
export type CalendarDiagnosticEvent = {
  id: string;
  organizerEmail: string | null;
  status: string | null;
  startsAt: string | null;
  endsAt: string | null;
  projected: boolean;
  projectionReason: "cancelled" | "missing_id" | "missing_time" | null;
};
export type CalendarReadDiagnostic = {
  accountEmail: string | null;
  calendarId: string | null;
  request: { outcome: "success" | "not_connected" | "failed"; stage: "connection_lookup" | "credential_setup" | "events.list" | null; statusCode: number | null; errorCode: string | null; eventsReturnedCount: number; timeMin: string; timeMax: string };
  targetEvents: CalendarDiagnosticEvent[];
};
export type CalendarReadResult = { connection: CalendarConnectionSummary; events: GoogleCalendarAppointment[]; unavailable: boolean; diagnostic?: CalendarReadDiagnostic };
export const DIARY_CALENDAR_DIAGNOSTIC_ORGANISATION_ID = "78fa2ac8-e7b6-4b9b-9604-035723ece6b1";
export const DIARY_CALENDAR_DIAGNOSTIC_BRANCH = "codex/google-calendar-inbound-discovery";
export type RootMirrorRow = {
  id: string; organisation_id: string; title: string; starts_at: string | null; ends_at: string | null;
  start_date: string | null; end_date: string | null; timezone: string; all_day: boolean; location: string | null;
  meeting_url: string | null; notes: string | null; status: string; google_calendar_sync_enabled?: boolean;
  google_calendar_sync_pending?: boolean;
  google_calendar_id?: string | null; google_calendar_event_id?: string | null; google_calendar_etag?: string | null;
  google_meet_enabled?: boolean; google_meet_request_id?: string | null; google_meet_url?: string | null;
  google_calendar_attendee_email?: string | null;
};

function encryptionKey() {
  const raw = process.env.GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY || "";
  if (!raw.trim()) throw new CalendarCredentialSetupError("token_encryption_key_missing");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new CalendarCredentialSetupError("token_encryption_key_invalid");
  return key;
}
function encryptRefreshToken(token: string, organisationId: string) {
  const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  cipher.setAAD(Buffer.from(`root-health-google-calendar:v1:${organisationId}`));
  const ciphertext = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return { refresh_token_ciphertext: ciphertext.toString("base64"), refresh_token_iv: iv.toString("base64"), refresh_token_tag: cipher.getAuthTag().toString("base64") };
}
function decryptRefreshToken(row: ConnectionRow) {
  if (!row.refresh_token_ciphertext || !row.refresh_token_iv || !row.refresh_token_tag) throw new CalendarCredentialSetupError("refresh_token_fields_missing");
  try {
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(row.refresh_token_iv, "base64"));
    decipher.setAAD(Buffer.from(`root-health-google-calendar:v1:${row.organisation_id}`));
    decipher.setAuthTag(Buffer.from(row.refresh_token_tag, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(row.refresh_token_ciphertext, "base64")), decipher.final()]).toString("utf8");
  } catch (error) {
    if (error instanceof CalendarCredentialSetupError) throw error;
    throw new CalendarCredentialSetupError("refresh_token_decryption_failed");
  }
}

export async function storeGoogleCalendarConnection(input: { organisationId: string; ownerUserId: string; accountId: string; email: string | null; refreshToken: string }) {
  const encrypted = encryptRefreshToken(input.refreshToken, input.organisationId);
  const { error } = await supabaseAdmin.from("google_calendar_connections").upsert({
    organisation_id: input.organisationId, owner_user_id: input.ownerUserId, google_account_id: input.accountId,
    google_email: input.email, calendar_id: "primary", ...encrypted, updated_at: new Date().toISOString(),
  }, { onConflict: "organisation_id" });
  if (error) throw new Error("Google Calendar connection could not be saved.");
}

async function connectionFor(organisationId: string): Promise<ConnectionRow | null> {
  const { data, error } = await supabaseAdmin.from("google_calendar_connections")
    .select("organisation_id,owner_user_id,google_account_id,google_email,calendar_id,refresh_token_ciphertext,refresh_token_iv,refresh_token_tag")
    .eq("organisation_id", organisationId).maybeSingle();
  if (error) throw new Error("Google Calendar connection could not be checked.");
  return (data || null) as ConnectionRow | null;
}
function calendarClient(row: ConnectionRow) {
  const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID?.trim(), clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET?.trim(), redirect = process.env.GOOGLE_CALENDAR_REDIRECT_URI?.trim();
  if (!clientId) throw new CalendarCredentialSetupError("google_calendar_client_id_missing");
  if (!clientSecret) throw new CalendarCredentialSetupError("google_calendar_client_secret_missing");
  if (!redirect) throw new CalendarCredentialSetupError("google_calendar_redirect_uri_missing");
  const auth = new google.auth.OAuth2(clientId, clientSecret, redirect);
  auth.setCredentials({ refresh_token: decryptRefreshToken(row) });
  return google.calendar({ version: "v3", auth });
}
export async function getGoogleCalendarConnection(organisationId: string): Promise<CalendarConnectionSummary> {
  try { const row = await connectionFor(organisationId); return { connected: !!row, email: row?.google_email || null }; }
  catch { return { connected: false, email: null }; }
}
const INBOUND_DIAGNOSTIC_EVENT_ID = "1pmc3iet3dt32c86paqf25216a";
const INBOUND_DIAGNOSTIC_EXTERNAL_ORGANISER = "krystie.jacobs@pinnaclewellbeingservices.com";
const INBOUND_DIAGNOSTIC_START = Date.parse("2026-11-17T11:00:00.000Z");
const INBOUND_DIAGNOSTIC_END = Date.parse("2026-11-17T11:30:00.000Z");

function safeCalendarApiError(error: unknown) {
  const statusCode = providerStatus(error);
  const errorCode = statusCode === 401 ? "authentication_failed"
    : statusCode === 403 ? "permission_denied"
      : statusCode === 404 ? "calendar_not_found"
        : statusCode === 429 ? "rate_limited"
          : statusCode !== undefined && statusCode >= 500 ? "provider_unavailable"
            : statusCode !== undefined ? "provider_error" : "network_or_provider_error";
  return { statusCode: statusCode ?? null, errorCode };
}

function calendarDiagnosticProjectionReason(event: Record<string, unknown>) {
  if (event.status === "cancelled") return "cancelled" as const;
  if (typeof event.id !== "string" || !event.id) return "missing_id" as const;
  const start = event.start as { date?: unknown; dateTime?: unknown } | undefined;
  const end = event.end as { date?: unknown; dateTime?: unknown } | undefined;
  if (!start || !end || (!start.date && !start.dateTime) || (!end.date && !end.dateTime)) return "missing_time" as const;
  return null;
}

function diagnosticCandidate(event: Record<string, unknown>): CalendarDiagnosticEvent | null {
  const id = typeof event.id === "string" ? event.id : "";
  const start = event.start as { date?: unknown; dateTime?: unknown } | undefined;
  const end = event.end as { date?: unknown; dateTime?: unknown } | undefined;
  const startsAt = typeof start?.dateTime === "string" ? start.dateTime : typeof start?.date === "string" ? start.date : null;
  const endsAt = typeof end?.dateTime === "string" ? end.dateTime : typeof end?.date === "string" ? end.date : null;
  const organiser = event.organizer as { email?: unknown } | undefined;
  const organizerEmail = typeof organiser?.email === "string" ? organiser.email.toLowerCase() : null;
  const sameExternalBooking = organizerEmail === INBOUND_DIAGNOSTIC_EXTERNAL_ORGANISER
    && Date.parse(startsAt || "") === INBOUND_DIAGNOSTIC_START
    && Date.parse(endsAt || "") === INBOUND_DIAGNOSTIC_END;
  if (!id || (id !== INBOUND_DIAGNOSTIC_EVENT_ID && !sameExternalBooking)) return null;
  const projectionReason = calendarDiagnosticProjectionReason(event);
  const safeId = /^[a-z0-9_-]{1,256}$/i.test(id) ? id : "unavailable";
  return {
    id: safeId, organizerEmail, status: typeof event.status === "string" ? event.status : null,
    startsAt, endsAt, projected: projectionReason === null, projectionReason,
  };
}

export async function readGoogleCalendar(organisationId: string, from: string, to: string, options: { includeDiagnostic?: boolean } = {}): Promise<CalendarReadResult> {
  const includeDiagnostic = options.includeDiagnostic === true && organisationId === DIARY_CALENDAR_DIAGNOSTIC_ORGANISATION_ID;
  const range = googleCalendarRange(from, to);
  const emptyDiagnostic = (request: CalendarReadDiagnostic["request"], accountEmail: string | null = null, calendarId: string | null = null, targetEvents: CalendarDiagnosticEvent[] = []): CalendarReadDiagnostic => ({ accountEmail, calendarId, request, targetEvents });
  let row: ConnectionRow | null;
  try { row = await connectionFor(organisationId); } catch {
    const diagnostic = includeDiagnostic ? emptyDiagnostic({ outcome: "failed", stage: "connection_lookup", statusCode: null, errorCode: "connection_unavailable", eventsReturnedCount: 0, ...range }) : undefined;
    return { connection: { connected: false, email: null }, events: [], unavailable: true, ...(diagnostic ? { diagnostic } : {}) };
  }
  if (!row) {
    const diagnostic = includeDiagnostic ? emptyDiagnostic({ outcome: "not_connected", stage: "connection_lookup", statusCode: null, errorCode: "no_connection", eventsReturnedCount: 0, ...range }) : undefined;
    return { connection: { connected: false, email: null }, events: [], unavailable: false, ...(diagnostic ? { diagnostic } : {}) };
  }
  let calendar: ReturnType<typeof google.calendar>;
  try { calendar = calendarClient(row); } catch (error) {
    const safeCode = error instanceof CalendarCredentialSetupError ? error.safeCode : "credential_setup_failed";
    const diagnostic = includeDiagnostic ? emptyDiagnostic({ outcome: "failed", stage: "credential_setup", statusCode: null, errorCode: safeCode, eventsReturnedCount: 0, ...range }, row.google_email, row.calendar_id) : undefined;
    return { connection: { connected: true, email: row.google_email }, events: [], unavailable: true, ...(diagnostic ? { diagnostic } : {}) };
  }
  try {
    const events: GoogleCalendarAppointment[] = [];
    const targetEvents: CalendarDiagnosticEvent[] = [];
    let eventsReturnedCount = 0;
    let pageToken: string | undefined;
    do {
      const response = await calendar.events.list({ calendarId: row.calendar_id, ...range, singleEvents: true, orderBy: "startTime", maxResults: 250, pageToken });
      const items = response.data.items || [];
      eventsReturnedCount += items.length;
      for (const event of items) {
        const raw = event as Record<string, unknown>, candidate = includeDiagnostic ? diagnosticCandidate(raw) : null;
        const projected = projectGoogleEvent(raw, row.calendar_id);
        if (candidate) targetEvents.push({ ...candidate, projected: !!projected, projectionReason: projected ? null : candidate.projectionReason || "missing_time" });
        if (projected) events.push(projected);
      }
      pageToken = response.data.nextPageToken || undefined;
    } while (pageToken && events.length < 1000);
    const diagnostic = includeDiagnostic ? emptyDiagnostic({ outcome: "success", stage: "events.list", statusCode: 200, errorCode: null, eventsReturnedCount, ...range }, row.google_email, row.calendar_id, targetEvents) : undefined;
    return { connection: { connected: true, email: row.google_email }, events, unavailable: false, ...(diagnostic ? { diagnostic } : {}) };
  } catch (error) {
    const safeError = safeCalendarApiError(error);
    const diagnostic = includeDiagnostic ? emptyDiagnostic({ outcome: "failed", stage: "events.list", ...safeError, eventsReturnedCount: 0, ...range }, row.google_email, row.calendar_id) : undefined;
    return { connection: { connected: true, email: row.google_email }, events: [], unavailable: true, ...(diagnostic ? { diagnostic } : {}) };
  }
}
function ownsEvent(event: { id?: string | null; extendedProperties?: { private?: Record<string, string> | null } | null }, row: RootMirrorRow) {
  const privateProps = event.extendedProperties?.private;
  return !!event.id && privateProps?.rootManaged === "true" && privateProps.rootOrganisationId === row.organisation_id && privateProps.rootAppointmentId === row.id;
}
function providerStatus(error: unknown): number | undefined {
  const value = error as { code?: unknown; response?: { status?: unknown } } | null;
  const status = Number(value?.code ?? value?.response?.status);
  return Number.isFinite(status) ? status : undefined;
}
async function saveMirror(organisationId: string, appointmentId: string, fields: Record<string, unknown>) {
  const { data, error } = await supabaseAdmin.from("appointments").update(fields).eq("organisation_id", organisationId).eq("id", appointmentId).select("id").maybeSingle();
  if (error || data?.id !== appointmentId) throw new Error("Google Calendar sync state could not be saved.");
}
async function ensureMeetRequestId(organisationId: string, row: RootMirrorRow): Promise<string> {
  if (row.google_meet_request_id) return row.google_meet_request_id;
  const requestId = randomUUID();
  const { data, error } = await supabaseAdmin.from("appointments").update({ google_meet_request_id: requestId })
    .eq("organisation_id", organisationId).eq("id", row.id).is("google_meet_request_id", null)
    .select("google_meet_request_id").maybeSingle();
  if (error) throw new Error("Google Meet request could not be safely prepared.");
  if (data?.google_meet_request_id) return String(data.google_meet_request_id);
  const current = await supabaseAdmin.from("appointments").select("google_meet_request_id")
    .eq("organisation_id", organisationId).eq("id", row.id).maybeSingle();
  if (current.error || typeof current.data?.google_meet_request_id !== "string") throw new Error("Google Meet request could not be safely prepared.");
  return current.data.google_meet_request_id;
}
function conferenceData(event: { conferenceData?: { createRequest?: { requestId?: string | null; status?: { statusCode?: string | null } | null } | null; entryPoints?: Array<{ entryPointType?: string | null; uri?: string | null }> | null; conferenceSolution?: { key?: { type?: string | null } | null } | null } | null }) {
  return event.conferenceData || null;
}
function confirmedMeetUrl(event: { hangoutLink?: string | null; conferenceData?: { createRequest?: { status?: { statusCode?: string | null } | null } | null; entryPoints?: Array<{ entryPointType?: string | null; uri?: string | null }> | null; conferenceSolution?: { key?: { type?: string | null } | null } | null } | null }) {
  const data = conferenceData(event), status = data?.createRequest?.status?.statusCode;
  // Google creates conference data asynchronously. A link-shaped field or
  // solution marker is not confirmation while this request is still pending.
  if (data?.createRequest ? status !== "success" : data?.conferenceSolution?.key?.type !== "hangoutsMeet") return null;
  const candidate = event.hangoutLink || data?.entryPoints?.find(point => point.entryPointType === "video")?.uri || null;
  if (!candidate) return null;
  try { const url = new URL(candidate); return url.protocol === "https:" && url.hostname === "meet.google.com" ? url.toString().slice(0, 2048) : null; }
  catch { return null; }
}
function eventAttendeeEmails(event: { attendees?: Array<{ email?: string | null }> | null }) {
  return [...new Set((event.attendees || []).map(item => item.email?.trim().toLowerCase()).filter((email): email is string => !!email))].sort();
}
type RootCalendarEvent = { id?: string | null; summary?: string | null; location?: string | null; description?: string | null; start?: { date?: string | null; dateTime?: string | null; timeZone?: string | null } | null; end?: { date?: string | null; dateTime?: string | null; timeZone?: string | null } | null; attendees?: Array<{ email?: string | null }> | null; hangoutLink?: string | null; conferenceData?: { createRequest?: { requestId?: string | null; status?: { statusCode?: string | null } | null } | null; entryPoints?: Array<{ entryPointType?: string | null; uri?: string | null }> | null; conferenceSolution?: { key?: { type?: string | null } | null } | null } | null };
function rootEventMatches(event: RootCalendarEvent, row: RootMirrorRow) {
  const includeAttendee = !row.google_meet_enabled || !!row.google_meet_url || !!confirmedMeetUrl(event);
  const body = rootGoogleEventBody(row, "event", { includeAttendees: true, attendeeEmail: includeAttendee ? row.google_calendar_attendee_email : null }) as {
    summary: string; location?: string; description?: string;
    start: { date?: string | null; dateTime?: string | null; timeZone?: string };
    end: { date?: string | null; dateTime?: string | null; timeZone?: string };
  };
  const expectedStartTimeZone = "timeZone" in body.start ? body.start.timeZone : undefined;
  const expectedEndTimeZone = "timeZone" in body.end ? body.end.timeZone : undefined;
  const sameDateTime = (actual: string | null | undefined, expected: string | null | undefined) => actual === expected || (!!actual && !!expected && Number.isFinite(Date.parse(actual)) && Date.parse(actual) === Date.parse(expected));
  const baseMatches = event.summary === body.summary && (event.location || undefined) === body.location && (event.description || undefined) === body.description &&
    (row.all_day ? event.start?.date === body.start.date && event.end?.date === body.end.date : sameDateTime(event.start?.dateTime, body.start.dateTime) && sameDateTime(event.end?.dateTime, body.end.dateTime) && event.start?.timeZone === expectedStartTimeZone && event.end?.timeZone === expectedEndTimeZone);
  const actualAttendees = eventAttendeeEmails(event);
  const expectedAttendees = includeAttendee && row.google_calendar_attendee_email ? [row.google_calendar_attendee_email.trim().toLowerCase()] : [];
  if (!baseMatches || JSON.stringify(actualAttendees) !== JSON.stringify(expectedAttendees)) return false;
  if (row.google_meet_enabled) {
    const confirmed = confirmedMeetUrl(event);
    if (row.google_meet_url) return confirmed === row.google_meet_url;
    const requestId = conferenceData(event)?.createRequest?.requestId;
    return !!row.google_meet_request_id && requestId === row.google_meet_request_id;
  }
  return !confirmedMeetUrl(event) && !conferenceData(event)?.createRequest;
}
export type RootMirrorSyncResult = { googleMeetUrl: string | null; googleMeetPending: boolean };
type WritableCalendarEvent = {
  id?: string | null; summary?: string | null; location?: string | null; description?: string | null;
  start?: { date?: string | null; dateTime?: string | null; timeZone?: string | null } | null;
  end?: { date?: string | null; dateTime?: string | null; timeZone?: string | null } | null;
  attendees?: Array<{ email?: string | null }> | null; hangoutLink?: string | null;
  etag?: string | null; extendedProperties?: { private?: Record<string, string> | null } | null;
  conferenceData?: { createRequest?: { requestId?: string | null; status?: { statusCode?: string | null } | null } | null;
    entryPoints?: Array<{ entryPointType?: string | null; uri?: string | null }> | null;
    conferenceSolution?: { key?: { type?: string | null } | null } | null } | null;
};
function updateOptions(etag: string | null | undefined) { return etag ? { headers: { "If-Match": etag } } : undefined; }
function notificationMode(current: WritableCalendarEvent, attendeeEmail: string | null) {
  return attendeeEmail || eventAttendeeEmails(current).length ? "all" as const : "none" as const;
}
function existingMeetStillMatches(current: WritableCalendarEvent, row: RootMirrorRow) {
  if (!row.google_meet_enabled) return true;
  const requestId = conferenceData(current)?.createRequest?.requestId;
  return !!row.google_meet_request_id && requestId === row.google_meet_request_id &&
    (!row.google_meet_url || confirmedMeetUrl(current) === row.google_meet_url);
}
function existingAttendeeIsExpected(current: WritableCalendarEvent, attendeeEmail: string | null) {
  const emails = eventAttendeeEmails(current);
  const expected = attendeeEmail ? [attendeeEmail] : [];
  return JSON.stringify(emails) === JSON.stringify(expected) || emails.length === 0 || (!!attendeeEmail && emails.length === 1);
}
async function patchRootEvent(calendar: ReturnType<typeof calendarClient>, calendarId: string, eventId: string, current: WritableCalendarEvent, row: RootMirrorRow, attendeeEmail: string | null, requestBody: Record<string, unknown>, sendUpdates: "all" | "none") {
  const startingAttendees = JSON.stringify(eventAttendeeEmails(current));
  try {
    const response = await calendar.events.patch({ calendarId, eventId, requestBody, sendUpdates }, updateOptions(current.etag));
    return response.data as WritableCalendarEvent;
  } catch (error) {
    if (providerStatus(error) !== 412) throw error;
    // The event changed between GET and PATCH. Re-read this exact deterministic
    // event and retry once only if its Root ownership, attendee and Meet are intact.
    const latest = (await calendar.events.get({ calendarId, eventId })).data as WritableCalendarEvent;
    if (latest.id !== eventId || !ownsEvent(latest, row) || !existingMeetStillMatches(latest, row) ||
      JSON.stringify(eventAttendeeEmails(latest)) !== startingAttendees || !existingAttendeeIsExpected(latest, attendeeEmail)) {
      throw new Error("The Google event changed while syncing. Review the Root-owned event before retrying.");
    }
    const response = await calendar.events.patch({ calendarId, eventId, requestBody, sendUpdates }, updateOptions(latest.etag));
    return response.data as WritableCalendarEvent;
  }
}

export async function syncRootAppointment(organisationId: string, input: RootMirrorRow): Promise<RootMirrorSyncResult> {
  if (input.organisation_id !== organisationId || input.status === "cancelled") throw new Error("This appointment cannot be synced.");
  const row: RootMirrorRow = { ...input };
  await saveMirror(organisationId, row.id, { google_calendar_sync_enabled: true, google_calendar_sync_pending: true });
  const connection = await connectionFor(organisationId);
  if (!connection) throw new Error("Connect Google Calendar before syncing this appointment.");
  const calendar = calendarClient(connection), calendarId = row.google_calendar_id || connection.calendar_id;
  if (calendarId !== connection.calendar_id) throw new Error("The linked Google Calendar changed. Review the connection before syncing.");
  if (row.google_meet_enabled) row.google_meet_request_id = await ensureMeetRequestId(organisationId, row);
  const eventId = row.google_calendar_event_id || googleEventId(organisationId, row.id);
  let current: WritableCalendarEvent | null = null;
  if (!row.google_calendar_event_id) {
    const options = { attendeeEmail: row.google_meet_enabled ? null : row.google_calendar_attendee_email, includeAttendees: !row.google_meet_enabled && !!row.google_calendar_attendee_email, conferenceRequestId: row.google_meet_enabled ? row.google_meet_request_id : null };
    try {
      const response = await calendar.events.insert({ calendarId, requestBody: rootGoogleEventBody(row, eventId, options), sendUpdates: options.includeAttendees ? "all" : "none", ...(row.google_meet_enabled ? { conferenceDataVersion: 1 } : {}) });
      if (!response.data.id) throw new Error("Google did not return an event identity.");
      current = response.data as WritableCalendarEvent;
      await saveMirror(organisationId, row.id, { google_calendar_sync_enabled: true, google_calendar_id: calendarId, google_calendar_event_id: eventId, google_calendar_etag: current.etag || null, google_calendar_synced_at: new Date().toISOString(), google_calendar_sync_pending: true });
    } catch (error) {
      // Deterministic event identity and the persisted conference request id
      // make retries reconcile the same event and conference request.
      if (providerStatus(error) !== 409) throw new Error("Google Calendar could not create the mirror. Root appointment remains saved; retry is safe.");
      const existing = await calendar.events.get({ calendarId, eventId });
      current = existing.data as WritableCalendarEvent;
    }
  } else {
    const response = await calendar.events.get({ calendarId, eventId });
    current = response.data as WritableCalendarEvent;
  }
  if (!current || current.id !== eventId || !ownsEvent(current, row)) throw new Error("The linked Google event is not verifiably owned by this Root appointment.");
  // The stored ETag can lag Google even when the user is intentionally
  // rescheduling this Root-owned event. Use the freshly fetched ETag below;
  // ownership and the existing Meet/attendee identities remain hard checks.

  let currentConference = conferenceData(current);
  let meetUrl = confirmedMeetUrl(current);
  if (row.google_meet_enabled) {
    const conferenceRequest = currentConference?.createRequest;
    if (conferenceRequest?.status?.statusCode === "failure") {
      await saveMirror(organisationId, row.id, { google_calendar_id: calendarId, google_calendar_event_id: eventId, google_calendar_etag: current.etag || null, google_calendar_sync_pending: true });
      throw new Error("Google Meet could not be created. Turn Meet off and on only if you want to request a new conference.");
    }
    if (conferenceRequest && conferenceRequest.requestId !== row.google_meet_request_id && !meetUrl) throw new Error("A different Google Meet request is attached to this event. Review it before retrying.");
    if (row.google_meet_url && meetUrl !== row.google_meet_url) throw new Error("The Google Meet conference changed outside Root. Review it in Google Calendar before retrying.");
    if (!meetUrl && conferenceRequest?.status?.statusCode === "pending") {
      await saveMirror(organisationId, row.id, { google_calendar_id: calendarId, google_calendar_event_id: eventId, google_calendar_etag: current.etag || null, google_calendar_sync_pending: true });
      return { googleMeetUrl: null, googleMeetPending: true };
    }
    if (!meetUrl && row.google_meet_url) throw new Error("The previously confirmed Google Meet link is missing from its event. No replacement conference was created.");
    if (!meetUrl && !currentConference) {
      const requestId = row.google_meet_request_id!;
      const requestBody = rootGoogleEventBody(row, eventId, { includeAttendees: false, conferenceRequestId: requestId });
      const response = await calendar.events.update({ calendarId, eventId, requestBody, conferenceDataVersion: 1, sendUpdates: "none" }, updateOptions(current.etag));
      current = response.data as WritableCalendarEvent;
      currentConference = conferenceData(current);
      meetUrl = confirmedMeetUrl(current);
      await saveMirror(organisationId, row.id, { google_calendar_id: calendarId, google_calendar_event_id: eventId, google_calendar_etag: current.etag || null, google_calendar_sync_pending: true, ...(meetUrl ? { google_meet_url: meetUrl } : {}) });
      if (!meetUrl) {
        if (currentConference?.createRequest?.status?.statusCode === "failure") throw new Error("Google Meet could not be created. Turn Meet off and on only if you want to request a new conference.");
        return { googleMeetUrl: null, googleMeetPending: true };
      }
      row.google_meet_url = meetUrl;
    }
    if (!meetUrl) throw new Error("Google has not confirmed the Meet link yet. Retry Calendar sync shortly.");
    row.google_meet_url = meetUrl;
  }

  const currentHasConference = !!currentConference || !!current.hangoutLink;
  const wantsConference = row.google_meet_enabled === true;
  const attendeeEmail = row.google_calendar_attendee_email?.trim().toLowerCase() || null;
  const body = rootGoogleEventBody(row, eventId, {
    includeAttendees: true,
    attendeeEmail: attendeeEmail && (!wantsConference || !!meetUrl) ? attendeeEmail : null,
    ...(!wantsConference && currentHasConference ? { clearConference: true } : {}),
  });
  const changed = !rootEventMatches(current, row);
  if (changed) {
    if (wantsConference && !existingMeetStillMatches(current, row)) throw new Error("The Google Meet conference changed outside Root. Review it in Google Calendar before retrying.");
    if (wantsConference && !existingAttendeeIsExpected(current, attendeeEmail)) throw new Error("The Google event attendee changed outside Root. Review it in Google Calendar before retrying.");
    if (wantsConference || !currentHasConference) {
      const patchBody = { ...body };
      delete patchBody.id;
      delete patchBody.conferenceData;
      current = await patchRootEvent(calendar, calendarId, eventId, current, row, attendeeEmail, patchBody, notificationMode(current, attendeeEmail));
    } else {
      const response = await calendar.events.update({ calendarId, eventId, requestBody: body, sendUpdates: notificationMode(current, attendeeEmail), conferenceDataVersion: 1 }, updateOptions(current.etag));
      current = response.data as WritableCalendarEvent;
    }
    if (!ownsEvent(current, row)) throw new Error("Google did not preserve the Root event ownership marker.");
    if (!rootEventMatches(current, row)) throw new Error("Google did not confirm the requested Root appointment update.");
    meetUrl = wantsConference ? confirmedMeetUrl(current) : null;
    if (wantsConference && !meetUrl) {
      await saveMirror(organisationId, row.id, { google_calendar_id: calendarId, google_calendar_event_id: eventId, google_calendar_etag: current.etag || null, google_calendar_sync_pending: true });
      return { googleMeetUrl: null, googleMeetPending: true };
    }
  }
  if (!wantsConference) { row.google_meet_url = null; row.google_meet_request_id = null; }
  await saveMirror(organisationId, row.id, {
    google_calendar_sync_enabled: true,
    google_calendar_id: calendarId,
    google_calendar_event_id: eventId,
    google_calendar_etag: current.etag || null,
    google_calendar_synced_at: new Date().toISOString(),
    google_calendar_sync_pending: false,
    google_meet_url: wantsConference ? meetUrl : null,
    google_meet_request_id: wantsConference ? row.google_meet_request_id : null,
  });
  return { googleMeetUrl: wantsConference ? meetUrl : null, googleMeetPending: false };
}
export async function cancelRootMirror(organisationId: string, row: RootMirrorRow) {
  if (row.organisation_id !== organisationId) throw new Error("Appointment belongs to another organisation.");
  const hasStoredIdentity = !!row.google_calendar_event_id && !!row.google_calendar_id;
  const uncertainCreate = !hasStoredIdentity && (row.google_calendar_sync_enabled === true || row.google_calendar_sync_pending === true);
  if (!hasStoredIdentity && !uncertainCreate) {
    await saveMirror(organisationId, row.id, { google_calendar_sync_pending: false });
    return;
  }
  const connection = await connectionFor(organisationId);
  const calendarId = row.google_calendar_id || connection?.calendar_id;
  if (!connection || !calendarId || connection.calendar_id !== calendarId) throw new Error("The linked Google Calendar is unavailable; Root cancellation was saved, but its mirror was left unchanged.");
  const eventId = row.google_calendar_event_id || googleEventId(organisationId, row.id);
  const calendar = calendarClient(connection);
  let current;
  try { current = await calendar.events.get({ calendarId, eventId }); }
  catch (error) {
    if (providerStatus(error) === 404) { await saveMirror(organisationId, row.id, { google_calendar_sync_pending: false }); return; }
    throw new Error("The linked Google event could not be checked safely; Root cancellation was saved and mirror cleanup remains pending.");
  }
  if (current.data.id !== eventId || !ownsEvent(current.data, row)) throw new Error("The linked Google event is not verifiably owned by this Root appointment; it was not deleted.");
  if (row.google_calendar_etag && current.data.etag !== row.google_calendar_etag) throw new Error("The Google event changed outside Root; Root cancellation was saved and the external event was left unchanged.");
  const sendUpdates = row.google_calendar_attendee_email || eventAttendeeEmails(current.data as WritableCalendarEvent).length ? "all" : "none";
  await calendar.events.delete({ calendarId, eventId, sendUpdates }, current.data.etag ? { headers: { "If-Match": current.data.etag } } : undefined);
  await saveMirror(organisationId, row.id, { google_calendar_sync_enabled: true, google_calendar_id: calendarId, google_calendar_event_id: eventId, google_calendar_etag: current.data.etag || null, google_calendar_synced_at: new Date().toISOString(), google_calendar_sync_pending: false });
}
