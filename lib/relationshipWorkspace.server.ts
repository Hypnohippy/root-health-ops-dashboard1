import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireFounderIntelligence } from "@/lib/founderIntelligenceAuth.server";
import { AccessError } from "@/lib/tenantAuth";
import { readLifecycleInput } from "@/lib/lifecycleSnapshot.server";
import { readTenantHistory } from "@/lib/opsSearch.server";
import { matchesSearch,searchQuery } from "@/lib/opsSearch";
import { projectRelationships,resolveProjection,matchingWorkspace,parseRelationshipLocator,object,words,type Row } from "@/lib/relationshipWorkspace";
import { calculateValue,pricingDefaults } from "@/lib/relationshipValue";
import { relationshipHistory } from "@/lib/relationshipHistory.server";
export type RelationshipTenant={organisationId:string;userId:string;role:string};
export async function founderAllowed(org:string) {try{await requireFounderIntelligence(org);return true;}catch(e){if(e instanceof AccessError&&e.status===403)return false;throw e;}}
const missing=(e:unknown)=>["42P01","PGRST205"].includes(String(object(e).code));
export async function relationshipContext(tenant:RelationshipTenant) {
 const org=tenant.organisationId,canFounder=await founderAllowed(org);
 const [input,founderRows]=await Promise.all([readLifecycleInput(org),canFounder?readTenantHistory("founder_research_records",org):Promise.resolve([])]);
 const founder=founderRows.filter(f=>f.organisation_id===org);
 let workspaces:Row[]=[],links:Row[]=[],models:Row[]=[],values:Row[]=[],storageAvailable=true;
 try{[workspaces,links,models,values]=await Promise.all(["relationship_workspaces","relationship_source_links","relationship_pricing_models","relationship_value_assessments"].map(t=>t==="relationship_source_links"?readTenantHistory(t,org,"*",["source_table","source_id"]):readTenantHistory(t,org)));}catch(e){if(!missing(e))throw e;storageAvailable=false;workspaces=[];links=[];models=[];values=[];}
 // Filter protected references before resolution/search; hidden Founder links never influence a Growth payload.
 if(!canFounder)links=links.filter(l=>l.source_table!=="founder_research_records");
 workspaces=workspaces.filter(w=>w.organisation_id===org);links=links.filter(l=>l.organisation_id===org);models=models.filter(m=>m.organisation_id===org);values=values.filter(v=>v.organisation_id===org);
 const items=projectRelationships(org,input,founder);
 const operationalWorkspace=(id:unknown)=>links.some(l=>l.workspace_id===id&&l.source_table!=="founder_research_records"&&items.some(r=>r.refs.some(ref=>ref.table===l.source_table&&ref.id===l.source_id)));
 workspaces=workspaces.filter(w=>canFounder||!w.founder_only||operationalWorkspace(w.id));
 if(!canFounder)values=values.filter(v=>!v.founder_only);
 links=links.filter(l=>workspaces.some(w=>w.id===l.workspace_id));
 return {tenant,input,founder,canFounder,items,workspaces,links,models,values,storageAvailable};
}
type Context=Awaited<ReturnType<typeof relationshipContext>>;
function selected(ctx:Context,locator:string) {
 const parsed=parseRelationshipLocator(locator);
 if(parsed.prefix==="founder"&&!ctx.canFounder)throw new AccessError("Founder access required.");
 if(parsed.prefix==="workspace") {const w=ctx.workspaces.find(w=>w.id===parsed.id);if(!w)throw new AccessError("Relationship not found.",404);}
 const relationship=resolveProjection(locator,ctx.items,ctx.links),id=matchingWorkspace(relationship.refs,ctx.links);
 const workspace=id?ctx.workspaces.find(w=>w.id===id)||null:null;
 return {relationship,workspace};
}
/** The same existing list projection, before pagination; read-only discovery comparison only. */
export function relationshipListInventory(ctx:Context,q:unknown,view:string) {
 const query=searchQuery(q);
 const items=ctx.items.flatMap(r=>{let id:string|null=null,conflict=false;try{id=matchingWorkspace(r.refs,ctx.links);}catch{conflict=true;}
 const w=ctx.workspaces.find(w=>w.id===id);
 const closed=["lost","converted","dismissed"].includes(r.stage);
 if(view==="active"&&((w?.retention==="archived"&&r.stage!=="needs_reply")||closed)||view==="archived"&&w?.retention!=="archived"||view==="stale"&&w?.retention!=="stale"||view==="closed"&&!closed)return[];
 const extra=r.refs.map(ref=>ref.table==="founder_research_records"?ctx.founder.find(f=>f.id===ref.id):ctx.input[ref.table].find(row=>row.id===ref.id)).filter(Boolean).map(row=>JSON.stringify(Object.fromEntries(["email","linkedin_identity","domain","website","notes","evidence","text","source_engine"].map(k=>[k,row?.[k]])))).join(" ");
 if(!matchesSearch({person:r.name,company:r.company,role_title:r.role},query,extra))return[];
 const latest=ctx.values.filter(v=>v.workspace_id===id).sort((a,b)=>String(b.recorded_at).localeCompare(String(a.recorded_at))||String(b.id).localeCompare(String(a.id)))[0];
 return [{...r,refs:undefined,founderIds:undefined,locator:id?`workspace_${id}`:r.locator,retention:String(w?.retention||"active"),conflict,value:latest?.result||null}];});
 return items;
}
export function listRelationships(ctx:Context,q:unknown,view:string,page:number) {
 if(!Number.isInteger(page)||page<0)throw Error("Invalid search page.");
 const items=relationshipListInventory(ctx,q,view);
 return {items:items.slice(page*25,page*25+25),total:items.length,page,storageAvailable:ctx.storageAvailable};
}
export async function getRelationship(tenant:RelationshipTenant,locator:string, exactSource = false, prepared?:Context) {
 const ctx=prepared || await relationshipContext(tenant);
 if (exactSource) {
  const parsed=parseRelationshipLocator(locator);
  if (!["inbox", "target", "acquisition"].includes(parsed.prefix)) throw new AccessError("Record unavailable.",404);
  const table=({inbox:"inbox_items",target:"growth_targets",acquisition:"acquisition_items"} as const)[parsed.prefix as "inbox"|"target"|"acquisition"];
  const row=ctx.input[table].find(r=>r.id===parsed.id&&r.organisation_id===tenant.organisationId);
  if(!row)throw new AccessError("Record unavailable.",404);
  // Scope BEFORE projection/history: explicit record selection is not identity authority.
  ctx.input={inbox_items:[],growth_targets:[],acquisition_items:[],[table]:[row]};
  ctx.founder=[];ctx.links=[];ctx.workspaces=[];ctx.values=[];
  ctx.items=projectRelationships(tenant.organisationId,ctx.input,[]);
 }
 const {relationship,workspace}=selected(ctx,locator),id=workspace?.id;
 const [allEvents,allTasks]=id?await Promise.all([readTenantHistory("relationship_activity_events",tenant.organisationId),readTenantHistory("relationship_tasks",tenant.organisationId)]):[[],[]];
 const visible=(r:Row)=>r.workspace_id===id&&(!r.organisation_id||r.organisation_id===tenant.organisationId)&&(ctx.canFounder||!r.founder_only);
 const events=allEvents.filter(visible),tasks=allTasks.filter(visible);
 // Do not return raw workspace metadata (private creator/timestamps or a protected company link).
 const publicWorkspace=workspace?{id:workspace.id,revision:workspace.revision,retention:workspace.retention,owner_user_id:workspace.owner_user_id,related_company_id:ctx.workspaces.some(w=>w.id===workspace.related_company_id)?workspace.related_company_id:null}:null;
 const evidence=await relationshipHistory(tenant.organisationId,relationship,ctx.input,ctx.founder,events);
 const assessment=ctx.values.filter(v=>v.workspace_id===id).sort((a,b)=>String(b.recorded_at).localeCompare(String(a.recorded_at))||String(b.id).localeCompare(String(a.id)))[0]||null;
 const model=ctx.models.find(m=>m.is_default)||null;
 const {data:members,error:memberError}=await supabaseAdmin.from("organisation_members").select("user_id,role").eq("organisation_id",tenant.organisationId).order("user_id");if(memberError)throw memberError;
 return {relationship,workspace:publicWorkspace,storageAvailable:ctx.storageAvailable,conversation:evidence.conversation,history:evidence.history,notes:events.filter(e=>e.activity_type==="note"),tasks,assessment,pricingDefaults:pricingDefaults(model),pricingChanged:!!assessment&&(object(assessment.input).pricingModelId||null)!==(model?.id||null),canSetPricing:["owner","admin"].includes(tenant.role.toLowerCase()),actor:tenant.userId,members:(members||[]).map((m:{user_id:string;role:string})=>({id:m.user_id,role:m.role})),founder:ctx.canFounder?ctx.founder.filter(f=>relationship.founderIds.includes(String(f.id))):[],companyOptions:ctx.workspaces.filter(w=>w.entity_kind==="company").map(w=>({id:w.id,label:ctx.items.find(r=>r.refs.some(ref=>ctx.links.some(l=>l.workspace_id===w.id&&l.source_id===ref.id&&l.source_table===ref.table)))?.name||"Company"})),pipelineValues:relationship.refs.filter(r=>r.table==="growth_targets").flatMap(r=>ctx.input.growth_targets.filter(t=>t.id===r.id&&t.deal_value!=null).map(t=>({targetId:t.id,value:t.deal_value,label:"Recorded pipeline deal value; not subscription revenue"})))};
}
export async function saveRelationship(tenant:RelationshipTenant,locator:string,body:Row) {
 if(!/^[a-f0-9-]{36}$/i.test(words(body.key)))throw Error("A stable action key is required.");
 const ctx=await relationshipContext(tenant),{relationship,workspace}=selected(ctx,locator);
 if(!ctx.storageAvailable)throw Error("Relationship storage is not enabled yet. Your text has been retained.");
 if(body.confirmed!==true)throw Error("Explicit confirmation is required.");
 const action=words(body.action),details=object(body.details);
 if(["note","activity"].includes(action)) {
  if(typeof details.message!=="string"||!details.message.trim()||details.message.length>500000)throw Error("Enter the exact note or activity details.");
  if(details.timeChoice!=="now"&&details.occurredAt!=null&&details.occurredAt!=="") {if(!/(Z|[+-]\d{2}:\d{2})$/.test(String(details.occurredAt))||!Number.isFinite(Date.parse(String(details.occurredAt)))||Date.parse(String(details.occurredAt))>Date.now())throw Error("Use a valid actual activity time, not a future date.");}
 }
 let computed={...details};
 if(action==="activity")computed.confirmed=true;
 if(action==="value") {
  if(details.saveTenantDefault===true&&relationship.founderIds.length)throw new AccessError("Founder-protected pricing cannot become a shared tenant default.");
  if(details.saveTenantDefault===true&&!["owner","admin"].includes(tenant.role.toLowerCase()))throw new AccessError("Only owner/admin may change tenant pricing.");
  const raw={...object(details.input)},pricingId=words(raw.pricingModelId);
  if(pricingId&&!ctx.models.some(m=>m.id===pricingId))throw Error("Pricing configuration is not available in this organisation.");
  if(pricingId)raw.pricingVersion=ctx.models.find(m=>m.id===pricingId)!.version;
  const calculation=calculateValue(raw),model=ctx.models.find(m=>m.id===pricingId),defaults=object(model?.config);
  const overrides=model?Object.fromEntries(["method","currency","standardRate","discountPercent","sharePercent","priceSource"].filter(k=>JSON.stringify(object(calculation.input)[k]??null)!==JSON.stringify(defaults[k]??null)).map(k=>[k,{standard:defaults[k]??null,override:object(calculation.input)[k]??null}])):{};
  computed={calculation:{...calculation,pricingOverrides:overrides},saveTenantDefault:details.saveTenantDefault===true};
 }
 const {data,error}=await supabaseAdmin.rpc("apply_relationship_workspace_action",{p_org:tenant.organisationId,p_actor:tenant.userId,p_refs:relationship.refs,p_kind:relationship.kind,p_founder:ctx.canFounder,p_workspace:workspace?.id||null,p_revision:body.revision??null,p_key:body.key,p_action:action,p_details:computed,p_request:{locator,...body}});
 if(error)throw Error(words(error.message)||"Relationship was not saved. Retry safely.");
 return {...object(data),href:`/dashboard/growth/relationships/workspace_${object(data).workspaceId}?organisationId=${tenant.organisationId}`};
}
