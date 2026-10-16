import type { RelationshipTruth, TruthRef, TruthRow } from "@/lib/relationshipTruth";
import type { DisagreementCategory } from "@/lib/relationshipTruthComparison";
import { relationshipIdentityPresentation } from "@/lib/relationshipIdentityPresentation";

/** Isolated review adapter. Not a UI/search implementation or an identity writer. */
export type ParityView = {
  id: string; refs: string[]; kind: string; linkedin: string[]; emails: string[];
  name: string | null; company: string | null; stage: string; actionable: string;
  nextAction: string | null; due: string | null; ambiguity: string[]; gaps: string[];
  nameProbes: string[]; companyProbes: string[]; emailProbes: string[]; linkedinProbes: string[];
  evidenceIds: string[]; uncertainDisplay: boolean;
  confirmedAnchorEvidenceIds?: string[]; timingEquivalent?: boolean;
};
export type ParityDifference = { field: string; current: unknown; shadow: unknown; classification: DisagreementCategory; reason: string; evidenceIds: string[] };
export const parityClassifications: DisagreementCategory[] = ["current_output_correct_shadow_wrong", "shadow_correct_current_output_wrong", "insufficient_evidence", "historical_evidence_gap", "identity_ambiguity"];
export const refKey = (r: TruthRef) => `${r.table}:${r.id}`;
export const uniqueStrings = (values: readonly unknown[]) => [...new Set(values.filter((v): v is string => typeof v === "string" && !!v.trim()).map(v => v.trim()))].sort();
const normal = (v: string) => v.normalize("NFKC").toLowerCase().replace(/_/g," ").replace(/\s+/g," ").trim();
const nullable = (v: string | null) => v ? normal(v) : null;
const eq = (a: unknown,b: unknown) => JSON.stringify(a)===JSON.stringify(b);
const cleanName = (v: string | null) => !!v && !/^(identity not established|stored research|unnamed contact)$/i.test(v);

