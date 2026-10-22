import { operationalSearchSummary } from "@/lib/operationalIntelligence";
import {readTenantHistory} from '@/lib/opsSearch.server';
import {listRelationships,relationshipListInventory,relationshipContext} from '@/lib/relationshipWorkspace.server';
import {relationshipDiscoveryInventory,findRelationships,compareRelationshipDiscovery,type RelationshipDiscoveryResult} from '@/lib/relationshipDiscovery';
import type {TruthInput,TruthRow} from '@/lib/relationshipTruth';
import type {IdentityLedgerRow} from '@/lib/relationshipIdentityLedger';
import {findRelationships as findPrimaryRelationships,type CurrentRelationshipOperation,type PrimaryRelationshipResult} from '@/lib/relationshipDiscoveryOperations';
type Context=Awaited<ReturnType<typeof relationshipContext>>;
export type RelationshipDiscoveryPage={available:boolean;items:RelationshipDiscoveryResult[];total:number;page:number;comparison:ReturnType<typeof compareRelationshipDiscovery>|null;notice:string};
export type RelationshipsAugmented=ReturnType<typeof listRelationships>&{discovery:RelationshipDiscoveryPage};
export type PrimaryRelationshipsPage={items:PrimaryRelationshipResult[];total:number;page:number;storageAvailable:boolean;available:boolean;notice:string;comparison:ReturnType<typeof compareRelationshipDiscovery>|null;operationalAmbiguity:number};

/** Primary identity discovery, with current-system operations attached separately. */
export async function listPrimaryRelationships(ctx:Context,q:unknown,view:string,page:number):Promise<PrimaryRelationshipsPage>{
 // Retains existing validation, permissions and retention semantics.
 const current=listRelationships(ctx,q,view,page);
 const ledger=await readTenantHistory('relationship_identity_decisions',ctx.tenant.organisationId,'*',['sequence']) as IdentityLedgerRow[];
 const input:TruthInput={lifecycle:ctx.input,founder:ctx.founder as TruthRow[],workspaces:ctx.workspaces as TruthRow[],links:ctx.links as TruthRow[],founderActivities:[],emailMessages:[],linkedinMessages:[],activities:[],tasks:[],acquisitionEvents:[],responseEvents:[]};
 const policy={organisationId:ctx.tenant.organisationId,founderAllowed:ctx.canFounder,asOf:new Date().toISOString()};
 const inventory=relationshipDiscoveryInventory({input,policy,ledger}),allVisible=relationshipListInventory(ctx,'',view),currentMatches=relationshipListInventory(ctx,q,view);
 const forRow=(r:Context['items'][number],row:typeof allVisible[number])=>row.locator===r.locator||ctx.links.some(l=>row.locator==='workspace_'+l.workspace_id&&r.refs.some(ref=>ref.table===l.source_table&&ref.id===l.source_id));
 const visible=ctx.items.filter(r=>allVisible.some(row=>forRow(r,row))),currentSources=ctx.items.filter(r=>currentMatches.some(row=>forRow(r,row)));
 const visibleRefs=new Set(visible.flatMap(r=>r.refs.map(ref=>ref.table+':'+ref.id)));
 const scoped={...inventory,entries:inventory.entries.filter(e=>e.refs.some(ref=>visibleRefs.has(ref.table+':'+ref.id)))};
 const matches=findRelationships(q,{input,policy,ledger},scoped);
 const operations:CurrentRelationshipOperation[]=allVisible.flatMap(row=>ctx.items.filter(r=>forRow(r,row)).map(r=>({refs:r.refs,label:row.name,destination:`/dashboard/growth/relationships/${row.locator}?organisationId=${encodeURIComponent(ctx.tenant.organisationId)}`,stage:row.stage,nextAction:row.nextAction,nextDueDate:row.nextDueDate,retention:row.retention,workspaceExists:row.locator.startsWith('workspace_'),conflict:row.conflict,value:row.value as CurrentRelationshipOperation['value']})));
 const items=findPrimaryRelationships(q,{input,policy,ledger,currentSearchRefs:currentSources.flatMap(r=>r.refs),operations},scoped);
 const events=items.length?await readTenantHistory('relationship_activity_events',ctx.tenant.organisationId):[];
 const pageItems=items.slice(page*25,page*25+25).map(item=>({...item,intelligenceSummary:operationalSearchSummary(ctx.tenant.organisationId,item.sourceSummary||[],ctx.workspaces,ctx.links,events,ctx.canFounder)}));
 return {items:pageItems,total:items.length,page,storageAvailable:current.storageAvailable,available:true,notice:'People and companies from your recorded relationships.',comparison:compareRelationshipDiscovery(scoped,matches,currentSources),operationalAmbiguity:items.filter(r=>r.operational.state==='multiple').length};
}

/** Read-only ledger consumption is independent of the decision-writing feature gate. */
export async function listRelationshipsWithDiscovery(ctx:Context,q:unknown,view:string,page:number):Promise<RelationshipsAugmented>{
 const current=listRelationships(ctx,q,view,page);
 try{
  const ledger=await readTenantHistory('relationship_identity_decisions',ctx.tenant.organisationId,'*',['sequence']) as IdentityLedgerRow[];
  const input:TruthInput={lifecycle:ctx.input,founder:ctx.founder as TruthRow[],workspaces:ctx.workspaces as TruthRow[],links:ctx.links as TruthRow[],founderActivities:[],emailMessages:[],linkedinMessages:[],activities:[],tasks:[],acquisitionEvents:[],responseEvents:[]};
  const context={input,policy:{organisationId:ctx.tenant.organisationId,founderAllowed:ctx.canFounder,asOf:new Date().toISOString()},ledger};
  const inventory=relationshipDiscoveryInventory(context);
  // Keep the current retention filter authoritative for visibility, while search
  // remains augmented. Existing current results are never removed or rewritten.
  const allVisible=relationshipListInventory(ctx,'',view);
  const visibleLocators=new Set(allVisible.map(r=>r.locator));
  const visibleRefs=new Set(ctx.items.filter(r=>visibleLocators.has(r.locator)||r.refs.some(ref=>ctx.links.some(l=>l.source_table===ref.table&&l.source_id===ref.id&&visibleLocators.has('workspace_'+l.workspace_id)))).flatMap(r=>r.refs.map(ref=>ref.table+':'+ref.id)));
  const scoped={...inventory,entries:inventory.entries.filter(e=>e.refs.some(ref=>visibleRefs.has(ref.table+':'+ref.id)))};
  const matches=findRelationships(q,context,scoped);
  const currentMatches=relationshipListInventory(ctx,q,view);
  const currentLocators=new Set(currentMatches.map(r=>r.locator));
  const currentSources=ctx.items.filter(r=>currentLocators.has(r.locator)||r.refs.some(ref=>ctx.links.some(l=>l.source_table===ref.table&&l.source_id===ref.id&&currentLocators.has('workspace_'+l.workspace_id))));
  return {...current,discovery:{available:true,items:matches.slice(page*25,page*25+25),total:matches.length,page,comparison:compareRelationshipDiscovery(scoped,matches,currentSources),notice:'Read-only identity discovery. Existing actions and relationship state are unchanged.'}};
 }catch{
  // A missing ledger/schema or an identity conflict must not hide current results.
  return {...current,discovery:{available:false,items:[],total:0,page,comparison:null,notice:'Additional identity discovery is unavailable. Existing Relationships search remains available.'}};
 }
}
