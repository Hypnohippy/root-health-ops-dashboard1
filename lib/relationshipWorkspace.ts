import { lifecycleLinkedInIdentity, buildContactLifecycle, type LifecycleInput, type LifecycleRow, type LifecycleTable } from "@/lib/contactLifecycle";
export type Row = Record<string, unknown>;
export type SourceRef = { table: LifecycleTable | "founder_research_records"; id: string };
export const sourcePrefixes = { inbox: "inbox_items", target: "growth_targets", acquisition: "acquisition_items", founder: "founder_research_records" } as const;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const words = (v: unknown) => typeof v === "string" ? v.trim() : "";
export const object = (v: unknown): Row => v && typeof v === "object" && !Array.isArray(v) ? v as Row : {};
export function parseRelationshipLocator(value: string) {
 const match=value.match(/^(inbox|target|acquisition|founder|workspace)_([a-f0-9-]+)$/i);
 if(!match || !uuid.test(match[2])) throw Error("Choose a valid relationship link.");
 return { prefix:match[1].toLowerCase(), id:match[2].toLowerCase() };
}
export function sourceLocator(ref: SourceRef) { const prefix=Object.entries(sourcePrefixes).find(([,table])=>table===ref.table)?.[0]; if(!prefix || !uuid.test(ref.id)) throw Error("Invalid relationship source.");return `${prefix}_${ref.id}`; }
export function relationshipHref(ref: SourceRef, org: string) { return `/dashboard/growth/relationships/${sourceLocator(ref)}?organisationId=${encodeURIComponent(org)}`; }
export type ProjectedRelationship = {
 locator:string; kind:"person"|"company"; name:string; company:string|null; role:string|null; stage:string; nextAction:string|null;
 contactId:string|null; refs:SourceRef[]; founderIds:string[]; owner:string|null; facts:string[]; interpretation:string[];
 lastAction:{action:string;at:string|null}|null; nextDueDate:string|null; operationalHref:string|null;
};
export function projectRelationships(org:string,input:LifecycleInput,founder:Row[]=[]) {
 const contacts=buildContactLifecycle(org,input), result:ProjectedRelationship[]=[];
 for(const c of contacts) {
  const refs=c.records.map(r=>({table:r.table,id:r.id})), rows=refs.map(r=>input[r.table].find(x=>x.id===r.id)!).filter(Boolean);
  // Company-only research is never collapsed with an employee by company/domain matching.
  const named=!!c.name, companyOnly=!named && !!c.company;
  const primary=companyOnly?refs.find(r=>r.table==="acquisition_items")||refs[0]:refs[0];
  const linkedFounder=founder.filter(r=>r.organisation_id===org && refs.some(ref=>ref.table==="acquisition_items"&&ref.id===r.linked_acquisition_item_id) && r.entity_kind===(companyOnly?"company":"person"));
  result.push({locator:sourceLocator(primary),kind:companyOnly?"company":"person",name:c.name||c.company||"Identity not established",company:c.company,role:rows.map(r=>words(r.role_title)||words(object(r.metadata).headline)||words(object(r.raw).headline)).find(Boolean)||null,stage:c.currentStage,nextAction:c.nextAction,contactId:c.contactId,refs,founderIds:linkedFounder.map(r=>String(r.id)),owner:words(rows.find(r=>r.owner_user_id)?.owner_user_id)||null,facts:rows.flatMap(r=>[words(r.role_title),words(r.company)]).filter(Boolean),interpretation:rows.flatMap(r=>[words(r.reason),words(r.signal)]).filter(Boolean),lastAction:c.lastAction,nextDueDate:c.nextDueDate,operationalHref:c.actionRecord.table==="inbox_items"?`/dashboard/responses?organisationId=${org}&itemId=${c.actionRecord.id}`:c.actionRecord.table==="growth_targets"?`/dashboard/growth/pipeline?organisationId=${org}&targetId=${c.actionRecord.id}`:`/dashboard/growth/acquisition?organisationId=${org}&itemId=${c.actionRecord.id}`});
 }
 for(const f of founder.filter(r=>r.organisation_id===org)) {
  const existing=result.find(r=>r.founderIds.includes(String(f.id))) || (f.entity_kind==="person" && f.linkedin_identity ? result.find(r=>r.kind==="person" && r.contactId===JSON.stringify([org,`linkedin:${lifecycleLinkedInIdentity(f.linkedin_identity)}`])):undefined);
  if(existing) { if(!existing.founderIds.includes(String(f.id)))existing.founderIds.push(String(f.id)); existing.refs.push({table:"founder_research_records",id:String(f.id)}); continue; }
  result.push({locator:sourceLocator({table:"founder_research_records",id:String(f.id)}),kind:f.entity_kind==="person"?"person":"company",name:words(f.person_name)||words(f.company)||"Stored research",company:words(f.company)||null,role:Array.isArray(f.contacts)?words(object(f.contacts.find(c=>object(c).name===f.person_name)).role)||null:null,stage:"researched",nextAction:"Review stored research",contactId:null,refs:[{table:"founder_research_records",id:String(f.id)}],founderIds:[String(f.id)],owner:null,facts:[words(f.website),words(f.geography)].filter(Boolean),interpretation:[words(object(f.scores_rationale).why),words(object(f.research_snapshot).recommendedApproach)].filter(Boolean),lastAction:{action:"Research saved",at:words(f.updated_at)||null},nextDueDate:null,operationalHref:`/dashboard/founder-intelligence?recordId=${f.id}&organisationId=${org}`});
 }
 return result;
}
export function resolveProjection(locator:string,items:ProjectedRelationship[],links:Row[]=[]) {
 const parsed=parseRelationshipLocator(locator);
 const refs=parsed.prefix==="workspace"?links.filter(l=>l.workspace_id===parsed.id).map(l=>({table:String(l.source_table),id:String(l.source_id)})):[{table:sourcePrefixes[parsed.prefix as keyof typeof sourcePrefixes],id:parsed.id}];
 const matches=items.filter(r=>r.refs.some(ref=>refs.some(s=>s.table===ref.table&&s.id===ref.id)));
 if(matches.length!==1) throw Error(matches.length?"Relationship identity is ambiguous. Review the source records.":"Relationship not found in this organisation.");
 return matches[0];
}
export function matchingWorkspace(refs:SourceRef[],links:Row[]) {
 const ids=[...new Set(links.filter(l=>refs.some(r=>r.table===l.source_table&&r.id===l.source_id)).map(l=>String(l.workspace_id)))];
 if(ids.length>1)throw Error("Duplicate relationship workspaces require explicit review. No histories were merged.");return ids[0]||null;
}
export function stageLabel(stage:string) { return ({needs_reply:"Needs reply",outreach_ready:"First message opportunity",follow_up:"Follow-up",no_reply_needed:"No action due",converted:"Won / converted",lost:"Closed / lost",engaged:"Conversation",researched:"Researched"} as Record<string,string>)[stage]||stage.replaceAll("_"," "); }
export function nextMove(r:ProjectedRelationship) {
 if(["lost","converted","dismissed","no_reply_needed"].includes(r.stage)) return "No outreach is due. Respect the recorded relationship state.";
 if(r.stage==="needs_reply") return "Open the current reply in Responses. Read the actual conversation before preparing a response.";
 if(r.stage==="waiting")return "Wait for a response or the recorded next due date. No additional message is recommended now.";
 if(r.stage==="engaged")return "Review the latest conversation and recorded commitments before choosing another action.";
 return r.nextAction?.replaceAll("_"," ")||"Review the evidence and choose the next step.";
}
export function sourceRows(input:LifecycleInput,refs:SourceRef[]) {return refs.filter((r):r is {table:LifecycleTable;id:string}=>r.table!=="founder_research_records").flatMap(r=>input[r.table].filter(x=>x.id===r.id));}
export type EvidenceEvent = {id:string;kind:string;channel:string;text:string;at:string|null;recordedAt:string|null;source:string;direction?:string};
export function chronologicalEvidence(entries:EvidenceEvent[]) {const unique=[...new Map(entries.map(e=>[e.id,e])).values()];return {dated:unique.filter(e=>e.at).sort((a,b)=>String(a.at).localeCompare(String(b.at))||a.id.localeCompare(b.id)),undated:unique.filter(e=>!e.at).sort((a,b)=>String(a.recordedAt||"").localeCompare(String(b.recordedAt||""))||a.id.localeCompare(b.id))};}
export const rowTime=(r:LifecycleRow)=>words(r.created_at_platform)||words(r.inserted_at)||null;

