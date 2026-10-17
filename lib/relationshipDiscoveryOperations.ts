import type {TruthRef} from '@/lib/relationshipTruth';
import {findRelationships as findIdentities,relationshipDiscoveryInventory,type DiscoveryContext,type DiscoveryEntry,type RelationshipDiscoveryResult} from '@/lib/relationshipDiscovery';
import type {calculateValue} from '@/lib/relationshipValue';

export type CurrentRelationshipOperation={refs:TruthRef[];label:string;destination:string;stage:string;nextAction:string|null;nextDueDate:string|null;retention:string;workspaceExists:boolean;conflict:boolean;value:ReturnType<typeof calculateValue>|null};
export type PrimaryRelationshipResult=RelationshipDiscoveryResult&{operational:{state:'single'|'multiple'|'none';current:Omit<CurrentRelationshipOperation,'refs'|'conflict'>|null;choices:{label:string;destination:string}[]};emailCoverage:'verified_alias_recorded'|'not_established'};
const key=(r:TruthRef)=>r.table+':'+r.id;
function allowedDestination(value:string,result:RelationshipDiscoveryResult){
 if(!value.startsWith('/dashboard/growth/relationships/'))return false;
 const url=new URL(value,'https://ops.invalid'),tenant=new URL(result.destination,'https://ops.invalid').searchParams.get('organisationId');
 return /^\/dashboard\/growth\/relationships\/(inbox|target|acquisition|workspace)_[a-f0-9-]{36}$/i.test(url.pathname)&&url.searchParams.get('organisationId')===tenant&&[...url.searchParams.keys()].every(k=>k==='organisationId');
}

/** Attach current-system fields only; never choose an operational winner from Truth. */
function groupOperations(result:RelationshipDiscoveryResult,operations:CurrentRelationshipOperation[]){
 const matches=operations.filter(o=>o.workspaceExists||o.refs.some(r=>r.table!=='founder_research_records'));
 const destinations=new Map<string,CurrentRelationshipOperation>();
 for(const o of matches){if(!allowedDestination(o.destination,result))continue;const prior=destinations.get(o.destination);destinations.set(o.destination,prior?{...prior,refs:[...new Map([...prior.refs,...o.refs].map(r=>[key(r),r])).values()],conflict:prior.conflict||o.conflict||prior.stage!==o.stage||prior.nextAction!==o.nextAction||prior.nextDueDate!==o.nextDueDate||JSON.stringify(prior.value)!==JSON.stringify(o.value)}:o);}
 return [...destinations.values()];
}
export function attachRelationshipOperations(result:RelationshipDiscoveryResult,entry:DiscoveryEntry,operations:CurrentRelationshipOperation[],prepared?:CurrentRelationshipOperation[]):PrimaryRelationshipResult{
 const refs=new Set(entry.refs.map(key));
 const unique=(prepared||groupOperations(result,operations)).filter(o=>o.refs.some(r=>refs.has(key(r))));
 const safe=unique.filter(o=>!o.conflict&&o.refs.every(r=>refs.has(key(r))));
 const single=unique.length===1&&safe.length===1;
 const o=safe[0];
 const current=single?{label:o.label,destination:o.destination,stage:o.stage,nextAction:o.nextAction,nextDueDate:o.nextDueDate,retention:o.retention,workspaceExists:o.workspaceExists,value:o.value}:null;
 const choices=single?[]:unique.filter(o=>safe.includes(o)).map(o=>({label:o.label,destination:o.destination}));
 // Unsafe legacy groups must not route back through a workspace spanning other
 // canonical identities. Exact source destinations remain available for review.
 if(unique.some(o=>!safe.includes(o)))for(const choice of result.sourceChoices)choices.push({...choice});
 return {...result,operational:{state:single?'single':unique.length?'multiple':'none',current,choices:[...new Map(choices.map(c=>[c.destination,c])).values()]},emailCoverage:result.verifiedAliases.some(a=>a.type==='email')?'verified_alias_recorded':'not_established'};
}

/** Stable Finder-facing read-only contract, supplied with server-resolved operations. */
export function findRelationships(query:unknown,context:DiscoveryContext&{operations:CurrentRelationshipOperation[]},prepared=relationshipDiscoveryInventory(context)){
 const entries=new Map(prepared.entries.map(e=>[e.result.canonicalRelationshipId,e])),identities=findIdentities(query,context,prepared);
 const groups=identities.length?groupOperations(identities[0],context.operations):[],byRef=new Map<string,CurrentRelationshipOperation[]>();
 for(const o of groups)for(const ref of o.refs)byRef.set(key(ref),[...(byRef.get(key(ref))||[]),o]);
 const display=identities.flatMap(result=>{
  const entry=entries.get(result.canonicalRelationshipId)!;
  if(result.ambiguity.state==='established'||entry.refs.length===1||result.reconciliationStatus==='confirmed')return [{result,entry}];
  // Uncertain multi-source bundles are choices, not a settled canonical identity.
  // Unpack presentation only; the approved Truth partition itself is unchanged.
  return entry.refs.map((ref,index)=>{
   const scoped={...context.input,lifecycle:{inbox_items:context.input.lifecycle.inbox_items.filter(r=>ref.table==='inbox_items'&&r.id===ref.id),growth_targets:context.input.lifecycle.growth_targets.filter(r=>ref.table==='growth_targets'&&r.id===ref.id),acquisition_items:context.input.lifecycle.acquisition_items.filter(r=>ref.table==='acquisition_items'&&r.id===ref.id)},founder:context.input.founder.filter(r=>ref.table==='founder_research_records'&&r.id===ref.id),links:context.input.links.filter(l=>l.source_table===ref.table&&l.source_id===ref.id)};
   const single=relationshipDiscoveryInventory({...context,input:scoped,ledger:[]}).entries.find(e=>e.refs.some(r=>key(r)===key(ref)))!;
   return {entry:single,result:{...single.result,ambiguity:{...result.ambiguity,possibleRecords:Math.max(result.ambiguity.possibleRecords,entry.refs.length)},reconciliationStatus:result.reconciliationStatus,sourceChoices:result.sourceChoices[index]?[result.sourceChoices[index]]:[]}};
  });
 });
 return display.map(({result,entry})=>{const relevant=[...new Set(entry.refs.flatMap(r=>byRef.get(key(r))||[]))];return attachRelationshipOperations(result,entry,context.operations,relevant);});
}
