import type { RelationshipTruth, TruthRef } from "@/lib/relationshipTruth";
export type RelationshipEntityShape={
 entity_kind:'person'|'company'|'person_with_company'|'ambiguous';person_anchor:TruthRef|null;company_anchor:TruthRef|null;
 associated_company_refs:TruthRef[];person_source_refs:TruthRef[];company_source_refs:TruthRef[];
 classification_basis:{rule:string;evidenceIds:string[]}[];ambiguity_reason:string|null;
 aliases:RelationshipTruth['verifiedAliases'];identity_equivalence_authorised:false;
};
const normal=(v:string)=>v.normalize('NFKC').toLowerCase().replace(/\s+/g,' ').trim();
const established=(v:string)=>!!v.trim()&&!/^(unknown|not established|identity not established|unnamed contact|stored research|n\/a)$/i.test(v.trim());
/** Pure shape projection, not an identity join or a lifecycle/type mutation. */
export function relationshipEntityShape(truth:RelationshipTruth):RelationshipEntityShape {
 const companies=truth.recordedFacts.filter(f=>f.value.field==='company'&&established(f.value.value));
 const companyLabels=new Set(companies.map(f=>normal(f.value.value)));
 // Equality can veto a company label masquerading as a person, never establish identity.
 // Generic sender/target labels can name an organisation; legacy default "person" is not proof.
 const people=truth.recordedFacts.filter(f=>['person','person_name'].includes(f.value.field)&&established(f.value.value)&&!companyLabels.has(normal(f.value.value)));
 const profiles=truth.verifiedAliases.filter(a=>a.value.type==='linkedin'&&/^linkedin\.com\/in\//.test(a.value.value));
 const refsFor=(ids:string[])=>truth.sourceRecords.filter(r=>ids.includes(`${r.table}:${r.id}`)).sort((a,b)=>(a.table+':'+a.id).localeCompare(b.table+':'+b.id));
 const personRefs=refsFor([...people.flatMap(f=>f.evidenceIds),...profiles.flatMap(f=>f.evidenceIds)]);
 const companyRefs=refsFor(companies.flatMap(f=>f.evidenceIds));
 const person=people.length>0||profiles.length>0,company=companies.length>0;
 const conflict=profiles.length>0&&new Set(profiles.map(a=>a.value.value)).size>1;
 const separateCompanyRefs=companyRefs.filter(r=>!personRefs.some(p=>p.table===r.table&&p.id===r.id));
 const mixed=person&&separateCompanyRefs.length>0;
 const ambiguity=conflict?'Conflicting personal profile identities.':truth.entityKind==='company'&&person?'Company-typed source includes person evidence; an explicit association is required, not a person conversion.':mixed?'Person-specific and company-only source records require association review; they are not identity-equivalent.':!person&&!company?'No person-specific or explicit company evidence.':null;
 return {entity_kind:ambiguity?'ambiguous':person?company?'person_with_company':'person':'company',person_anchor:personRefs[0]||null,company_anchor:(separateCompanyRefs[0]||(!person?companyRefs[0]:null))||null,
  associated_company_refs:person?companyRefs:[],person_source_refs:personRefs,company_source_refs:companyRefs,
  classification_basis:[{rule:person?'recorded_person_fields_or_canonical_person_profile':'no_person_specific_evidence',evidenceIds:[...new Set([...people.flatMap(f=>f.evidenceIds),...profiles.flatMap(f=>f.evidenceIds)])].sort()},{rule:company?'explicit_company_fields_not_domain_inference':'no_company_evidence',evidenceIds:[...new Set(companies.flatMap(f=>f.evidenceIds))].sort()}],ambiguity_reason:ambiguity,aliases:truth.verifiedAliases,identity_equivalence_authorised:false};
}
