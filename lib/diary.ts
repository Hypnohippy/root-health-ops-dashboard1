import { buildContactLifecycle, type LifecycleInput } from "@/lib/contactLifecycle";

/** Source adapters carry ownership/provenance, never credentials or an inferred identity. */
export type DiaryProvenance = { organisationId: string; dateSource: string } & (
  | { provider: "ops"; table: "acquisition_items" | "inbox_items" | "growth_targets" | "relationship_tasks"; recordId: string }
  | { provider: "google_calendar" | "microsoft_calendar"; externalEventId: string; accountId: string; ownerUserId: string }
);
/** Future tenant-owned calendar adapter contract only: no connection, ingestion or OAuth in Phase 1. */
export type DiaryCalendarEvidence = {
  source: Extract<DiaryProvenance, { externalEventId: string }>;
  title: string; start: string; end: string | null; timeZone: string; dateOnly: boolean;
  linkedRelationship: { organisationId: string; locator: string; verifiedSourceLinkId: string } | null;
};
export type DiaryItem = {
  id: string; title: string; company: string | null; at: string; endAt: string | null; timeZone: string | null; dateOnly: boolean;
  type: "Follow-up" | "Waiting" | "Nurture" | "Task" | "Call";
  status: string; action: string; workspace: string; href: string;
  actionable: boolean;
  source: DiaryProvenance;
};
export type DiarySnapshot = { asOf: string; today: string; timezone: "Europe/London"; items: DiaryItem[] };
export type DiaryRow = Record<string, unknown>;
const text = (v: unknown) => typeof v === "string" ? v.trim() : "";
const validDate = (v: unknown): string | null => typeof v === "string" && Number.isFinite(Date.parse(v)) ? new Date(v).toISOString() : null;
export function diaryDay(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(value));
  return ["year", "month", "day"].map(k => parts.find(p => p.type === k)!.value).join("-");
}
export function diaryShift(day: string, amount: number) { const date = new Date(day + "T12:00:00Z"); date.setUTCDate(date.getUTCDate() + amount); return date.toISOString().slice(0, 10); }
export function diaryLabel(value: string, time = false) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", weekday: "short", day: "numeric", month: "short", ...(time ? { hour: "2-digit", minute: "2-digit" } as const : {}) }).format(new Date(value.length === 10 ? value + "T12:00:00Z" : value));
}
export function diaryGroups(snapshot: DiarySnapshot, day = snapshot.today) {
  return { overdue: snapshot.items.filter(i => i.actionable && diaryDay(i.at) < day), today: snapshot.items.filter(i => diaryDay(i.at) === day), upcoming: snapshot.items.filter(i => diaryDay(i.at) > day).slice(0, 12) };
}
export function diaryWeek(day: string) { return Array.from({ length: 7 }, (_, n) => diaryShift(day, n)); }
export function diaryMonth(day: string) {
  const first = day.slice(0, 7) + "-01", days: string[] = [];
  for (let d = first; d.slice(0, 7) === first.slice(0, 7); d = diaryShift(d, 1)) days.push(d);
  return days;
}
/** Read-only projection of existing lifecycle dates and explicitly dated open tasks. */
export function buildDiary(organisationId: string, input: LifecycleInput, tasks: DiaryRow[] = [], workspaces: DiaryRow[] = [], asOf = new Date().toISOString()): DiarySnapshot {
  const items: DiaryItem[] = [], org = encodeURIComponent(organisationId);
  const add = (item: DiaryItem) => { if (!items.some(i => i.id === item.id)) items.push(item); };
  const contacts = buildContactLifecycle(organisationId, input, Date.parse(asOf));
  for (const contact of contacts) {
    const { table, id } = contact.actionRecord, row = input[table].find(r => r.id === id && r.organisation_id === organisationId);
    if (!row) continue;
    const href = table === "inbox_items" ? `/dashboard/responses?organisationId=${org}&itemId=${encodeURIComponent(id)}` : `/dashboard/growth/relationships/${table === "growth_targets" ? "target" : "acquisition"}_${encodeURIComponent(id)}?organisationId=${org}`;
    let type: DiaryItem["type"] | undefined = ({ follow_up: "Follow-up", nurture: "Nurture", waiting: "Waiting", meeting: "Call" } as const)[contact.currentStage as "follow_up" | "nurture" | "waiting" | "meeting"];
    if (!type || !contact.nextDueDate) continue;
    if (type === "Call" && validDate(row.call_date) !== contact.nextDueDate) type = "Task";
    if (type === "Call" && ["won", "lost", "cancelled", "completed"].includes(text(row.call_outcome))) continue;
    add({ id: `${table}:${id}:due`, title: contact.name || contact.company || "Recorded contact", company: contact.company, at: contact.nextDueDate, endAt: null, timeZone: null, dateOnly: false, type, status: contact.currentStage.replaceAll("_", " "), action: contact.nextAction?.replaceAll("_", " ") || "Review source", workspace: table === "inbox_items" ? "Responses" : table === "growth_targets" ? "Growth" : "Acquisition", href, actionable: type !== "Call" && type !== "Waiting", source: { provider: "ops", organisationId, table, recordId: id, dateSource: "lifecycle.nextDueDate" } });
  }
  // call_date is structured evidence; free text and ordinary messages never create appointments.
  const meetings = new Set(contacts.filter(c => !["converted", "lost", "dismissed"].includes(c.currentStage)).flatMap(c => c.records.filter(r => r.table === "growth_targets" && r.stage === "meeting").map(r => r.id)));
  for (const row of input.growth_targets.filter(r => r.organisation_id === organisationId && meetings.has(r.id) && !["won", "lost", "cancelled", "completed"].includes(text(r.call_outcome)) && !["lost", "closed", "converted"].includes(text(r.status)))) {
    const at = validDate(row.call_date); if (!at) continue;
    const existing = items.find(i => i.source.provider === "ops" && i.source.table === "growth_targets" && i.source.recordId === row.id && i.at === at);
    if (existing) { existing.type = "Call"; existing.actionable = false; existing.source.dateSource = "call_date"; continue; }
    add({ id: `growth_targets:${row.id}:call_date`, title: text(row.target_name) || "Recorded call", company: text(row.company) || null, at, endAt: null, timeZone: null, dateOnly: false, type: "Call", status: "Recorded meeting", action: "Review recorded call", workspace: "Growth", href: `/dashboard/growth/relationships/target_${encodeURIComponent(row.id)}?organisationId=${org}`, actionable: false, source: { provider: "ops", organisationId, table: "growth_targets", recordId: row.id, dateSource: "call_date" } });
  }
  for (const row of tasks) {
    const workspace = workspaces.find(w => w.id === row.workspace_id && w.organisation_id === organisationId);
    const at = validDate(row.due_at);
    if (row.organisation_id !== organisationId || row.status !== "open" || !at || !workspace) continue;
    add({ id: `relationship_tasks:${text(row.id)}:due_at`, title: text(row.task), company: null, at, endAt: null, timeZone: null, dateOnly: false, type: "Task", status: "Open", action: "Review relationship task", workspace: "Relationships", href: `/dashboard/growth/relationships/workspace_${encodeURIComponent(text(row.workspace_id))}?organisationId=${org}`, actionable: true, source: { provider: "ops", organisationId, table: "relationship_tasks", recordId: text(row.id), dateSource: "due_at" } });
  }
  return { asOf, today: diaryDay(asOf), timezone: "Europe/London", items: items.sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id)) };
}

export function diaryQuestion(question: string): "today" | "tomorrow" | "week" | "overdue" | "where" | { person: string } | null {
  const q = question.trim().replace(/[?!.]+$/, "");
  if (/where.*diary|find.*diary/i.test(q)) return "where";
  const speaking = q.match(/^when (?:am I|are we) (?:speaking to|meeting|calling) (.{1,80})$/i);
  if (speaking) return { person: speaking[1].trim() };
  if (/^(?:what (?:have I got|is due|do I (?:have|need to do))|what is coming up|what(?:'s| is) overdue)/i.test(q)) {
    if (/overdue/i.test(q)) return "overdue";
    if (/tomorrow/i.test(q)) return "tomorrow";
    if (/this week/i.test(q)) return "week";
    if (/today/i.test(q)) return "today";
  }
  return null;
}
