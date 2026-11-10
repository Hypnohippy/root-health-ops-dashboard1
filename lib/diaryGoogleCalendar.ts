import { createHash } from "node:crypto";
import { addDateDays, localDateTimeToIso } from "@/lib/diaryAppointments";

export type GoogleCalendarAppointment = {
  id: string; calendarId: string; title: string; startsAt: string | null; endsAt: string | null;
  startDate: string | null; endDate: string | null; timezone: string; allDay: boolean;
  location: string | null; meetingUrl: string | null; source: "google_calendar";
};

export function googleCalendarRange(from: string, to: string) {
  // `to` is exclusive. Resolve local midnights independently so BST/GMT
  // transitions produce the correct variable-length UTC range.
  return {
    timeMin: localDateTimeToIso(from, "00:00", "Europe/London"),
    timeMax: localDateTimeToIso(to, "00:00", "Europe/London"),
  };
}

export function defaultCalendarRange(today: string) {
  return { from: today, to: addDateDays(today, 1) };
}

export function googleEventId(organisationId: string, appointmentId: string) {
  // Google's event ID alphabet permits lowercase hex; deterministic IDs make
  // retry after a lost response idempotent without fuzzy title/time matching.
  return `root${createHash("sha256").update(`${organisationId}:${appointmentId}`).digest("hex")}`;
}

export function projectGoogleEvent(event: Record<string, unknown>, calendarId = "primary"): GoogleCalendarAppointment | null {
  if (event.status === "cancelled" || typeof event.id !== "string" || !event.id) return null;
  const start = event.start as { date?: string; dateTime?: string; timeZone?: string } | undefined;
  const end = event.end as { date?: string; dateTime?: string; timeZone?: string } | undefined;
  if (!start || !end || (!start.date && !start.dateTime) || (!end.date && !end.dateTime)) return null;
  const allDay = !!start.date;
  const conference = event.conferenceData as { entryPoints?: Array<{ entryPointType?: string; uri?: string }> } | undefined;
  const candidateUrl = typeof event.hangoutLink === "string" ? event.hangoutLink : conference?.entryPoints?.find(point => point.entryPointType === "video")?.uri || null;
  let meetingUrl: string | null = null;
  if (candidateUrl) { try { const url = new URL(candidateUrl); if (["http:", "https:"].includes(url.protocol)) meetingUrl = url.toString().slice(0, 2048); } catch { /* ignore malformed provider links */ } }
  let timezone = allDay ? "Europe/London" : start.timeZone || end.timeZone || "Europe/London";
  try { new Intl.DateTimeFormat("en-GB", { timeZone: timezone }); } catch { timezone = "Europe/London"; }
  return {
    id: event.id, calendarId, title: typeof event.summary === "string" && event.summary.trim() ? event.summary.trim() : "(No title)",
    startsAt: allDay ? null : start.dateTime || null, endsAt: allDay ? null : end.dateTime || null,
    startDate: allDay ? start.date || null : null, endDate: allDay ? end.date || null : null,
    timezone, allDay,
    location: typeof event.location === "string" ? event.location.slice(0, 500) : null, meetingUrl, source: "google_calendar",
  };
}

export function rootGoogleEventBody(row: {
  id: string; organisation_id: string; title: string; starts_at: string | null; ends_at: string | null;
  start_date: string | null; end_date: string | null; timezone: string; all_day: boolean;
  location: string | null; meeting_url: string | null; notes: string | null;
}, eventId: string) {
  return {
    id: eventId,
    summary: row.title,
    description: [row.notes, row.meeting_url ? `Meeting link: ${row.meeting_url}` : null].filter(Boolean).join("\n\n") || undefined,
    location: row.location || undefined,
    start: row.all_day ? { date: row.start_date } : { dateTime: row.starts_at, timeZone: row.timezone },
    end: row.all_day ? { date: row.end_date } : { dateTime: row.ends_at, timeZone: row.timezone },
    extendedProperties: { private: { rootManaged: "true", rootOrganisationId: row.organisation_id, rootAppointmentId: row.id } },
    // meeting_url is shown in Root and is intentionally not converted to a
    // Google Meet or attendee invitation.
  };
}
