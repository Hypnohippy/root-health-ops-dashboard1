import { lifecycleLinkedInIdentity } from "@/lib/contactLifecycle";
import { relationshipTruth, visibleTruthInput, type TruthInput, type TruthPolicy, type TruthRef, type TruthRow } from "@/lib/relationshipTruth";

/** Evidence contract only. No identity table, write capability, consumer or fuzzy matcher. */
export type RelationshipIdentityEvidence = {
  sourceRefs: TruthRef[];
  alias: { type: "linkedin" | "email" | "source_ref" | "gmail_thread" | "founder_contact"; value: string } | null;
  verificationBasis: string;
  evidenceIds: string[];
  confidenceClass: "deterministic" | "human_reconciliation" | "separate";
  ambiguityReason: string | null;
  humanReviewRequired: boolean;
};
export type MissingIdentityBridge = "canonical_linkedin_identity_absent" | "verified_email_absent" | "explicit_source_reference_absent" | "founder_nested_contact_only" | "gmail_thread_linkage_absent" | "conflicting_aliases" | "historical_record_shape" | "other";
export type IdentityPairReview = RelationshipIdentityEvidence & { pairId: string; missingBridge: MissingIdentityBridge; missingBridges: MissingIdentityBridge[]; resolvedInShadow: boolean };
const object = (v: unknown): Record<string, unknown> => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};
const text = (v: unknown) => typeof v === "string" ? v.trim() : "";
const key = (r: TruthRef) => `${r.table}:${r.id}`;
const mail = (v: unknown) => /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(text(v)) ? text(v).toLowerCase() : null;
const uniq = (v: string[]) => [...new Set(v)].sort();
const tables = ["inbox_items", "growth_targets", "acquisition_items"] as const;
export const missingIdentityBridges: MissingIdentityBridge[] = ["canonical_linkedin_identity_absent","verified_email_absent","explicit_source_reference_absent","founder_nested_contact_only","gmail_thread_linkage_absent","conflicting_aliases","historical_record_shape","other"];
export function identityNodes(input: TruthInput, policy: TruthPolicy) {
  const scoped = visibleTruthInput(input, policy);
  return [...tables.flatMap(table => scoped.lifecycle[table].map(row => ({ ref: { table, id: row.id }, row }))), ...scoped.founder.map(row => ({ ref: { table: "founder_research_records", id: row.id }, row }))];
}
function company(table: string, r: TruthRow) { return r.entity_kind === "company" || table === "acquisition_items" && !r.person && !!r.company && r.record_type === "b2b_lead"; }
function profiles(table: string, r: TruthRow) {
  const meta=object(r.metadata), raw=object(r.raw), rm=object(raw.metadata), engine=object(r.engine_state);
  return uniq([r.linkedin_identity,r.linkedin_url,raw.profile_url,raw.linkedin_url,rm.profile_url,rm.linkedin_url,meta.profile_url,meta.linkedin_url,engine.linkedin_identity,table==="acquisition_items"?r.source_url:null,r.platform==="linkedin"?r.permalink:null].map(lifecycleLinkedInIdentity).filter((v):v is string=>!!v));
}
function verifiedEmails(r: TruthRow) {
  const meta=object(r.metadata);
  return uniq([r.email_verified===true||meta.email_verification==="PASSED"?mail(r.email||meta.email):null,r.platform==="email"&&r.email_message_id&&r.email_thread_id?mail(r.sender_email):null].filter((v):v is string=>!!v));
}
function candidateEmails(r: TruthRow) {const meta=object(r.metadata),raw=object(r.raw),engine=object(r.engine_state);return uniq([r.email,r.sender_email,meta.email,raw.email,engine.email,r.platform==="email"?r.author_handle:null].map(mail).filter((v):v is string=>!!v));}
/** Shared structural facts for isolated reconciliation; never uses a fuzzy identity key. */
export function identitySourceFacts(ref:TruthRef,row:TruthRow) {return {kind:company(ref.table,row)?"company" as const:"person" as const,profiles:profiles(ref.table,row),emails:verifiedEmails(row)};}
function proof(refs: TruthRef[],alias: RelationshipIdentityEvidence["alias"],basis: string,confidence: RelationshipIdentityEvidence["confidenceClass"],reason: string|null): RelationshipIdentityEvidence {
  return {sourceRefs:refs.map(r=>({...r})).sort((a,b)=>key(a).localeCompare(key(b))),alias,verificationBasis:basis,evidenceIds:uniq(refs.map(key)),confidenceClass:confidence,ambiguityReason:reason,humanReviewRequired:confidence==="human_reconciliation"};
}

