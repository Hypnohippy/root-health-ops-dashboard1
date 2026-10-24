import { relationshipDiscoveryInventory,type DiscoveryContext,type DiscoveryEntry } from "@/lib/relationshipDiscovery";
import { identitySourceFacts } from "@/lib/relationshipIdentityEvidence";
import { sharedIdentityMailbox } from "@/lib/relationshipIdentityEnrichment";
import { visibleTruthInput,type TruthRef,type TruthRow } from "@/lib/relationshipTruth";

export type IntakeDecision={decision:"ESTABLISHED_EXISTING"|"NEW_IDENTITY"|"REVIEW_REQUIRED";creationPermitted:boolean;readOnly:true;reason:string;canonicalId:string|null;destination:string|null;workspaceId:string|null;sourceRefs:TruthRef[];researchRecordIds:string[];candidates:{label:string;destination:string;reason:string;sourceCount:number;refs:TruthRef[]}[];sourceType:string};
const key=(r:TruthRef)=>r.table+":"+r.id;
const normal=(v:unknown)=>typeof v==="string"?v.normalize("NFKC").trim().toLowerCase().replace(/\s+/g," "):"";
const probeId="00000000-0000-4000-8000-000000000000";
/** Read-only preflight. Only the existing identity partition can establish a match.
 * Labels, domains and unverified email can find review candidates, never join them. */
export function resolveRelationshipIntake(context:DiscoveryContext,proposal:{entityKind:"person"|"company";sourceType:string;row:TruthRow;sourceRef?:TruthRef}):IntakeDecision {
 const org=context.policy.organisationId,safe=visibleTruthInput(context.input,context.policy),inventory=relationshipDiscoveryInventory({...context,input:safe});
 if(proposal.row.organisation_id!==org)throw Error("Intake tenant scope mismatch.");
 const result=(decision:IntakeDecision["decision"],reason:string,entry?:DiscoveryEntry,candidates:DiscoveryEntry[]=[]):IntakeDecision=>{
  const refs=entry?.refs||[],ids=new Set(refs.map(key)),workspaceIds=[...new Set(safe.links.filter(l=>ids.has(String(l.source_table)+":"+l.source_id)).map(l=>String(l.workspace_id)))];
  const workspace=workspaceIds.length===1&&safe.links.filter(l=>l.workspace_id===workspaceIds[0]).every(l=>ids.has(String(l.source_table)+":"+l.source_id))?workspaceIds[0]:null;
  return {decision,creationPermitted:decision==="NEW_IDENTITY",readOnly:true,reason,canonicalId:entry?.result.canonicalRelationshipId||null,destination:workspace?`/dashboard/growth/relationships/workspace_${workspace}?organisationId=${encodeURIComponent(org)}`:entry?.result.destination||null,workspaceId:workspace,sourceRefs:refs.map(r=>({...r})),researchRecordIds:refs.filter(r=>r.table==="founder_research_records").map(r=>r.id),candidates:candidates.slice(0,10).map(e=>({label:e.result.displayLabel,destination:e.result.destination,reason:e.result.ambiguity.reasons.join(" ")||"Possible source association only; no identity established.",sourceCount:e.refs.length,refs:e.refs.map(ref=>({...ref}))})),sourceType:proposal.sourceType};
 };
 if(proposal.sourceRef){const entry=inventory.entries.find(e=>e.refs.some(r=>key(r)===key(proposal.sourceRef!)));if(!entry)throw Error("Intake source unavailable.");return result(entry.result.ambiguity.state==="established"?"ESTABLISHED_EXISTING":"REVIEW_REQUIRED","Existing exact source; no new source or workspace created.",entry,[entry]);}
 const ref={table:"acquisition_items",id:probeId};
 if(safe.lifecycle.acquisition_items.some(r=>r.id===probeId))return result("REVIEW_REQUIRED","Candidate preflight unavailable; no creation authorised.");
 const row:TruthRow={...proposal.row,id:probeId,entity_kind:proposal.entityKind,record_type:proposal.entityKind==="company"?"b2b_lead":"partner_opportunity"};
 const extended={...safe,lifecycle:{...safe.lifecycle,acquisition_items:[...safe.lifecycle.acquisition_items,row]}};
 const augmented=relationshipDiscoveryInventory({...context,input:extended}),partition=augmented.partition,proposedGroup=augmented.entries.find(e=>e.refs.some(r=>key(r)===key(ref)));
 const group=partition.groups[partition.byRef.get(key(ref))!],peers=new Set(group.filter(k=>k!==key(ref)));
 const matched=inventory.entries.filter(e=>e.refs.some(r=>peers.has(key(r))));
 const f=identitySourceFacts(ref,row),aliases=[...f.profiles,...f.emails.filter(e=>!sharedIdentityMailbox(e))];
 if(matched.length===1&&aliases.length){const entry=matched[0],other=entry.result.verifiedAliases,profiles=[...new Set([...f.profiles,...other.filter(a=>a.type==="linkedin").map(a=>a.value)])];
  const personalMatch=f.profiles.some(p=>other.some(a=>a.type==="linkedin"&&a.value===p))||f.emails.some(e=>!sharedIdentityMailbox(e)&&other.some(a=>a.type==="email"&&a.value===e));
  if(personalMatch&&profiles.length<=1&&entry.result.ambiguity.state==="established"&&proposedGroup?.result.ambiguity.state==="established")return result("ESTABLISHED_EXISTING","Existing policy establishes an exact recorded alias match. Use the existing relationship; no source was saved.",entry);
 }
 const rows:Record<string,TruthRow[]>={...safe.lifecycle,founder_research_records:safe.founder};
 const names=[row.person,row.person_name,row.author_name,row.target_name].map(normal).filter(Boolean),company=normal(row.company),email=normal(row.email),website=normal(row.website);
 const possible=inventory.entries.filter(e=>e.refs.some(r=>{const old=rows[r.table]?.find(v=>v.id===r.id);if(!old)return false;const n=[old.person,old.person_name,old.author_name,old.target_name].map(normal);return names.some(x=>n.includes(x))||company&&normal(old.company)===company||email&&[old.email,old.sender_email].map(normal).includes(email)||website&&normal(old.website)===website;}));
 const candidates=[...new Map([...matched,...possible].map(e=>[e.result.canonicalRelationshipId,e])).values()];
 if(candidates.length)return result("REVIEW_REQUIRED","Possible existing relationship found. Review the exact sources or cancel; similarity/public research is not identity authority.",undefined,candidates);
 return result("NEW_IDENTITY","No established match or visible review candidate found. Existing domain creation may proceed; no write has occurred.");
}
