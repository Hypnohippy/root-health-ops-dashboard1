import type { RelationshipTruth } from "@/lib/relationshipTruth";

export type IdentityField = {value:string|null; alternatives:string[]; evidenceIds:string[]; rule:string; disputed:boolean};
const norm=(s:string)=>s.normalize('NFKC').trim().replace(/\s+/g,' ').toLowerCase();
/** Shadow-only display/index policy. Display precedence never authorises an identity join. */
export function relationshipIdentityPresentation(truth:RelationshipTruth) {
 const select=(fields:string[],rule:string):IdentityField=>{
  const facts=truth.recordedFacts.filter(f=>fields.includes(f.value.field));
  const groups=new Map<string,typeof facts>();
  for(const f of facts){const k=norm(f.value.value);if(k)groups.set(k,[...(groups.get(k)||[]),f]);}
  const alternatives=[...groups.values()].map(fs=>fs.map(f=>f.value.value.trim()).sort()[0]).sort();
  // Equally authoritative conflicting facts remain alternatives. No row-order or timestamp winner.
  return {value:alternatives.length===1?alternatives[0]:null,alternatives,evidenceIds:[...new Set(facts.flatMap(f=>f.evidenceIds))].sort(),rule,disputed:alternatives.length>1};
 };
 const company=select(['company'],'recorded_company_consensus');
 let name=select(truth.entityKind==='company'?['company']:['author_name','target_name','person','person_name'],'typed_entity_recorded_name_consensus');
 if(!name.alternatives.length&&truth.entityKind==='person'){
  const contacts=truth.relatedFounderContacts.filter(c=>c.value.name);
  const names=[...new Set(contacts.map(c=>c.value.name!.trim()))].sort();
  name={value:names.length===1?names[0]:null,alternatives:names,evidenceIds:[...new Set(contacts.flatMap(c=>c.evidenceIds))].sort(),rule:'verified_nested_contact_attribution_only',disputed:names.length>1};
 }
 const role=select(['role_title'],'recorded_role_consensus_no_inference');
 const alias=(type:'email'|'linkedin'):IdentityField=>{
  const values=truth.verifiedAliases.filter(a=>a.value.type===type);
  const alternatives=[...new Set(values.map(a=>a.value.value))].sort();
  return {value:alternatives.length===1?alternatives[0]:null,alternatives,evidenceIds:[...new Set(values.flatMap(a=>a.evidenceIds))].sort(),rule:type==='email'?'unique_verified_email_only_no_recency_preference':'unique_canonical_linkedin_only',disputed:alternatives.length>1};
 };
 const email=alias('email'),linkedin=alias('linkedin');
 return {name,company,role,primaryEmail:email,linkedin,sourceRefs:truth.sourceRecords,
  search:{names:name.alternatives,companies:company.alternatives,roles:role.alternatives,emails:email.alternatives,linkedin:linkedin.alternatives},
  rule:'permission_filtered_confirmed_members_only; alternatives_are_search_labels_not_join_authority'};
}