/** Derives a disposable Phase 1-compatible view from existing structural fields only. */
export function prepareIdentityShadow(input: TruthInput, policy: TruthPolicy) {
  const safe=visibleTruthInput(input,policy);
  // Clone every container we change. Original records and evidence stay byte-for-byte intact.
  const projected:TruthInput={...safe,lifecycle:Object.fromEntries(tables.map(t=>[t,safe.lifecycle[t].map(r=>({...r}))])) as TruthInput["lifecycle"]};
  const nodes=identityNodes(safe,policy), evidence:RelationshipIdentityEvidence[]=[], rejected:RelationshipIdentityEvidence[]=[];
  // Recognise legacy nested canonical profile fields without treating email/name/domain as verified.
  for(const {ref,row} of nodes) {
    const li=profiles(ref.table,row), raw=object(row.raw), rm=object(raw.metadata);
    if(li.length!==1||![raw.linkedin_url,rm.profile_url,rm.linkedin_url].some(v=>lifecycleLinkedInIdentity(v)===li[0]))continue;
    if(ref.table==="founder_research_records")continue;
    const copy=projected.lifecycle[ref.table as typeof tables[number]].find(r=>r.id===row.id)!;
    if(!lifecycleLinkedInIdentity(row.linkedin_identity)) {
      copy.linkedin_identity=li[0];
      const corroborating=nodes.filter(n=>key(n.ref)!==key(ref)&&company(n.ref.table,n.row)===company(ref.table,row)&&profiles(n.ref.table,n.row).length===1&&profiles(n.ref.table,n.row)[0]===li[0]);
      evidence.push(proof([ref,...corroborating.map(n=>n.ref)],{type:"linkedin",value:li[0]},"recorded_legacy_nested_canonical_profile","deterministic",null));
    }
  }
  // The persisted promotion FK is authority. A matching source tuple corroborates its provenance.
  for(const target of safe.lifecycle.growth_targets.filter(r=>text(r.acquisition_item_id))) {
    const tr={table:"growth_targets",id:target.id}, ar={table:"acquisition_items",id:text(target.acquisition_item_id)};
    const acquisition=safe.lifecycle.acquisition_items.find(r=>r.id===ar.id);
    if(!acquisition) { rejected.push(proof([tr],{type:"source_ref",value:key(ar)},"recorded_acquisition_fk","human_reconciliation","Referenced source is absent from the visible tenant scope."));continue; }
    const pair=[ar,tr], aProfiles=profiles(ar.table,acquisition), tProfiles=profiles(tr.table,target);
    const existing=text(object(object(acquisition.metadata).handoff).target_id);
    const sourceTuple=!!text(acquisition.source_engine)&&!!text(acquisition.source_record_id)&&target.source_type===acquisition.source_engine&&target.source_record_id===acquisition.source_record_id;
    const duplicate=safe.lifecycle.growth_targets.filter(r=>r.acquisition_item_id===acquisition.id).length>1;
    const conflictingProfiles=uniq([...aProfiles,...tProfiles]).length>1;
    const aEmails=verifiedEmails(acquisition), tEmails=verifiedEmails(target);
    const conflictingEmails=aEmails.length>0&&tEmails.length>0&&!aEmails.some(e=>tEmails.includes(e));
    const parentGroup=relationshipTruth(safe,ar,policy),targetGroup=relationshipTruth(safe,tr,policy);
    const componentProfiles=uniq([...parentGroup.verifiedAliases,...targetGroup.verifiedAliases].filter(a=>a.value.type==="linkedin").map(a=>a.value.value));
    const componentWorkspaces=uniq([...parentGroup.acceptedLocators,...targetGroup.acceptedLocators].filter(locator=>locator.startsWith("workspace_")));
    const existingConflict=[...parentGroup.contradictions,...targetGroup.contradictions].some(c=>["identity_ambiguity","workspace_conflict"].includes(c.code));
    // A company-origin promotion represents that company only when the target still has the
    // generator's company-label shape and no independent person-profile claim. The label is
    // a veto/type guard, never the join key; removing the FK always prevents this repair.
    const companyTarget=company(ar.table,acquisition)&&!acquisition.person&&!acquisition.person_name&&!object(acquisition.engine_state).person&&target.entity_kind!=="person"&&!tProfiles.length&&!target.person&&!target.person_name&&text(target.target_name)===text(acquisition.company)&&sourceTuple&&targetGroup.sourceRecords.length===1;
    const sameKind=company(ar.table,acquisition)===company(tr.table,target)||companyTarget;
    if(!sourceTuple||duplicate||conflictingProfiles||conflictingEmails||componentProfiles.length>1||componentWorkspaces.length>1||existingConflict||!sameKind||existing&&existing!==target.id) {
      rejected.push(proof(pair,{type:"source_ref",value:key(ar)},"recorded_acquisition_fk","human_reconciliation","Promotion source tuple, uniqueness, entity kind or aliases need reconciliation."));continue;
    }
    const a=projected.lifecycle.acquisition_items.find(r=>r.id===acquisition.id)!;
    const t=projected.lifecycle.growth_targets.find(r=>r.id===target.id)!;
    a.metadata={...object(a.metadata),handoff:{...object(object(a.metadata).handoff),target_id:target.id}};
    if(companyTarget)t.entity_kind="company";
    evidence.push(proof(pair,{type:"source_ref",value:key(ar)},"persisted_acquisition_fk_and_exact_source_tuple","deterministic",null));
  }
  return {input:projected,evidence,rejected,readOnly:true as const};
}

