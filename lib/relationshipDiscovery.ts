import {visibleTruthInput,type TruthInput,type TruthPolicy,type TruthRef} from '@/lib/relationshipTruth';
import {identityDecisionPartition,truthWithIdentityDecisions} from '@/lib/relationshipIdentityReconciliation';
import {ledgerDecisions,type IdentityLedgerRow} from '@/lib/relationshipIdentityLedger';
import {relationshipIdentityPresentation} from '@/lib/relationshipIdentityPresentation';
import {projectRelationships,relationshipHref,type SourceRef} from '@/lib/relationshipWorkspace';
import {searchQuery} from '@/lib/opsSearch';
import {lifecycleLinkedInIdentity} from '@/lib/contactLifecycle';
import {sharedIdentityMailbox} from '@/lib/relationshipIdentityEnrichment';

export type RelationshipDiscoveryResult={
 canonicalRelationshipId:string;displayLabel:string;company:string|null;entityKind:'person'|'company'|'person_with_company'|'ambiguous';
 verifiedAliases:{type:'email'|'linkedin';value:string}[];
 ambiguity:{state:'established'|'not_fully_established';possibleRecords:number;reasons:string[]};
 reconciliationStatus:'confirmed'|'separated'|'unreviewed';
 destination:string;sourceCoverage:{count:number;channels:string[]};
 sourceChoices:{label:string;destination:string}[];
 recordedContacts:{name:string|null;verifiedEmail:string|null}[];
};
export type DiscoveryEntry={result:RelationshipDiscoveryResult;refs:TruthRef[];labels:string[]};
export type DiscoveryContext={input:TruthInput;policy:TruthPolicy;ledger:IdentityLedgerRow[];currentSearchRefs?:TruthRef[]};
const key=(r:TruthRef)=>r.table+':'+r.id;
const text=(v:unknown)=>typeof v==='string'?v.trim():'';
const object=(v:unknown):Record<string,unknown>=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:{};
const unique=(v:string[])=>[...new Set(v)].sort();
const tables=['inbox_items','growth_targets','acquisition_items'] as const;
const normal=(v:string)=>v.normalize('NFKC').toLowerCase();
const sourceDestination=(r:TruthRef,org:string)=>`${r.table==='acquisition_items'?'/dashboard/growth/acquisition':r.table==='growth_targets'?'/dashboard/growth/pipeline':r.table==='founder_research_records'?'/dashboard/founder-intelligence':'/dashboard/responses'}?organisationId=${encodeURIComponent(org)}&${r.table==='growth_targets'?'targetId':r.table==='founder_research_records'?'recordId':'itemId'}=${encodeURIComponent(r.id)}`;