export function shadowParityView(truth: RelationshipTruth): ParityView {
  const display=relationshipIdentityPresentation(truth);
  const named=uniqueStrings(truth.recordedFacts.filter(f=>["author_name","target_name","person","person_name"].includes(f.value.field)).map(f=>f.value.value));
  const nested=uniqueStrings(truth.relatedFounderContacts.map(c=>c.value.name));
  const companies=uniqueStrings(truth.recordedFacts.filter(f=>f.value.field==="company").map(f=>f.value.value));
  const name=display.name.value;
  const company=display.company.value;
  const linkedin=uniqueStrings(truth.verifiedAliases.filter(a=>a.value.type==="linkedin").map(a=>a.value.value));
  const emails=uniqueStrings(truth.verifiedAliases.filter(a=>a.value.type==="email").map(a=>a.value.value));
  return { id:truth.relationshipId,refs:truth.sourceRecords.map(refKey).sort(),kind:truth.entityKind,linkedin,emails,name,company,
    stage:truth.lifecycleStage.value,actionable:truth.actionableState.value,nextAction:truth.nextLegitimateAction.value,due:truth.dueDate.value,
    ambiguity:uniqueStrings(truth.contradictions.filter(c=>["identity_ambiguity","workspace_conflict","projection_identity_split"].includes(c.code)).map(c=>c.code)),
    gaps:uniqueStrings(truth.missingEvidence.filter(g=>!["coverage_not_established","partial_read"].includes(g.code)).map(g=>g.code)),
    nameProbes:uniqueStrings([...named,...nested,name]),companyProbes:companies,emailProbes:emails,linkedinProbes:linkedin,
    evidenceIds:uniqueStrings([...truth.sourceRecords.map(refKey),...truth.relatedFounderContacts.flatMap(f=>f.evidenceIds)]),uncertainDisplay:display.name.disputed||display.company.disputed };
}
export function currentActionable(stage:string,due:string|null,asOf:string) {
  return stage==="follow_up" ? due&&Date.parse(due)<=Date.parse(asOf)?"followup_due":"waiting" : stage==="researched"?"review":stage;
}
/** Baseline source alias facts, not a new association rule for any consumer. */
export function reviewVerifiedEmails(rows: TruthRow[]) {
  return uniqueStrings(rows.flatMap(r=>{
    const meta=(r.metadata||{}) as Record<string,unknown>;
    return [r.email_verified===true||meta.email_verification==="PASSED"?r.email||meta.email:null,
      r.platform==="email"&&r.email_message_id&&r.email_thread_id?r.sender_email:null];
  }).filter(v=>typeof v==="string"&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)).map(v=>String(v).toLowerCase()));
}
function classify(field:string,current:ParityView,shadow:ParityView,truth:RelationshipTruth): Pick<ParityDifference,"classification"|"reason"> {
  if(field==="source_membership"||field==="identity_ambiguity")return {classification:"identity_ambiguity",reason:"Association boundaries differ; no automatic join, split or repair is authorised."};
  if(field==="historical_evidence_gaps"&&shadow.gaps.length===1&&shadow.gaps[0]==="historical_outbound_incomplete"&&current.confirmedAnchorEvidenceIds?.length)return {classification:"current_output_correct_shadow_wrong",reason:"Existing validated cadence-anchor receipts establish outbound evidence that Phase 1 does not read."};
  if(field==="historical_evidence_gaps")return {classification:"historical_evidence_gap",reason:"Specific evidence coverage differs; missing history must not become a confirmed event."};
  if(["lifecycle_stage","actionable_state","next_action","due_date"].includes(field)) {
    if(truth.contradictions.some(c=>c.code==="cross_thread_closure"))return {classification:"insufficient_evidence",reason:"Closure and engagement have different thread scopes; disposition intent requires review."};
    if(truth.contradictions.some(c=>c.code==="followup_timing_disputed")&&current.timingEquivalent)return {classification:"current_output_correct_shadow_wrong",reason:"Dates normalise to the same instant; Phase 1 compared different timestamp string representations."};
    if(truth.contradictions.some(c=>c.code==="followup_timing_disputed"))return {classification:"shadow_correct_current_output_wrong",reason:"Inventory action/due presentation omits a confirmed-send chronology dispute; suppression remains correct."};
    if(truth.missingEvidence.some(g=>g.code==="historical_outbound_incomplete"))return {classification:"historical_evidence_gap",reason:"A contact/recording timestamp does not establish an actual historical send or due date."};
    if(current.stage==="researched"&&shadow.stage==="not_established")return {classification:"current_output_correct_shadow_wrong",reason:"An existing durable Founder research record establishes researched state; Phase 1 does not project this state."};
  }
  if(field.startsWith("discoverability_")&&!shadow.uncertainDisplay&&shadow.ambiguity.length===0&&eq(current.refs,shadow.refs))return {classification:"shadow_correct_current_output_wrong",reason:"Verified/attributed identity evidence supplies a missing discovery route on the same source membership; no person/company merge is needed."};
  if(["displayed_name","displayed_company"].includes(field)&&shadow.uncertainDisplay)return {classification:"insufficient_evidence",reason:"Multiple recorded display values exist; do not choose a name/company by source ordering."};
  if(field==="displayed_name"&&cleanName(current.name)&&!cleanName(shadow.name)&&eq(current.refs,shadow.refs))return {classification:"current_output_correct_shadow_wrong",reason:"Current display has a recorded name but the shadow review adapter cannot establish one; retain current output pending review."};
  if(field==="displayed_name"&&!cleanName(current.name)&&cleanName(shadow.name)&&truth.relatedFounderContacts.length>0)return {classification:"shadow_correct_current_output_wrong",reason:"Exact verified email supports permitted nested-contact name attribution, without merging its company entity."};
  return {classification:"insufficient_evidence",reason:"Difference alone does not establish either output as correct. Review source identity, field provenance and intended scope."};
}
export function compareInventoryParity(current:ParityView,truth:RelationshipTruth,currentMatches:(query:string)=>boolean,querySupported?:(query:string)=>boolean) {
  const shadow=shadowParityView(truth), differences:ParityDifference[]=[], checks:{field:string;agreement:boolean;known:boolean}[]=[];
  const compare=(field:string,a:unknown,b:unknown,known=true)=>{
    const agreement=eq(a,b);checks.push({field,agreement,known});
    if(!agreement)differences.push({field,current:a,shadow:b,...classify(field,current,shadow,truth),evidenceIds:uniqueStrings([...current.evidenceIds,...shadow.evidenceIds])});
  };
  compare("source_membership",current.refs,shadow.refs);
  compare("person_company",current.kind,shadow.kind);
  compare("canonical_linkedin",current.linkedin,shadow.linkedin,current.linkedin.length+shadow.linkedin.length>0);
  compare("verified_email_aliases",current.emails,shadow.emails,current.emails.length+shadow.emails.length>0);
  compare("displayed_name",nullable(current.name),nullable(shadow.name),cleanName(current.name)||cleanName(shadow.name));
  compare("displayed_company",nullable(current.company),nullable(shadow.company),!!current.company||!!shadow.company);
  compare("lifecycle_stage",current.stage,shadow.stage);
  compare("actionable_state",current.actionable,shadow.actionable);
  compare("next_action",nullable(current.nextAction),nullable(shadow.nextAction),!!current.nextAction||!!shadow.nextAction);
  compare("due_date",current.due,shadow.due,!!current.due||!!shadow.due);
  const facets=["name","company","email","linkedin"] as const;
  const unavailableFacets:string[]=[];
  const unassessedSearchProbes:{facet:string;reason:string}[]=[];
  for(const facet of facets){
    const property=`${facet}Probes` as "nameProbes"|"companyProbes"|"emailProbes"|"linkedinProbes";
    const eligible=uniqueStrings([...current[property],...shadow[property]]).filter(q=>q.length<=200);
    const probes=eligible.filter(q=>{if(!querySupported||querySupported(q))return true;unassessedSearchProbes.push({facet,reason:"Query terms absent from the captured source-search evidence."});return false;});
    if(!probes.length){unavailableFacets.push(facet);continue;}
    // Candidate discovery only. Search hits are never identity-association authority.
    const shadowTerms=uniqueStrings([shadow.name,shadow.company,...shadow.nameProbes,...shadow.companyProbes,...shadow.emails,...shadow.linkedin]);
    const shadowHay=shadowTerms.join(" ").normalize("NFKC").toLowerCase();
    const query=(q:string)=>q.trim().normalize("NFKC").toLowerCase();
    compare(`discoverability_${facet}`,probes.map(q=>({query:query(q),found:currentMatches(q)})),probes.map(q=>({query:query(q),found:query(q).split(/\s+/).every(t=>shadowHay.includes(t))})));
  }
  compare("identity_ambiguity",current.ambiguity,shadow.ambiguity);
  compare("historical_evidence_gaps",current.gaps,shadow.gaps);
  return {currentId:current.id,shadowId:truth.relationshipId,currentRefs:current.refs,shadowRefs:shadow.refs,currentHasActionOrDue:!!current.nextAction||!!current.due,checks,differences,unavailableFacets,shadow,
    newDiscovery:differences.some(d=>{
      if(!d.field.startsWith("discoverability_")||!Array.isArray(d.current)||!Array.isArray(d.shadow))return false;
      const before=d.current as {found:boolean}[],after=d.shadow as {found:boolean}[];
      return after.some((v,i)=>v.found&&!before[i]?.found);
    }),unassessedSearchProbes,readOnly:true};
}
export function summarizeInventoryParity(results:ReturnType<typeof compareInventoryParity>[]) {
  const counts=Object.fromEntries(parityClassifications.map(c=>[c,0])) as Record<DisagreementCategory,number>;
  let comparisons=0,agreements=0,knownComparisons=0,knownAgreements=0;
  const newlyDiscoverable=new Set<string>(),qualified=new Set<string>();
  for(const r of results){for(const c of r.checks){comparisons++;if(c.agreement)agreements++;if(c.known){knownComparisons++;if(c.agreement)knownAgreements++;}}
    for(const d of r.differences)counts[d.classification]++;
    if(r.newDiscovery)r.shadowRefs.forEach(ref=>newlyDiscoverable.add(ref));
    if(r.currentHasActionOrDue&&r.differences.some(d=>["actionable_state","next_action","due_date"].includes(d.field)&&["blocked","review","needs_text"].includes(r.shadow.actionable)))qualified.add(r.currentId);
  }
  return {relationshipsEvaluated:results.length,fieldComparisons:comparisons,agreements,differences:comparisons-agreements,agreementRate:comparisons?agreements/comparisons:null,
    knownComparisons,knownAgreements,knownAgreementRate:knownComparisons?knownAgreements/knownComparisons:null,disagreementCounts:counts,
    newlyDiscoverableRecordCount:newlyDiscoverable.size,qualifiedActionRelationshipCount:qualified.size,unavailableSearchFacetCount:results.reduce((s,r)=>s+r.unavailableFacets.length,0)};
}