export function relationshipTruthIdentityShadow(input:TruthInput,anchor:TruthRef,policy:TruthPolicy,plan=prepareIdentityShadow(input,policy)) {
  const truth=relationshipTruth(plan.input,anchor,policy);
  const refs=new Set(truth.sourceRecords.map(key));
  const relevant=plan.evidence.filter(e=>e.sourceRefs.every(r=>refs.has(key(r))));
  if(relevant.length) {
    const ids=uniq(relevant.flatMap(e=>e.evidenceIds));
    for(const value of [truth.lifecycleStage,truth.actionableState,truth.nextLegitimateAction,truth.dueDate]) {
      value.evidenceIds=uniq([...value.evidenceIds,...ids]); value.rule+=";identity_shadow_structural_projection";
    }
    truth.interpretations.push({value:"Identity uses a read-only structural projection; no source identity or link was persisted.",kind:"interpretation",rule:"identity_shadow_structural_projection",evidenceIds:ids});
  }
  return {truth,identityEvidence:relevant,readOnly:true as const};
}

/** A reviewed pair is never joined by this classifier. Membership comes from the shadow engine. */
export function reviewIdentityPair(input:TruthInput,refs:[TruthRef,TruthRef],policy:TruthPolicy,resolvedInShadow:boolean,plan=prepareIdentityShadow(input,policy)):IdentityPairReview {
  const nodes=identityNodes(input,policy), pair=refs.map(ref=>nodes.find(n=>key(n.ref)===key(ref)));
  if(pair.some(n=>!n))throw Error("Pair source unavailable in authorised tenant scope.");
  const [a,b]=pair as [{ref:TruthRef;row:TruthRow},{ref:TruthRef;row:TruthRow}];
  const aLi=profiles(a.ref.table,a.row),bLi=profiles(b.ref.table,b.row), aEmail=verifiedEmails(a.row),bEmail=verifiedEmails(b.row);
  const flags:MissingIdentityBridge[]=[];
  if(!aLi.length||!bLi.length)flags.push("canonical_linkedin_identity_absent");
  if(!aEmail.length||!bEmail.length)flags.push("verified_email_absent");
  const explicit=plan.evidence.find(e=>e.alias?.type==="source_ref"&&refs.every(r=>e.sourceRefs.some(s=>key(s)===key(r))));
  if(!explicit)flags.push("explicit_source_reference_absent");
  const founder=refs.some(r=>r.table==="founder_research_records");if(founder)flags.push("founder_nested_contact_only");
  const gmail=pair.some(n=>n?.row.platform==="email"&&n.row.email_thread_id);
  if(gmail&&!explicit)flags.push("gmail_thread_linkage_absent");
  const liConflict=aLi.length>0&&bLi.length>0&&!aLi.some(l=>bLi.includes(l));
  const emailConflict=aEmail.length>0&&bEmail.length>0&&!aEmail.some(e=>bEmail.includes(e));
  if(liConflict||emailConflict)flags.push("conflicting_aliases");
  if(pair.some(n=>n?.row.engine_state||Object.values(object(object(n?.row.raw).metadata)).some(v=>v!==null&&v!==undefined&&v!=="")))flags.push("historical_record_shape");
  const crossKind=company(a.ref.table,a.row)!==company(b.ref.table,b.row);
  if(crossKind&&!explicit)flags.push("other");
  const sharedCandidate=candidateEmails(a.row).find(e=>candidateEmails(b.row).includes(e));
  const deterministic=plan.evidence.find(e=>refs.every(r=>e.sourceRefs.some(s=>key(s)===key(r))));
  if(resolvedInShadow&&!deterministic)throw Error("Resolved pair has no deterministic structural evidence.");
  const primary:MissingIdentityBridge=resolvedInShadow?"historical_record_shape":liConflict||emailConflict?"conflicting_aliases":crossKind?"other":founder?"founder_nested_contact_only":gmail?"gmail_thread_linkage_absent":flags.includes("verified_email_absent")?"verified_email_absent":"explicit_source_reference_absent";
  if(!flags.includes(primary))flags.push(primary);
  const confidence=resolvedInShadow?"deterministic":crossKind?"separate":"human_reconciliation";
  const reason=resolvedInShadow?null:crossKind?"Person and company evidence remain separate; a shared address does not establish the same entity.":liConflict||emailConflict?"Conflicting strong aliases require explicit reconciliation.":gmail?"Gmail evidence verifies its own sender/thread, not the unverified Acquisition association.":"No verified alias or explicit source bridge establishes this association; names/company/domain are not authority.";
  const e=resolvedInShadow&&deterministic?deterministic:proof(refs,sharedCandidate?{type:"email",value:sharedCandidate}:null,"candidate_only_not_join_authority",confidence,reason);
  return {...e,pairId:refs.map(key).sort().join("|"),missingBridge:primary,missingBridges:flags.sort(),resolvedInShadow};
}