/** Identity/discovery only. Never exports Truth operational conclusions or message bodies. */
export function relationshipDiscoveryInventory(ctx:DiscoveryContext){
 const safe=visibleTruthInput(ctx.input,ctx.policy),keys=new Set([...tables.flatMap(t=>safe.lifecycle[t].map(r=>t+':'+r.id)),...safe.founder.map(r=>'founder_research_records:'+r.id)]);
 const decisions=ledgerDecisions(ctx.ledger,ctx.policy).filter(d=>keys.has(key(d.sourceRefA))&&keys.has(key(d.sourceRefB)));
 const partition=identityDecisionPartition(safe,ctx.policy,decisions);
 const current=projectRelationships(ctx.policy.organisationId,safe.lifecycle,safe.founder);
 const possible=new Map<number,number>();
 for(const r of current){const groups=new Set(r.refs.map(ref=>partition.byRef.get(key(ref))).filter((i):i is number=>i!==undefined));if(groups.size>1)for(const i of groups)possible.set(i,Math.max(possible.get(i)||1,groups.size));}
 const entries:DiscoveryEntry[]=partition.groups.map((members,index)=>{
  const refs=members.map(k=>{const colon=k.indexOf(':');return {table:k.slice(0,colon),id:k.slice(colon+1)};});
  const included=new Set(members),anchor=refs[0];
  // Evaluate each already-established partition on its own sources. This avoids
  // rebuilding the full inventory per result and cannot borrow neighbouring text.
  const projected=partition.input;
  const subset:TruthInput={...projected,lifecycle:Object.fromEntries(tables.map(t=>[t,projected.lifecycle[t].filter(r=>included.has(t+':'+r.id))])) as TruthInput['lifecycle'],founder:projected.founder.filter(r=>included.has('founder_research_records:'+r.id))};
  const truth=truthWithIdentityDecisions(subset,anchor,ctx.policy,decisions,{...partition,input:subset});
  const p=relationshipIdentityPresentation(truth),emails=new Set(truth.verifiedAliases.filter(a=>a.value.type==='email').map(a=>a.value.value));
  const contacts=safe.founder.flatMap(f=>Array.isArray(f.contacts)?f.contacts.flatMap(c=>{const contact=object(c),address=text(contact.directEmail).toLowerCase(),verified=contact.emailStatus==='verified'&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address);
   // An authorised nested contact may explain an exact verified personal alias,
   // but does not add its parent company to this identity's source membership.
   if(!included.has('founder_research_records:'+f.id)&&(!verified||sharedIdentityMailbox(address)||!emails.has(address)))return [];
   return [{name:text(contact.name)||null,verifiedEmail:verified?address:null}];}):[]).filter(c=>c.name||c.verifiedEmail);
  const relevant=partition.activeDecisions.filter(d=>included.has(key(d.sourceRefA))||included.has(key(d.sourceRefB)));
  const separated=relevant.some(d=>d.decision==='keep_separate'),confirmed=relevant.some(d=>d.decision==='same_relationship'&&included.has(key(d.sourceRefA))&&included.has(key(d.sourceRefB)));
  const uncertain=(possible.get(index)||1)>1||p.name.disputed||p.entityShape.entity_kind==='ambiguous';
  const reasons=unique([...(possible.has(index)?['Current source association is not fully established in Truth.']:[]),...(p.name.disputed?['Recorded names disagree.']:[]),...(p.entityShape.ambiguity_reason?[p.entityShape.ambiguity_reason]:[])]);
  const label=p.name.value||p.name.alternatives.join(' / ')||p.company.value||'Identity not established';
  const aliases=[...new Map(truth.verifiedAliases.map(a=>[a.value.type+':'+a.value.value,{...a.value}])).values()];
  const result:RelationshipDiscoveryResult={canonicalRelationshipId:truth.relationshipId,displayLabel:label,company:p.company.value,entityKind:p.entityShape.entity_kind,
   verifiedAliases:aliases,ambiguity:{state:uncertain?'not_fully_established':'established',possibleRecords:Math.max(possible.get(index)||1,uncertain?refs.length:1),reasons},
   reconciliationStatus:separated?'separated':confirmed?'confirmed':'unreviewed',
   destination:uncertain?sourceDestination(anchor,ctx.policy.organisationId):relationshipHref(anchor as SourceRef,ctx.policy.organisationId),sourceCoverage:{count:refs.length,channels:unique(refs.map(r=>r.table==='founder_research_records'?'Founder':r.table==='acquisition_items'?'Acquisition':r.table==='growth_targets'?'Growth':'Inbox'))},recordedContacts:contacts,
   sourceChoices:refs.map(ref=>{const row=ref.table==='founder_research_records'?subset.founder.find(r=>r.id===ref.id):subset.lifecycle[ref.table as typeof tables[number]].find(r=>r.id===ref.id);return {label:text(row?.person)||text(row?.person_name)||text(row?.author_name)||text(row?.target_name)||text(row?.company)||'Recorded source',destination:sourceDestination(ref,ctx.policy.organisationId)};})};
  return {result,refs,labels:unique([...p.search.names,...p.search.companies,...p.search.emails,...p.search.linkedin,...refs.map(key),...truth.acceptedLocators,...contacts.flatMap(c=>[c.name||'',c.verifiedEmail||''])].filter(Boolean))};
 });
 return {entries,partition,readOnly:true as const};
}

/** Future Finder entry point. Search labels discover existing partitions; never union them. */
export function findRelationships(query:unknown,context:DiscoveryContext,prepared=relationshipDiscoveryInventory(context)){
 const raw=searchQuery(query),q=lifecycleLinkedInIdentity(raw)||raw,terms=q.split(/\s+/).filter(Boolean);
 const matched=new Set((context.currentSearchRefs||[]).map(key));
 const rank=(e:DiscoveryEntry)=>!q?4:e.result.verifiedAliases.some(a=>a.type==='email'&&normal(a.value)===q)?0:e.result.verifiedAliases.some(a=>a.type==='linkedin'&&normal(a.value)===q)?1:normal(e.result.displayLabel)===q||e.result.recordedContacts.some(c=>normal(c.name||'')===q)?2:3;
 return prepared.entries.filter(e=>terms.every(term=>normal(e.labels.join(' ')).includes(term))||e.refs.some(r=>matched.has(key(r)))).sort((a,b)=>rank(a)-rank(b)||a.result.displayLabel.localeCompare(b.result.displayLabel)||a.result.canonicalRelationshipId.localeCompare(b.result.canonicalRelationshipId)).map(e=>e.result);
}

/** Comparison is returned with the query, not persisted as telemetry or a priority engine. */
export function compareRelationshipDiscovery(inventory:ReturnType<typeof relationshipDiscoveryInventory>,matches:RelationshipDiscoveryResult[],currentMatches:{refs:TruthRef[]}[]){
 const ids=new Set(matches.map(r=>r.canonicalRelationshipId)),truth=inventory.entries.filter(e=>ids.has(e.result.canonicalRelationshipId));
 const overlaps=(a:TruthRef[],b:TruthRef[])=>a.some(r=>b.some(s=>key(r)===key(s)));
 return {currentSearchable:currentMatches.length,truthSearchable:matches.length,
  currentOnly:currentMatches.filter(c=>!truth.some(t=>overlaps(c.refs,t.refs))).length,
  truthOnly:truth.filter(t=>!currentMatches.some(c=>overlaps(c.refs,t.refs))).length,
  matching:truth.filter(t=>currentMatches.some(c=>overlaps(c.refs,t.refs))).length,
  ambiguous:matches.filter(r=>r.ambiguity.state!=='established').length,
  separated:matches.filter(r=>r.reconciliationStatus==='separated').length,
  reconciled:matches.filter(r=>r.reconciliationStatus==='confirmed').length};
}