/** Counts review boundaries, not authorised merges/splits. Missing refs are explicit refusals. */
export function identityParityMetrics(current:{id:string;refs:string[]}[],shadow:{id:string;refs:string[]}[]) {
  const byRef=new Map<string,Set<string>>(),currentByRef=new Map<string,Set<string>>();
  const shadowById=new Map(shadow.map(g=>[g.id,new Set(g.refs)]));
  for(const g of shadow)for(const ref of g.refs){const ids=byRef.get(ref)||new Set<string>();ids.add(g.id);byRef.set(ref,ids);}
  for(const g of current)for(const ref of g.refs){const ids=currentByRef.get(ref)||new Set<string>();ids.add(g.id);currentByRef.set(ref,ids);}
  const split=new Set<string>(),refused=new Set<string>(),pairs=new Set<string>();
  for(const g of current){
    const matches=new Set(g.refs.flatMap(ref=>[...(byRef.get(ref)||[])]));
    if(matches.size>1)split.add(g.id);
    if(![...matches].some(id=>g.refs.every(ref=>shadowById.get(id)?.has(ref))))refused.add(g.id);
    for(let i=0;i<g.refs.length;i++)for(let j=i+1;j<g.refs.length;j++){
      const a=byRef.get(g.refs[i]),b=byRef.get(g.refs[j]);
      if(a?.size&&b?.size&&![...a].some(id=>b.has(id)))pairs.add([g.refs[i],g.refs[j]].sort().join("|"));
    }
  }
  return {identitySplitCount:split.size,ambiguousJoinPairsWithheld:pairs.size,currentRelationshipsShadowRefusesToAssociate:refused.size,
    proposedShadowJoinCount:shadow.filter(g=>new Set(g.refs.flatMap(ref=>[...(currentByRef.get(ref)||[])])).size>1).length,
    shadowOverlappingMembershipCount:[...byRef.values()].filter(ids=>ids.size>1).length};
}

