import { readLifecycleInput } from "@/lib/lifecycleSnapshot.server";
import { getRelationship, relationshipContext, type RelationshipTenant } from "@/lib/relationshipWorkspace.server";
import { relationshipDiscoveryInventory } from "@/lib/relationshipDiscovery";
import { readTenantHistory } from "@/lib/opsSearch.server";
import type { IdentityLedgerRow } from "@/lib/relationshipIdentityLedger";
import { object, parseRelationshipLocator, sourcePrefixes, projectRelationships, chronologicalEvidence, sourceLocator, type SourceRef } from "@/lib/relationshipWorkspace";
import { proactiveRetention, proactiveSuppression, relationshipMemory } from "@/lib/operationalIntelligence";
import { linkedInOutreachQueue } from "@/lib/linkedinOutreach";
import { readOutreachSelfIdentity } from "@/lib/outreachSelfIdentity.server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { responseAttention,responseLifecycleMap } from "@/lib/responseLifecycle";
import { cadenceEvidence } from "@/lib/linkedinSendEvidence";
import { cadenceDays,legacyCadenceStages,growthFollowUpDueAt } from "@/lib/growthOutreach";
import type { TruthRow } from "@/lib/relationshipTruth";
/** Read orchestration only. Identity partition scopes existing lifecycle/history readers;
 * shadow Truth action recommendations never authorize an operational action. */
