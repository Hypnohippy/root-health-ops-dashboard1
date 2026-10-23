import { readOperationalCollection } from "@/lib/operationalIntelligence.server";
import { buildOperationalWork } from "@/lib/operationalWork";
import type { RelationshipTenant } from "@/lib/relationshipWorkspace.server";
import { diaryDay,diaryLabel,diaryShift,diaryWeek,type DiaryIntent,type DiarySnapshot } from "@/lib/diary";
import type { GuideAnswer } from "@/lib/rootCoachGuide";
export async function readDiary(tenant:RelationshipTenant):Promise<DiarySnapshot>{return buildOperationalWork(await readOperationalCollection(tenant));}
export async function diaryAnswer(tenant:RelationshipTenant,intent:DiaryIntent,question?:string,reason?:(question:string,evidence:string,intent:"factual"|"interpretive")=>Promise<string>):Promise<GuideAnswer>{
 const link={id:"diary" as const,label:"Diary",href:`/dashboard/diary?organisationId=${encodeURIComponent(tenant.organisationId)}`};
 if(intent==="where")return {workspace:"Diary",message:"Open Diary in the primary navigation for Today, Week and Month. It reads canonical Ops work, not external calendars or appointments inferred from messages.",destinations:[link]};
 const snapshot=await readDiary(tenant),day=intent==="tomorrow"?diaryShift(snapshot.today,1):snapshot.today,week=diaryWeek(day);
 const items=snapshot.items.filter(i=>typeof intent==="object"? (intent.kind==="all"||i.type==="Meeting")&&(` ${i.title.toLowerCase()} `).includes(` ${intent.person.toLowerCase()} `):intent==="overdue"?i.actionable&&!!i.at&&diaryDay(i.at)<day:intent==="week"?week.includes(diaryDay(i.at)):intent==="actionable"?i.actionable:intent==="waiting"?i.type==="Waiting"||i.type==="Follow-up"&&!i.actionable:intent==="overview"?true:diaryDay(i.at)===day);
 const summary=snapshot.summary;
 const facts=`Recorded canonical facts (Europe/London; as of ${snapshot.asOf}):${summary?` ${summary.repliesNeedingResponse} replies need attention; ${summary.actionableFollowups} actionable follow-ups; ${summary.futureFollowups} future follow-ups; ${summary.suppressedFollowups} suppressed follow-ups; ${summary.meetingsToday} meetings today; ${summary.tasksToday} tasks today; ${summary.overdueTasks} overdue tasks from earlier UK dates.`:""}`;
 const chosen=intent==="overview"?[...items.filter(i=>i.actionable).slice(0,15),...items.filter(i=>i.type==="Meeting"&&i.at&&diaryDay(i.at)>=day).slice(0,8),...items.filter(i=>!i.actionable&&i.suppressionReason).slice(0,5)]:items;
 const detail=chosen.length?chosen.slice(0,30).map(i=>`• ${diaryLabel(i.at,!i.dateOnly)} — ${i.title}: ${i.type}; ${i.status}; actionable ${i.actionable?"yes":"no"}${i.suppressionReason?`; ${i.suppressionReason}`:""}.`).join("\n"):typeof intent==="object"?"No matching structured items in the available Diary evidence. A name filter is not identity confirmation.":"No recorded dated items in this selection.";
 let message=facts+"\n\n"+detail;
 if(intent==="overview"&&question&&reason){
  const evidence=JSON.stringify({asOf:snapshot.asOf,timezone:snapshot.timezone,summary,selection:chosen.slice(0,30),coverage:"Bounded canonical evidence. Unknown dates stay unknown. Manual activity is not delivery/acceptance/booking. Suppressed work is not permission to send. Names filter sources, never merge identities. No priority scores, writes, sends or calendar actions."});
  try{message+="\n\nRecommendation / interpretation for review:\n"+await reason(question,evidence,"interpretive");}catch{message+="\n\nInterpretation is temporarily unavailable. The recorded facts above remain available; no action was taken.";}
 }
 return {workspace:"Diary · canonical operational evidence",message,destinations:[link,...(summary?.repliesNeedingResponse?[{id:"responses" as const,label:"Replies needing attention",href:`/dashboard/responses?organisationId=${encodeURIComponent(tenant.organisationId)}`}]:[])]};
}
