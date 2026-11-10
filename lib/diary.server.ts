import { readOperationalCollection } from "@/lib/operationalIntelligence.server";
import { buildOperationalWork } from "@/lib/operationalWork";
import type { RelationshipTenant } from "@/lib/relationshipWorkspace.server";
import { diaryDay,diaryLabel,diaryShift,diaryWeek,type DiaryIntent,type DiarySnapshotWithAppointments } from "@/lib/diary";
import type { GuideAnswer } from "@/lib/rootCoachGuide";
import { readDiaryAppointments } from "@/lib/diaryAppointments.server";
import { readGoogleCalendar } from "@/lib/diaryGoogleCalendar.server";
import { addDateDays, validDate } from "@/lib/diaryAppointments";
export async function readDiary(tenant:RelationshipTenant, range?: { from?: string; to?: string }):Promise<DiarySnapshotWithAppointments>{
 const [collection,rows]=await Promise.all([readOperationalCollection(tenant),readDiaryAppointments(tenant.organisationId)]);
 const snapshot=buildOperationalWork(collection),relationships=new Map<string,{person:string;company:string|null;href:string}>();
 for(const record of collection.records){const id=record.workspace?.id;if(typeof id!="string"||record.intelligence.identity.humanReviewRequired)continue;relationships.set(id,{person:record.relationship.name,company:record.relationship.company||null,href:`/dashboard/growth/relationships/workspace_${id}?organisationId=${encodeURIComponent(tenant.organisationId)}`});}
 const appointments=rows.map(row=>({id:row.id,title:row.title,startsAt:row.starts_at,endsAt:row.ends_at,startDate:row.start_date,endDate:row.end_date,timezone:row.timezone,allDay:row.all_day,location:row.location,meetingUrl:row.meeting_url,notes:row.notes,status:row.status,source:row.source,revision:Number(row.revision),createdAt:row.created_at,updatedAt:row.updated_at,cancelledAt:row.cancelled_at,googleCalendarSyncEnabled:row.google_calendar_sync_enabled===true,googleCalendarMirrored:!!row.google_calendar_event_id,googleCalendarSyncedAt:row.google_calendar_synced_at||null,googleCalendarSyncPending:row.google_calendar_sync_pending===true,relationship:row.relationship_id&&relationships.has(row.relationship_id)?({id:row.relationship_id,...relationships.get(row.relationship_id)!}):null}));
 const from=range?.from||snapshot.today,to=range?.to||addDateDays(from,31);
 if(!validDate(from)||!validDate(to)||to<=from||Date.parse(`${to}T00:00:00Z`)-Date.parse(`${from}T00:00:00Z`)>63*86400000)throw new Error("Choose a valid Diary date range of up to 63 days.");
 const calendar=await readGoogleCalendar(tenant.organisationId,from,to);
 const mirroredIds=new Set(rows.filter(row=>row.google_calendar_id&&row.google_calendar_event_id).map(row=>`${row.google_calendar_id}:${row.google_calendar_event_id}`));
 return {...snapshot,appointments,googleCalendarEvents:calendar.events.filter(event=>!mirroredIds.has(`${event.calendarId}:${event.id}`)),googleCalendar:{...calendar.connection,unavailable:calendar.unavailable}};
}
export async function diaryAnswer(tenant:RelationshipTenant,intent:DiaryIntent,question?:string,reason?:(question:string,evidence:string,intent:"factual"|"interpretive")=>Promise<string>):Promise<GuideAnswer>{
 const link={id:"diary" as const,label:"Diary",href:`/dashboard/diary?organisationId=${encodeURIComponent(tenant.organisationId)}`};
 if(intent==="where")return {workspace:"Diary",message:"Open Diary in the primary navigation for Today, Week and Month. It reads canonical Ops work, not external calendars or appointments inferred from messages.",destinations:[link]};
 const snapshot=await readDiary(tenant),day=intent==="tomorrow"?diaryShift(snapshot.today,1):snapshot.today,week=diaryWeek(day);
 const items=snapshot.items.filter(i=>typeof intent==="object"? (intent.kind==="all"||i.type==="Meeting")&&(` ${i.title.toLowerCase()} `).includes(` ${intent.person.toLowerCase()} `):intent==="overdue"?i.actionable&&!!i.at&&diaryDay(i.at)<day:intent==="week"?week.includes(diaryDay(i.at)):intent==="actionable"?i.actionable:intent==="waiting"?i.type==="Waiting"||i.type==="Follow-up"&&!i.actionable:intent==="overview"?true:diaryDay(i.at)===day);
 const summary=snapshot.summary;
 const facts=`Recorded canonical facts (Europe/London; as of ${snapshot.asOf}):${summary?` ${summary.repliesNeedingResponse} replies need attention; ${summary.actionableFollowups} actionable follow-ups; ${summary.futureFollowups} future follow-ups; ${summary.suppressedFollowups} suppressed follow-ups; ${summary.meetingsToday} meetings today; ${summary.tasksToday} tasks today; ${summary.overdueTasks} overdue tasks from earlier UK dates.`:""}`;
 const chosen=intent==="overview"?[...new Map([...items.filter(i=>i.actionable).slice(0,10),...items.filter(i=>i.type==="Meeting"&&i.at&&diaryDay(i.at)>=day).slice(0,5),...items.filter(i=>!i.actionable&&i.suppressionReason).slice(0,5),...items.filter(i=>i.type==="Follow-up"&&i.at&&diaryDay(i.at)>day).slice(0,5),...items.filter(i=>i.type==="Waiting").slice(0,5)].map(i=>[i.id,i])).values()]:items;
 const detail=chosen.length?chosen.slice(0,30).map(i=>`• ${diaryLabel(i.at,!i.dateOnly)} — ${i.title}: ${i.type}; ${i.status}; actionable ${i.actionable?"yes":"no"}${i.suppressionReason?`; ${i.suppressionReason}`:""}.`).join("\n"):typeof intent==="object"?"No matching structured items in the available Diary evidence. A name filter is not identity confirmation.":"No recorded dated items in this selection.";
 let message=facts+"\n\n"+detail;
 if(intent==="overview"&&question&&reason){
  const evidence=JSON.stringify({asOf:snapshot.asOf,timezone:snapshot.timezone,summary,selection:chosen.slice(0,30),countMeanings:{waiting:"A count of explicit Waiting events PLUS non-actionable follow-up events, including future or suppressed cadence. These are operational items, not unique people, and NOT all waiting for a response.",futureFollowups:"Future dated follow-up events; may overlap suppressed follow-ups.",suppressedFollowups:"Non-actionable follow-up history with an exclusion; never permission to send."},coverage:"Use the count meanings exactly. Never describe the waiting total as replies expected or items waiting for a response. Bounded canonical evidence. Unknown dates stay unknown. Manual activity is not delivery/acceptance/booking. Suppressed work is not permission to send. Names filter sources, never merge identities. No priority scores, writes, sends or calendar actions."});
  try{message+="\n\nRecommendation / interpretation for review:\n"+await reason(question,evidence,"interpretive");}catch{message+="\n\nInterpretation is temporarily unavailable. The recorded facts above remain available; no action was taken.";}
 }
 return {workspace:"Diary · canonical operational evidence",message,destinations:[link,...(summary?.repliesNeedingResponse?[{id:"responses" as const,label:"Replies needing attention",href:`/dashboard/responses?organisationId=${encodeURIComponent(tenant.organisationId)}`}]:[])]};
}