async function prepareOperationalRead(tenant:RelationshipTenant) {
 const ctx=await relationshipContext(tenant),org=tenant.organisationId,asOf=new Date().toISOString(),now=Date.parse(asOf);
 const ledger=await readTenantHistory("relationship_identity_decisions",org,"*",["sequence"]) as IdentityLedgerRow[];
 const inventory=relationshipDiscoveryInventory({input:{lifecycle:ctx.input,founder:ctx.founder as TruthRow[],workspaces:ctx.workspaces as TruthRow[],links:ctx.links as TruthRow[],founderActivities:[],emailMessages:[],linkedinMessages:[],activities:[],tasks:[],acquisitionEvents:[],responseEvents:[]},policy:{organisationId:org,founderAllowed:ctx.canFounder,asOf},ledger});
 const stale=proactiveRetention(org,ctx.input,ctx.workspaces,ctx.links);
 const [self,rawInput]=await Promise.all([readOutreachSelfIdentity(org,tenant.userId),readLifecycleInput(org,false)]);
 const queue=linkedInOutreachQueue(org,ctx.input,now,"all",[],Infinity,self,stale);
 const responses=responseLifecycleMap(org,ctx.input,now),attention=responseAttention(org,ctx.input,responses);
 return {ctx,org,asOf,now,inventory,stale,rawInput,queue,responses,attention};
}
export async function readOperationalIntelligence(tenant: RelationshipTenant, locator: string, prepared?:Awaited<ReturnType<typeof prepareOperationalRead>>,helpers?:{history:typeof readTenantHistory;members:Record<string,unknown>[]}) {
    const state=prepared||await prepareOperationalRead(tenant);
    const {ctx,org,inventory,stale,rawInput,queue,responses,now}=state;
    const parsed = parseRelationshipLocator(locator);
    const requested: SourceRef[] = parsed.prefix === "workspace" ? ctx.links.filter(l => l.workspace_id === parsed.id).map(l => ({ table: l.source_table as SourceRef["table"], id: String(l.source_id) })) : [{ table: sourcePrefixes[parsed.prefix as keyof typeof sourcePrefixes], id: parsed.id }];
    const entries = inventory.entries.filter(e => e.refs.some(r => requested.some(s => r.table === s.table && r.id === s.id)));
    if (entries.length !== 1 || !requested.length)
        throw Error("Relationship identity requires review. Choose an exact source.");
    const identity = entries[0], established = identity.result.ambiguity.state === "established" || identity.result.reconciliationStatus === "confirmed";
    if (parsed.prefix === "workspace" && (!established || !requested.every(s => identity.refs.some(r => r.table === s.table && r.id === s.id))))
        throw Error("Relationship identity requires review. Choose an exact source.");
    const refs = established ? identity.refs : requested;
    const contains = (table: unknown, id: unknown) => refs.some(r => r.table === table && r.id === id);
    const input = { inbox_items: ctx.input.inbox_items.filter(r => contains("inbox_items", r.id)), growth_targets: ctx.input.growth_targets.filter(r => contains("growth_targets", r.id)), acquisition_items: ctx.input.acquisition_items.filter(r => contains("acquisition_items", r.id)) };
    const founder = ctx.founder.filter(r => contains("founder_research_records", r.id));
    // A workspace spanning unresolved/foreign canonical sources cannot widen the read.
    const workspaces = ctx.workspaces.filter(w => { const links = ctx.links.filter(l => l.workspace_id === w.id); return links.length && links.every(l => contains(l.source_table, l.source_id)); });
    const links = ctx.links.filter(l => workspaces.some(w => w.id === l.workspace_id));
    const scoped = { ...ctx, input, founder, workspaces, links, values: ctx.values.filter(v => workspaces.some(w => w.id === v.workspace_id)), items: projectRelationships(org, input, founder) };
    const data = await getRelationship(tenant, locator, false, scoped,helpers);
    const approvedResearch=ctx.canFounder&&data.workspace ? (await (helpers?.history||readTenantHistory)("founder_research_records",org)).filter(row=>{
        const saved=object(object(row.research_snapshot).phase2d),sources=Array.isArray(saved.sourceRefs)?saved.sourceRefs:[];
        return row.organisation_id===org&&row.saved===true&&row.linked_relationship_workspace_id===data.workspace?.id&&saved.verification==="matched_public"&&sources.length>0&&sources.every(value=>{const ref=object(value);return contains(ref.table,ref.id);});
    }):[];
    // Keep permission-visible company association controls separate from evidence expansion.
    data.companyOptions=ctx.workspaces.filter(w=>w.entity_kind==="company").map(w=>({id:w.id,label:ctx.items.find(r=>r.refs.some(ref=>ctx.links.some(l=>l.workspace_id===w.id&&l.source_id===ref.id&&l.source_table===ref.table)))?.name||"Company"}));
    if(data.workspace){const company=ctx.workspaces.find(w=>w.id===data.workspace?.id)?.related_company_id;data.workspace.related_company_id=ctx.workspaces.some(w=>w.id===company)?company:null;}
    const sourceEvents = input.inbox_items.filter(r => r.platform === "email" && typeof r.text === "string" && r.text.trim() ).map(r => ({ id: `source:${r.id}`, kind: "Stored inbound source snapshot; may overlap stored conversation; quoted text is not a separate outbound", channel: "Email", direction: "inbound", text: String(r.text), at: typeof r.created_at_platform === "string" ? r.created_at_platform : null, recordedAt: typeof r.inserted_at === "string" ? r.inserted_at : null, source: `inbox_items:${r.id}` }));
    data.history = chronologicalEvidence([...data.history.dated, ...data.history.undated, ...sourceEvents]);
    data.conversation = chronologicalEvidence([...data.conversation.dated, ...data.conversation.undated, ...sourceEvents]);
    const suppressionReason=proactiveSuppression(refs,stale);
    const eligible=queue.items.filter(i=>refs.some(r=>r.table===i.table&&r.id===i.id));
    const memory=relationshipMemory(data.history,now);
    const responseItems=refs.filter(r=>r.table==="inbox_items").flatMap(r=>{const v=responses.get(r.id);return v?[{id:r.id,...v}]:[];});
    const responseFollowUpEligible=responseItems.some(r=>r.currentStage==="follow_up"&&r.channel!=="linkedin"&&r.humanActionRequired&&r.canDraft);
    const replyNeeded=responseItems.some(r=>r.currentStage==="needs_reply"&&r.humanActionRequired&&r.actionItemId===r.id);
    const rawCadence = rawInput.growth_targets.filter(r => contains("growth_targets", r.id)).map(r => ({ source: { table: "growth_targets", id: r.id }, stage: r.stage,isFollowUp:cadenceDays[legacyCadenceStages[String(r.stage)]||String(r.stage)]>0,dateOnly:cadenceEvidence(r,now).receipt?.sent_time_precision==="date", lastActionAt: r.last_action_at, dueDate:growthFollowUpDueAt({...r,stage:typeof r.stage==="string"?r.stage:null,last_action_at:typeof r.last_action_at==="string"?r.last_action_at:null,reply_status:typeof r.reply_status==="string"?r.reply_status:null}) }));
    const sourceDetails = refs.flatMap(ref=>{
      const rows:Record<string,unknown>[]=ref.table==="founder_research_records"?founder:input[ref.table as keyof typeof input];
      const row=rows.find(r=>r.id===ref.id);if(!row)return [];
      const fields=Object.fromEntries(["role_title","company","email","phone","linkedin_identity","linkedin_url","website"].flatMap(key=>typeof row[key]==="string"&&String(row[key]).trim()?[[key,String(row[key]).slice(0,500)]]:[]));
      return [{source:ref,fields}];
    });
    return { ...data, approvedResearch, researchAccess:ctx.canFounder, sourceDetails, intelligence: { identity: { ...identity.result, sourceRefs: refs, workspaceRefs: workspaces.map(w => String(w.id)), humanReviewRequired: !established }, state: { lifecycleStage: data.relationship.stage, lifecycleLastAction: data.relationship.lastAction, retention: data.workspace?.retention || (suppressionReason ? "stale" : "active"), owner: data.workspace?.owner_user_id || data.relationship.owner, actionSource: data.relationship.operationalHref }, ...memory, notes: data.notes, tasks: data.tasks, actionability: { rawCadence, replyNeeded, responseFollowUpEligible, responseItems, linkedInActionSources:eligible.map(i=>({table:i.table,id:i.id})), projectedDueDate: data.relationship.nextDueDate, recordedDueReached: !!data.relationship.nextDueDate && Date.parse(data.relationship.nextDueDate) <= now, currentlyDue: !suppressionReason && (eligible.length > 0 || responseFollowUpEligible) && !!data.relationship.nextDueDate && Date.parse(data.relationship.nextDueDate) <= now, linkedInEligible: eligible.length > 0, suppressionReasons: suppressionReason ? [suppressionReason] : queue.audit.filter(a => a.eligibility !== "eligible" && Array.isArray(a.records) && a.records.some((r: {
                    table: string;
                    id: string;
                }) => contains(r.table, r.id))).map(a => String(a.eligibility)), otherGuardedAction: data.relationship.stage === "needs_reply" ? "Review inbound in Responses; existing reply governor applies" : "No additional action authorization established" }, uncertainty: [...identity.result.ambiguity.reasons, "Only linked stored conversations are included; quoted text is not a separate send receipt.", ...(data.history.undated.length ? ["Some relationship evidence has no actual event date."] : [])], provenance: refs.map(r => `${r.table}:${r.id}`) } };
}

