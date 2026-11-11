export type AppointmentStatus = "tentative" | "confirmed" | "completed" | "cancelled";
export type AppointmentValues = {
  relationshipId: string | null;
  title: string;
  startsAt: string | null;
  endsAt: string | null;
  startDate: string | null;
  endDate: string | null;
  timezone: string;
  allDay: boolean;
  location: string | null;
  meetingUrl: string | null;
  notes: string | null;
  googleMeetEnabled: boolean;
  googleCalendarAttendeeEmail: string | null;
  status: Exclude<AppointmentStatus, "cancelled">;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const nullableText = (value: unknown, max: number, label: string): string | null => {
  if (value == null || value === "") return null;
  if (typeof value !== "string" || value.trim().length > max) throw new Error(`${label} is too long.`);
  return value.trim() || null;
};

export function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !DATE.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function addDateDays(value: string, amount: number): string {
  const date = new Date(`${value}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function zonedParts(epoch: number, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(epoch));
  const part = (type: string) => Number(parts.find(item => item.type === type)?.value);
  return { year: part("year"), month: part("month"), day: part("day"), hour: part("hour"), minute: part("minute"), second: part("second") };
}

/** Resolve wall time only when it maps to one real instant; reject DST gaps and folds. */
export function localDateTimeToIso(date: unknown, time: unknown, timezone: unknown): string {
  if (!validDate(date) || typeof time !== "string" || !TIME.test(time)) throw new Error("Enter a valid date and time.");
  if (typeof timezone !== "string" || !timezone.trim() || timezone.length > 64) throw new Error("Choose a valid time zone.");
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const target = Date.UTC(year, month - 1, day, hour, minute);
  try { new Intl.DateTimeFormat("en-GB", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }); }
  catch { throw new Error("Choose a valid IANA time zone."); }
  const offsets = new Set<number>();
  for (const delta of [-36, -12, 0, 12, 36]) {
    const sample = target + delta * 60 * 60 * 1000;
    const parts = zonedParts(sample, timezone);
    const wallAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
    offsets.add(wallAsUtc - Math.floor(sample / 1000) * 1000);
  }
  const matches = [...offsets].map(offset => target - offset).filter(candidate => {
    const p = zonedParts(candidate, timezone);
    return p.year === year && p.month === month && p.day === day && p.hour === hour && p.minute === minute && p.second === 0;
  });
  const unique = [...new Set(matches)];
  if (unique.length === 0) throw new Error("That local time does not exist because of a clock change. Choose another time.");
  if (unique.length > 1) throw new Error("That local time occurs twice because of a clock change. Choose a different time.");
  return new Date(unique[0]).toISOString();
}

export function isoToLocalDateTime(value: string, timezone: string): { date: string; time: string } {
  const p = zonedParts(Date.parse(value), timezone);
  return { date: `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`, time: `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}` };
}

export function parseAppointmentValues(input: Record<string, unknown>): AppointmentValues {
  const title = typeof input.title === "string" ? input.title.trim() : "";
  if (!title || title.length > 200) throw new Error("Enter an appointment title of up to 200 characters.");
  const timezone = typeof input.timezone === "string" ? input.timezone.trim() : "Europe/London";
  if (!timezone || timezone.length > 64) throw new Error("Choose a valid time zone.");
  try { new Intl.DateTimeFormat("en-GB", { timeZone: timezone }); } catch { throw new Error("Choose a valid IANA time zone."); }
  const relationshipId = input.relationshipId == null || input.relationshipId === "" ? null : String(input.relationshipId).trim();
  if (relationshipId && !UUID.test(relationshipId)) throw new Error("Choose a verified relationship from the list.");
  const allDay = input.allDay === true;
  let startsAt: string | null = null, endsAt: string | null = null, startDate: string | null = null, endDate: string | null = null;
  if (allDay) {
    const start = input.startDate;
    const inclusiveEnd = input.endDate == null || input.endDate === "" ? start : input.endDate;
    if (!validDate(start) || !validDate(inclusiveEnd) || String(inclusiveEnd) < String(start)) throw new Error("Enter a valid all-day date range.");
    startDate = start;
    endDate = addDateDays(String(inclusiveEnd), 1);
  } else {
    startsAt = localDateTimeToIso(input.startDate, input.startTime, timezone);
    endsAt = localDateTimeToIso(input.endDate, input.endTime, timezone);
    if (Date.parse(endsAt) <= Date.parse(startsAt)) throw new Error("End time must be after start time.");
  }
  const status = input.status ?? "tentative";
  if (status !== "tentative" && status !== "confirmed" && status !== "completed") throw new Error("Choose a valid appointment status.");
  let meetingUrl = nullableText(input.meetingUrl, 2048, "Meeting link");
  if (meetingUrl) { try { const url = new URL(meetingUrl); if (!(["http:", "https:"].includes(url.protocol))) throw Error(); meetingUrl = url.toString(); } catch { throw new Error("Enter a valid https:// or http:// meeting link."); } }
  const googleMeetEnabled = input.googleMeetEnabled === true;
  const googleCalendarAttendeeEmail = input.inviteAttendee === true
    ? nullableText(input.googleCalendarAttendeeEmail, 320, "Attendee email")?.toLowerCase() || null
    : null;
  if (input.inviteAttendee === true && (!googleCalendarAttendeeEmail || !EMAIL.test(googleCalendarAttendeeEmail))) {
    throw new Error("Enter a valid attendee email address before sending an invitation.");
  }
  return {
    relationshipId, title, startsAt, endsAt, startDate, endDate, timezone, allDay,
    location: nullableText(input.location, 500, "Location"), meetingUrl,
    notes: nullableText(input.notes, 10000, "Notes"), googleMeetEnabled, googleCalendarAttendeeEmail, status,
  };
}

export function appointmentDateKey(row: { all_day: boolean; starts_at: string | null; start_date: string | null; timezone: string }): string {
  if (row.all_day) return row.start_date || "";
  if (!row.starts_at) return "";
  const p = zonedParts(Date.parse(row.starts_at), row.timezone);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}
