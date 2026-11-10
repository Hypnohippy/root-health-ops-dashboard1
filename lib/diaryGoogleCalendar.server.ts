import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { google } from "googleapis";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { googleEventId, googleCalendarRange, projectGoogleEvent, rootGoogleEventBody, type GoogleCalendarAppointment } from "@/lib/diaryGoogleCalendar";

type ConnectionRow = { organisation_id: string; owner_user_id: string; google_account_id: string; google_email: string | null; calendar_id: string; refresh_token_ciphertext: string; refresh_token_iv: string; refresh_token_tag: string };
export type CalendarConnectionSummary = { connected: boolean; email: string | null };
export type CalendarReadResult = { connection: CalendarConnectionSummary; events: GoogleCalendarAppointment[]; unavailable: boolean };
export type RootMirrorRow = {
  id: string; organisation_id: string; title: string; starts_at: string | null; ends_at: string | null;
  start_date: string | null; end_date: string | null; timezone: string; all_day: boolean; location: string | null;
  meeting_url: string | null; notes: string | null; status: string; google_calendar_sync_enabled?: boolean;
  google_calendar_id?: string | null; google_calendar_event_id?: string | null; google_calendar_etag?: string | null;
};

function encryptionKey() {
  const raw = process.env.GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY || "";
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("Google Calendar token encryption is not configured.");
  return key;
}
function encryptRefreshToken(token: string, organisationId: string) {
  const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  cipher.setAAD(Buffer.from(`root-health-google-calendar:v1:${organisationId}`));
  const ciphertext = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return { refresh_token_ciphertext: ciphertext.toString("base64"), refresh_token_iv: iv.toString("base64"), refresh_token_tag: cipher.getAuthTag().toString("base64") };
}
function decryptRefreshToken(row: ConnectionRow) {
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(row.refresh_token_iv, "base64"));
  decipher.setAAD(Buffer.from(`root-health-google-calendar:v1:${row.organisation_id}`));
  decipher.setAuthTag(Buffer.from(row.refresh_token_tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(row.refresh_token_ciphertext, "base64")), decipher.final()]).toString("utf8");
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
  if (!clientId || !clientSecret || !redirect) throw new Error("Google Calendar is not configured.");
  const auth = new google.auth.OAuth2(clientId, clientSecret, redirect);
  auth.setCredentials({ refresh_token: decryptRefreshToken(row) });
  return google.calendar({ version: "v3", auth });
}
export async function getGoogleCalendarConnection(organisationId: string): Promise<CalendarConnectionSummary> {
  try { const row = await connectionFor(organisationId); return { connected: !!row, email: row?.google_email || null }; }
  catch { return { connected: false, email: null }; }
}
export async function readGoogleCalendar(organisationId: string, from: string, to: string): Promise<CalendarReadResult> {
  let row: ConnectionRow | null;
  try { row = await connectionFor(organisationId); } catch { return { connection: { connected: false, email: null }, events: [], unavailable: true }; }
  if (!row) return { connection: { connected: false, email: null }, events: [], unavailable: false };
  try {
    const calendar = calendarClient(row), range = googleCalendarRange(from, to);
    const events: GoogleCalendarAppointment[] = [];
    let pageToken: string | undefined;
    do {
      const response = await calendar.events.list({ calendarId: row.calendar_id, ...range, singleEvents: true, orderBy: "startTime", maxResults: 250, pageToken });
      for (const event of response.data.items || []) { const projected = projectGoogleEvent(event as Record<string, unknown>, row.calendar_id); if (projected) events.push(projected); }
      pageToken = response.data.nextPageToken || undefined;
    } while (pageToken && events.length < 1000);
    return { connection: { connected: true, email: row.google_email }, events, unavailable: false };
  } catch { return { connection: { connected: true, email: row.google_email }, events: [], unavailable: true }; }
}
function ownsEvent(event: { id?: string | null; extendedProperties?: { private?: Record<string, string> | null } | null }, row: RootMirrorRow) {
  const privateProps = event.extendedProperties?.private;
  return !!event.id && privateProps?.rootManaged === "true" && privateProps.rootOrganisationId === row.organisation_id && privateProps.rootAppointmentId === row.id;
}
async function saveMirror(organisationId: string, appointmentId: string, fields: Record<string, unknown>) {
  const { data, error } = await supabaseAdmin.from("appointments").update(fields).eq("organisation_id", organisationId).eq("id", appointmentId).select("id").maybeSingle();
  if (error || data?.id !== appointmentId) throw new Error("Google Calendar sync state could not be saved.");
}
function rootEventMatches(event: { summary?: string | null; location?: string | null; description?: string | null; start?: { date?: string | null; dateTime?: string | null } | null; end?: { date?: string | null; dateTime?: string | null } | null }, row: RootMirrorRow) {
  const body = rootGoogleEventBody(row, "event");
  const sameDateTime = (actual: string | null | undefined, expected: string | null | undefined) => actual === expected || (!!actual && !!expected && Number.isFinite(Date.parse(actual)) && Date.parse(actual) === Date.parse(expected));
  return event.summary === body.summary && (event.location || undefined) === body.location && (event.description || undefined) === body.description &&
    (row.all_day ? event.start?.date === body.start.date && event.end?.date === body.end.date : sameDateTime(event.start?.dateTime, body.start.dateTime) && sameDateTime(event.end?.dateTime, body.end.dateTime));
}
export async function syncRootAppointment(organisationId: string, row: RootMirrorRow) {
  if (row.organisation_id !== organisationId || row.status === "cancelled") throw new Error("This appointment cannot be synced.");
  await saveMirror(organisationId, row.id, { google_calendar_sync_enabled: true, google_calendar_sync_pending: true });
  const connection = await connectionFor(organisationId);
  if (!connection) throw new Error("Connect Google Calendar before syncing this appointment.");
  const calendar = calendarClient(connection), calendarId = row.google_calendar_id || connection.calendar_id;
  if (calendarId !== connection.calendar_id) throw new Error("The linked Google Calendar changed. Review the connection before syncing.");
  const eventId = row.google_calendar_event_id || googleEventId(organisationId, row.id);
  const body = rootGoogleEventBody(row, eventId);
  if (!row.google_calendar_event_id) {
    try {
      const response = await calendar.events.insert({ calendarId, requestBody: body, sendUpdates: "none" });
      if (!response.data.id) throw new Error("Google did not return an event identity.");
      await saveMirror(organisationId, row.id, { google_calendar_sync_enabled: true, google_calendar_id: calendarId, google_calendar_event_id: response.data.id, google_calendar_etag: response.data.etag || null, google_calendar_synced_at: new Date().toISOString(), google_calendar_sync_pending: false });
      return;
    } catch (error) {
      // If Google accepted the insert but the response was lost, the exact
      // deterministic ID lets us safely recover the same event on retry.
      const status = (error as { code?: number }).code;
      if (status !== 409) throw new Error("Google Calendar could not create the mirror. Root appointment remains saved; retry is safe.");
      const existing = await calendar.events.get({ calendarId, eventId });
      if (!ownsEvent(existing.data, row)) throw new Error("The reserved Google event ID is not owned by this Root appointment.");
      await saveMirror(organisationId, row.id, { google_calendar_sync_enabled: true, google_calendar_id: calendarId, google_calendar_event_id: eventId, google_calendar_etag: existing.data.etag || null, google_calendar_synced_at: new Date().toISOString(), google_calendar_sync_pending: false });
      return;
    }
  }
  const current = await calendar.events.get({ calendarId, eventId });
  if (!ownsEvent(current.data, row)) throw new Error("The linked Google event is not verifiably owned by this Root appointment.");
  if (row.google_calendar_etag && current.data.etag !== row.google_calendar_etag) {
    if (rootEventMatches(current.data, row)) {
      await saveMirror(organisationId, row.id, { google_calendar_sync_pending: false, google_calendar_etag: current.data.etag || null, google_calendar_synced_at: new Date().toISOString() });
      return;
    }
    throw new Error("The Google event changed outside Root. Review it in Google Calendar before retrying.");
  }
  const response = await calendar.events.update({ calendarId, eventId, requestBody: body, sendUpdates: "none" }, current.data.etag ? { headers: { "If-Match": current.data.etag } } : undefined);
  await saveMirror(organisationId, row.id, { google_calendar_sync_enabled: true, google_calendar_etag: response.data.etag || null, google_calendar_synced_at: new Date().toISOString(), google_calendar_sync_pending: false });
}
export async function cancelRootMirror(organisationId: string, row: RootMirrorRow) {
  if (row.organisation_id !== organisationId) throw new Error("Appointment belongs to another organisation.");
  if (!row.google_calendar_event_id || !row.google_calendar_id) {
    await saveMirror(organisationId, row.id, { google_calendar_sync_pending: false });
    return;
  }
  const connection = await connectionFor(organisationId);
  if (!connection || connection.calendar_id !== row.google_calendar_id) throw new Error("The linked Google Calendar is unavailable; Root cancellation was saved, but its mirror was left unchanged.");
  const calendar = calendarClient(connection), current = await calendar.events.get({ calendarId: row.google_calendar_id, eventId: row.google_calendar_event_id });
  if (!ownsEvent(current.data, row)) throw new Error("The linked Google event is not verifiably owned by this Root appointment; it was not deleted.");
  if (row.google_calendar_etag && current.data.etag !== row.google_calendar_etag) throw new Error("The Google event changed outside Root; Root cancellation was saved and the external event was left unchanged.");
  await calendar.events.delete({ calendarId: row.google_calendar_id, eventId: row.google_calendar_event_id, sendUpdates: "none" }, current.data.etag ? { headers: { "If-Match": current.data.etag } } : undefined);
  await saveMirror(organisationId, row.id, { google_calendar_synced_at: new Date().toISOString(), google_calendar_sync_pending: false });
}