/** Request-scoped composition: each source table/authority is read once, never N database scans.
 * No process cache or shared mutable tenant state. Ambiguous sources stay separate. */
export async function readOperationalCollection(tenant:RelationshipTenant) {
 const prepared=await prepareOperationalRead(tenant),cache=new Map<string,ReturnType<typeof readTenantHistory>>();
 const history:typeof readTenantHistory=(table,org,columns,order)=>{
  if(org!==tenant.organisationId)throw Error("Tenant scope mismatch");
  const key=JSON.stringify([table,columns||"*",order||null]);
  if(!cache.has(key))cache.set(key,readTenantHistory(table,org,columns,order));
  return cache.get(key)!;
 };
 const {data:members,error}=await supabaseAdmin.from("organisation_members").select("user_id,role").eq("organisation_id",tenant.organisationId).order("user_id");if(error)throw error;
 const locators=[...new Set(prepared.inventory.entries.flatMap(e=>{
  const established=e.result.ambiguity.state==="established"||e.result.reconciliationStatus==="confirmed";
  return (established?e.refs.slice(0,1):e.refs).map(r=>sourceLocator({table:r.table as SourceRef["table"],id:r.id}));
 }))];
 const records:Awaited<ReturnType<typeof readOperationalIntelligence>>[]=[];
 // Bound concurrency while sharing in-flight table reads.
 for(let offset=0;offset<locators.length;offset+=20)records.push(...await Promise.all(locators.slice(offset,offset+20).map(locator=>readOperationalIntelligence(tenant,locator,prepared,{history,members:members||[]}))));
 return {organisationId:tenant.organisationId,asOf:prepared.asOf,records,input:prepared.ctx.input,responseAttention:prepared.attention,linkedInFollowups:prepared.queue.items.filter(i=>i.mode==="followups").length};
}
