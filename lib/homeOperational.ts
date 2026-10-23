import { controlGroups,homeLink,type HomeControl,type ControlItem } from "@/lib/homeControl";
import type { readOperationalCollection } from "@/lib/operationalIntelligence.server";
import type { DiarySnapshot } from "@/lib/diary";
type Collection=Awaited<ReturnType<typeof readOperationalCollection>>;
/** Bounded Home migration: keep publishing/engine/marketing models; canonicalise relationship cadence. */
export function canonicalHomeControl(org:string,control:HomeControl,collection:Collection,work:DiarySnapshot):HomeControl {
 const bySource=new Map<string,Collection["records"][number]>(collection.records.flatMap(r=>r.relationship.refs.map(ref=>[`${ref.table}:${ref.id}`,r] as const)));
 const items=control.items.map(item=>{
  if(!item.id.startsWith("contact:")||!["follow_up","waiting"].includes(item.stage))return item;
  const record=item.evidence.map(e=>bySource.get(e.label.replace(" · ",":"))).find(Boolean);if(!record)return item;
  const refs=new Set(record.relationship.refs.map(r=>r.table+":"+r.id));
  const events=work.items.filter(e=>e.sourceRefs?.some(r=>refs.has(r.table+":"+r.id))&&(e.type==="Follow-up"||e.type==="Waiting"));
  const action=events.find(e=>e.actionable),example=action||events[0],reply=record.intelligence.actionability.replyNeeded;
  const group=action||reply?"human":"in_hand";
  const why=reply?"Recorded inbound requires review in Responses.":action?"Existing canonical governor permits this follow-up.":example?.suppressionReason||"No currently actionable follow-up is established; recorded cadence remains history.";
  return {...item,group,operationalState:group==="human"?"human_action_required":"waiting",workflowHref:example?.href||record.relationship.operationalHref||item.workflowHref,href:homeLink(org,{group,item:item.id}),why,nextAction:reply?"Review the current reply":action?"Review the actionable follow-up":"Review recorded dependency / suppression",nextDueDate:example?.at||record.intelligence.actionability.projectedDueDate,humanReason:group==="human"?"by_design":null,manualRecord:undefined,fallback:null,evidence:[...item.evidence,{label:"Canonical actionability",value:why}]} as ControlItem;
 });
 for(const event of work.items.filter(e=>e.type==="Task"||e.type==="Meeting")){
  // An existing meeting card already represents that same relationship meeting; do not count it twice.
  if(event.type==="Meeting"&&items.some(i=>i.id.startsWith("contact:")&&i.stage==="meeting"&&i.evidence.some(e=>event.sourceRefs?.some(r=>e.label===`${r.table} · ${r.id}`))))continue;
  const group=event.actionable||event.type==="Meeting"?"human":"in_hand";
  items.push({id:`canonical:${event.id}`,group,operationalState:group==="human"?"human_action_required":"scheduled",name:event.title,stage:event.type==="Meeting"?"meeting":"task",channel:event.channel||"Ops",source:"Canonical Diary",lastAction:event.status,lastActionAt:event.actualDateTime||null,handled:"Recorded structured evidence",why:event.type==="Meeting"?"Review the recorded meeting schedule; no completed meeting is inferred.":"Explicit dated task; source ownership is preserved.",nextAction:event.action,nextDueDate:event.dueDateTime||event.at,owner:event.owner||"Not assigned",humanReason:group==="human"?"by_design":null,workflowHref:event.href,href:homeLink(org,{group,item:`canonical:${event.id}`}),evidence:[{label:event.source.provider==="ops"?`${event.source.table} · ${event.source.recordId}`:"External event",value:event.navigationReason||"Canonical source"}],prepared:null,fallback:null});
 }
 return {...control,items,groups:controlGroups.map(key=>({key,count:items.filter(i=>i.group===key).length,href:homeLink(org,{group:key})}))};
}
