import {readTenantHistory} from '@/lib/opsSearch.server';
import {listRelationships,relationshipListInventory,relationshipContext} from '@/lib/relationshipWorkspace.server';
import {relationshipDiscoveryInventory,findRelationships,compareRelationshipDiscovery,type RelationshipDiscoveryResult} from '@/lib/relationshipDiscovery';
import type {TruthInput,TruthRow} from '@/lib/relationshipTruth';
import type {IdentityLedgerRow} from '@/lib/relationshipIdentityLedger';
type Context=Awaited<ReturnType<typeof relationshipContext>>;
export type RelationshipDiscoveryPage={available:boolean;items:RelationshipDiscoveryResult[];total:number;page:number;comparison:ReturnType<typeof compareRelationshipDiscovery>|null;notice:string};
export type RelationshipsAugmented=ReturnType<typeof listRelationships>&{discovery:RelationshipDiscoveryPage};

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