/** Query-preserving replay surrogate for this captured probe universe, never returned to a consumer. */
export function sourceSearchSurrogate(row:Record<string,unknown>,hits:readonly string[]) {
  const fields=["email","linkedin_identity","domain","website","notes","evidence","text","source_engine"];
  const existing=fields.find(k=>Object.prototype.hasOwnProperty.call(row,k));
  if(!existing&&hits.length)throw Error("No original searchable field available for calibration.");
  const copy={...row};for(const k of fields)delete copy[k];
  if(existing)copy[existing]=hits.join(" ");
  return copy;
}

/** Returns a SELECT for a human-controlled audit session. Never executes it. */
export function searchTokenEvidenceSelect(org:string,terms:readonly string[]) {
  if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(org))throw Error("Valid tenant UUID required.");
  if(terms.length>20000||terms.some(t=>typeof t!=="string"||!t||t.length>200))throw Error("Bounded identity search terms required.");
  const json=JSON.stringify(uniqueStrings(terms).map(t=>t.normalize("NFKC").toLowerCase()));
  let tag="$root_parity_terms$",i=0;while(json.includes(tag))tag=`$root_parity_${++i}$`;
  const tables=["inbox_items","growth_targets","acquisition_items","founder_research_records"];
  const sources=tables.map(t=>`select '${t}' src,to_jsonb(t) j from public.${t} t where organisation_id='${org}'`).join(" union all ");
  return `with r as (${sources}), corpus as materialized (select src||':'||(j->>'id') source,lower(normalize((select jsonb_object_agg(k,v)::text from jsonb_each(j) e(k,v) where k=any(array['email','linkedin_identity','domain','website','notes','evidence','text','source_engine'])),NFKC)) hay from r), terms as (select value term from jsonb_array_elements_text(${tag}${json}${tag}::jsonb)) select jsonb_object_agg(source,hits) search_hits from (select source,coalesce((select jsonb_agg(term order by term) from terms where strpos(coalesce(hay,''),term)>0),'[]'::jsonb) hits from corpus) s;`;
}
