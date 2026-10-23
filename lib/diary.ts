

/** Source adapters carry ownership/provenance, never credentials or an inferred identity. */
export type DiaryProvenance = { organisationId: string; dateSource: string } & (
  | { provider: "ops"; table: "acquisition_items" | "inbox_items" | "growth_targets" | "relationship_tasks" | "relationship_activity_events"; recordId: string }
  | { provider: "google_calendar" | "microsoft_calendar"; externalEventId: string; accountId: string; ownerUserId: string }
);
/** Future tenant-owned calendar adapter contract only: no connection, ingestion or OAuth in Phase 1. */
export type DiaryCalendarEvidence = {
  source: Extract<DiaryProvenance, { externalEventId: string }>;
  title: string; start: string; end: string | null; timeZone: string; dateOnly: boolean;
  linkedRelationship: { organisationId: string; locator: string; verifiedSourceLinkId: string } | null;
};
export type DiaryItem = {
  id: string; title: string; company: string | null; at: string | null; endAt: string | null; timeZone: string | null; dateOnly: boolean;
  type: "Follow-up" | "Waiting" | "Nurture" | "Task" | "Meeting" | "Manual activity";
  status: string; action: string; workspace: string; href: string;
  actionable: boolean;
  source: DiaryProvenance;
  eventType?:"meeting"|"follow_up"|"task"|"waiting"|"manual_activity";
  actualDateTime?:string|null;dueDateTime?:string|null;recordedAt?:string|null;owner?:string|null;
  suppressionReason?:string|null;sourceRefs?:{table:string;id:string}[];navigationReason?:string;
  channel?:string;recordedStage?:string;projectedStage?:string;retention?:string;lastAction?:{kind:string;at:string|null}|null;replyOverride?:boolean;meetingOverride?:boolean;

};
export type DiarySnapshot = { asOf: string; today: string; timezone: "Europe/London"; items: DiaryItem[]; summary?:{actionableFollowups:number;futureFollowups:number;suppressedFollowups:number;waiting:number;repliesNeedingResponse:number;meetingsThisWeek:number;overdueTasks:number;tasksToday:number;meetingsToday:number}; replyHref?:string };
export type DiaryRow = Record<string, unknown>;
export function diaryDay(value: string|null): string {
  if(!value)return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(value));
  return ["year", "month", "day"].map(k => parts.find(p => p.type === k)!.value).join("-");
}
export function diaryShift(day: string, amount: number) { const date = new Date(day + "T12:00:00Z"); date.setUTCDate(date.getUTCDate() + amount); return date.toISOString().slice(0, 10); }
export function diaryLabel(value: string|null, time = false) {
  if(!value)return "Date/time not recorded";
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", weekday: "short", day: "numeric", month: "short", ...(time && value.length!==10 ? { hour: "2-digit", minute: "2-digit" } as const : {}) }).format(new Date(value.length === 10 ? value + "T12:00:00Z" : value));
}
export function diaryGroups(snapshot: DiarySnapshot, day = snapshot.today) {
  return { overdue: snapshot.items.filter(i => i.actionable && !!i.at && diaryDay(i.at) < day), today: snapshot.items.filter(i => diaryDay(i.at) === day), upcoming: snapshot.items.filter(i => i.at && diaryDay(i.at) > day).slice(0, 12), undated:snapshot.items.filter(i=>!i.at) };
}
export function diaryWeek(day: string) { const start=diaryShift(day,-((new Date(day+"T12:00:00Z").getUTCDay()+6)%7));return Array.from({ length: 7 }, (_, n) => diaryShift(start, n)); }
export function diaryMonth(day: string) {
  const first = day.slice(0, 7) + "-01", days: string[] = [];
  for (let d = first; d.slice(0, 7) === first.slice(0, 7); d = diaryShift(d, 1)) days.push(d);
  return days;
}
export type DiaryIntent="today"|"tomorrow"|"week"|"overdue"|"where"|"overview"|"actionable"|"waiting"|{person:string;kind?:"all"|"meeting"};
export function diaryQuestion(question:string):DiaryIntent|null {
 const q=question.trim().replace(/[?!.]+$/,"");
 if(/where.*diary|find.*diary/i.test(q))return "where";
 const person=q.match(/^when (?:am I|are we) (?:speaking to|meeting|calling) (.{1,80})$/i);
 if(person)return {person:person[1].trim(),kind:"meeting"};
 const due=q.match(/^what is due (?:with|for) (.{1,80})$/i)||q.match(/^(?:why does|what does) (.{1,80}?) (?:still appear(?: for)?|appear in my diary)$/i);
 if(due)return {person:due[1].trim(),kind:"all"};
 if(/(?:who|what).*waiting on/i.test(q))return "waiting";
 if(/follow.ups.*(?:actionable|genuinely due)/i.test(q))return "actionable";
 if(/diary|prioriti[sz]|require me to do|rather than wait/i.test(q))return "overview";
 if(/^(?:what (?:have I got|is due|do I (?:have|need to do))|what is coming up|what(?:'s| is) overdue|what meetings)/i.test(q)){
  if(/overdue/i.test(q))return "overdue";
  if(/tomorrow/i.test(q))return "tomorrow";
  if(/this week/i.test(q))return "week";
  if(/today/i.test(q))return "today";
 }
 return null;
}
