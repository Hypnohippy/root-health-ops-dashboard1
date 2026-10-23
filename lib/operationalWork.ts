import type { readOperationalCollection } from "@/lib/operationalIntelligence.server";
import { diaryDay,diaryWeek,type DiaryItem,type DiarySnapshot } from "@/lib/diary";
import { sourceLocator,type SourceRef } from "@/lib/relationshipWorkspace";

type Collection=Awaited<ReturnType<typeof readOperationalCollection>>;
const date=(v:unknown):string|null=>{
 if(typeof v!=="string"||!Number.isFinite(Date.parse(v)))return null;
 if(/^\d{4}-\d{2}-\d{2}$/.test(v))return new Date(v+"T12:00:00Z").toISOString().slice(0,10)===v?v:null;
 return /(?:Z|[+-]\d{2}:\d{2})$/.test(v)?v:null;
};
const text=(v:unknown)=>typeof v==="string"?v.trim():"";
/** Presentation of canonical evidence, never another lifecycle or send governor. */
export function buildOperationalWork(collection:Collection):DiarySnapshot {
 const org=collection.organisationId,asOf=collection.asOf,now=Date.parse(asOf),today=diaryDay(asOf),items=new Map<string,DiaryItem>();
 const future=(at:string)=>at.length===10?diaryDay(at)>today:Date.parse(at)>now;
 const add=(item:DiaryItem)=>{if(!items.has(item.id))items.set(item.id,item);};
 for(const record of collection.records){
  const r=record.relationship,a=record.intelligence.actionability,refs=r.refs,identity=record.intelligence.identity;
  const safe=!identity.humanReviewRequired;
  const locator=safe&&record.workspace?`workspace_${record.workspace.id}`:sourceLocator(refs[0]);
  const href=safe?`/dashboard/growth/relationships/${locator}?organisationId=${org}`:r.operationalHref||`/dashboard/growth/relationships/${sourceLocator(refs[0])}?organisationId=${org}`;
  const common={title:r.name,company:r.company,endAt:null,timeZone:"Europe/London",workspace:safe?"Relationships":"Exact source",href,sourceRefs:refs,navigationReason:safe?"Canonical relationship":"Identity unresolved; exact source only. No identities merged.",retention:String(record.intelligence.state.retention),recordedStage:r.stage,projectedStage:r.stage,lastAction:record.intelligence.latestRelationshipEvent?{kind:record.intelligence.latestRelationshipEvent.kind,at:record.intelligence.latestRelationshipEvent.at}:null,replyOverride:a.replyNeeded,meetingOverride:r.stage==="meeting",owner:text(record.intelligence.state.owner)||null,recordedAt:null};
  const rows=refs.flatMap(ref=>ref.table==="founder_research_records"?[]:collection.input[ref.table].filter(row=>row.id===ref.id&&row.organisation_id===org).map(row=>({ref,row})));
  const source=(ref:SourceRef,field:string)=>({provider:"ops" as const,organisationId:org,table:ref.table as "inbox_items"|"growth_targets"|"acquisition_items",recordId:ref.id,dateSource:field});
  const suppressed=record.intelligence.actionability.suppressionReasons.join("; ");
  // Existing linked source governors own cadence eligibility; raw stage is history, not permission.
  for(const cadence of a.rawCadence){
   if(!cadence.isFollowUp)continue;
   // A single cadence source owns the canonical relationship due projection even when suppressed.
   // Multiple distinct source events retain their own dates unless the queue identifies the owner.
   const ownsProjection=a.rawCadence.length===1||a.linkedInActionSources.some(s=>s.id===cadence.source.id&&s.table===cadence.source.table);
   const projected=(ownsProjection?date(a.projectedDueDate):null)||date(cadence.dueDate),at=projected&&cadence.dateOnly?diaryDay(projected):projected;
   const eligible=a.linkedInActionSources.some(s=>s.id===cadence.source.id&&s.table===cadence.source.table);
   add({...common,id:`growth_targets:${cadence.source.id}:cadence`,type:"Follow-up",eventType:"follow_up",at,dueDateTime:at,actualDateTime:null,dateOnly:at?.length===10,status:`Recorded stage: ${cadence.stage}; projected: ${r.stage}`,action:eligible?"Actionable in existing LinkedIn workflow":"Review recorded cadence; no send permission established",actionable:eligible,channel:"linkedin",recordedStage:String(cadence.stage),suppressionReason:eligible?null:record.intelligence.state.retention==="stale"?"Relationship marked stale":at&&future(at)?"Future due date; not actionable yet":suppressed||"Existing governor does not permit this proactive action",source:source({table:"growth_targets",id:cadence.source.id},"canonical due projection (source cadence fallback where unassigned)")});
  }
  for(const response of a.responseItems){
   const row=rows.find(s=>s.ref.table==="inbox_items"&&s.ref.id===response.id)?.row;
   const raw=date(row?.follow_up_at);
   if(response.currentStage!=="follow_up"&&!(row?.response_state==="follow_up"&&raw))continue;
   if(response.channel==="linkedin"&&!raw)continue;
   const at=raw||date(response.nextDueDate);if(!at)continue;
   const due=at.length===10?diaryDay(at)<=today:Date.parse(at)<=now;
   const allowed=response.currentStage==="follow_up"&&response.channel!=="linkedin"&&response.humanActionRequired&&response.canDraft&&due&&record.intelligence.state.retention!=="stale";
   add({...common,id:`inbox_items:${response.id}:follow_up`,type:"Follow-up",eventType:"follow_up",at,dueDateTime:at,actualDateTime:null,dateOnly:at.length===10,status:response.label,action:response.nextAction||"Review Responses",actionable:allowed,channel:String(response.channel||"Ops"),suppressionReason:allowed?null:record.intelligence.state.retention==="stale"?"Relationship marked stale":due?response.blockedReason||"Existing Responses governor does not permit this action":"Future due date; no action due yet",source:source({table:"inbox_items",id:response.id},"responseLifecycle.nextDueDate")});
  }
  // A meeting's stable source ID is independent of every cadence, task and waiting fact.
  for(const {ref,row} of rows){
   const at=date(row.call_date);
   if(ref.table==="growth_targets"&&at&&!['won','lost','cancelled','completed'].includes(text(row.call_outcome))&&!['lost','closed','converted'].includes(text(row.status))){
    add({...common,id:`growth_targets:${ref.id}:call_date`,type:"Meeting",eventType:"meeting",at,actualDateTime:at,dueDateTime:null,dateOnly:at.length===10,status:"Structured meeting schedule; not evidence it took place",action:"Prepare / review the recorded meeting",actionable:false,channel:"Meetings",suppressionReason:null,source:source(ref,"call_date")});
   }
   const next=date(row.next_step_date);
   if(next&&text(row.next_step)&&!['lost','closed','converted'].includes(text(row.status))){
    add({...common,id:`${ref.table}:${ref.id}:next_step_date`,title:text(row.next_step),type:"Task",eventType:"task",at:next,dueDateTime:next,actualDateTime:null,dateOnly:next.length===10,status:"Recorded dated next step",action:"Review the existing next step",actionable:next.length===10?diaryDay(next)<=today:Date.parse(next)<=now,channel:"Ops",suppressionReason:null,source:source(ref,"next_step_date")});
   }
  }
  for(const task of record.tasks){
   const at=date(task.due_at);if(task.organisation_id!==org||task.workspace_id!==record.workspace?.id||task.status!=="open"||!at)continue;
   const due=at.length===10?diaryDay(at)<=today:Date.parse(at)<=now;
   add({...common,id:`relationship_tasks:${task.id}:due_at`,title:text(task.task),type:"Task",eventType:"task",at,dueDateTime:at,actualDateTime:null,dateOnly:at.length===10,status:"Open",action:"Review relationship task",actionable:due,owner:text(task.owner_user_id)||null,channel:"Ops",suppressionReason:due?null:"Future task due date",source:{provider:"ops",organisationId:org,table:"relationship_tasks",recordId:String(task.id),dateSource:"due_at"}});
  }
  if(r.stage==="waiting"){
   const at=date(a.projectedDueDate);
   add({...common,id:`waiting:${refs.map(s=>s.table+":"+s.id).sort().join("|")}`,type:"Waiting",eventType:"waiting",at,dueDateTime:at,actualDateTime:null,dateOnly:at?.length===10,status:"Waiting on reply / recorded dependency",action:"Wait or review linked evidence",actionable:false,channel:a.responseItems[0]?.channel||"Ops",suppressionReason:record.intelligence.state.retention==="stale"?"Relationship marked stale":null,source:source(refs[0],"canonical lifecycle waiting")});
  }
  for(const event of record.intelligence.manualActivity){
   if(!/^Manually recorded (?:emailed|linkedin contacted|called|meeting)$/.test(event.kind))continue;
   const valid=date(event.at),at=valid&&Date.parse(valid)<=now?valid:null;
   add({...common,id:event.id,title:`${r.name} · ${event.kind}`,type:"Manual activity",eventType:"manual_activity",at,actualDateTime:at,dueDateTime:null,recordedAt:event.recordedAt,dateOnly:at?.length===10,status:"User-recorded history; not delivery or future booking proof",action:"Review recorded relationship history",actionable:false,channel:event.channel,suppressionReason:valid&&!at?"A future timestamp cannot establish completed manual activity":null,source:{provider:"ops",organisationId:org,table:"relationship_activity_events",recordId:event.id.replace(/^workspace:/,""),dateSource:"occurred_at (recorded_at is separate)"}});
  }
 }
 const list=[...items.values()].sort((a,b)=>String(a.at||"9999").localeCompare(String(b.at||"9999"))||a.id.localeCompare(b.id));
 const followups=list.filter(i=>i.type==="Follow-up"),week=diaryWeek(today);
 return {asOf,today,timezone:"Europe/London",items:list,replyHref:collection.responseAttention.href,summary:{actionableFollowups:followups.filter(i=>i.actionable).length,futureFollowups:followups.filter(i=>i.at&&future(i.at)).length,suppressedFollowups:followups.filter(i=>!i.actionable&&!!i.suppressionReason&&!i.suppressionReason.startsWith("Future")).length,waiting:list.filter(i=>i.type==="Waiting"||i.type==="Follow-up"&&!i.actionable).length,repliesNeedingResponse:collection.responseAttention.count,meetingsThisWeek:list.filter(i=>i.type==="Meeting"&&i.at&&week.includes(diaryDay(i.at))).length,overdueTasks:list.filter(i=>i.type==="Task"&&i.actionable&&i.at&&diaryDay(i.at)<today).length,tasksToday:list.filter(i=>i.type==="Task"&&diaryDay(i.at)===today).length,meetingsToday:list.filter(i=>i.type==="Meeting"&&diaryDay(i.at)===today).length}};
}