/** Shared manual evidence projection; never a send receipt or identity link. */
export function workspaceActivityEvidence(e:Row):EvidenceEvent {
 const d=object(e.details),activityType=e.activity_type==="activity"?words(d.activityType):"";return {id:`workspace:${e.id}`,kind:e.activity_type==="note"?String(e.note_type):e.activity_type==="activity"?`Manually recorded ${String(d.activityType).replaceAll("_"," ")}`:e.activity_type==="retention"?d.retention==="archived"?"Relationship archived":d.retention==="stale"?"Relationship marked stale":"Relationship restored / active":e.activity_type==="value"?"Commercial value saved / recalculated":e.activity_type==="task_created"?"Task added":e.activity_type==="task_state"?`Task marked ${d.status}`:e.activity_type==="company_link"?"Company relationship linked":String(e.activity_type).replaceAll("_"," "),channel:activityType==="emailed"?"Email":activityType==="linkedin_contacted"?"LinkedIn":["called","meeting"].includes(activityType)?activityType==="called"?"Calls":"Meetings":"Ops",text:String(e.message||d.task||d.retention||d.status||"Relationship information saved"),at:words(e.occurred_at)||null,recordedAt:words(e.recorded_at)||null,source:`Recorded by ${e.actor}${d.route?`; route ${d.route}`:""}${d.subject?`; subject ${d.subject}`:""}; manual evidence is not a verified delivery receipt`};
}
