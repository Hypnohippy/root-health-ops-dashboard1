import {identityNodes, identitySourceFacts} from '@/lib/relationshipIdentityEvidence';
import {visibleTruthInput, type TruthInput, type TruthPolicy, type TruthRef, type TruthRow} from '@/lib/relationshipTruth';
import type {IdentityReviewCandidate} from '@/lib/relationshipIdentityReconciliation';
import {ledgerDecisions, type IdentityLedgerRow} from '@/lib/relationshipIdentityLedger';

/** Shadow review evidence only. Never passed to an identity union or an operational consumer. */
export type IdentityEnrichment = {
 sourceRef:TruthRef; relatedSourceRef:TruthRef|null; evidenceType:string; value:string;
 verificationBasis:string; provider:string; evidenceIds:string[]; threadId:string|null;
 messageId:string|null; at:string|null; scope:'person'|'company_shared'|'unknown';
 canAuthoriseIdentity:boolean; nonAuthoritativeReason:string|null;
};
export type EnrichmentDisposition='NOW_SAFE_FOR_HUMAN_REVIEW'|'STILL_AMBIGUOUS'|'MUST_REMAIN_SEPARATE'|'DEFER_DUE_TO_ACTIVE_WORKFLOW';
export type EnrichedIdentityReview={pairId:string; groupIds:string[]; sources:TruthRef[]; names:string[]; strongestEvidence:string;
 disposition:EnrichmentDisposition; evidence:IdentityEnrichment[]; reasons:string[]; gainedAuthoritativeEvidence:boolean; readOnly:true};
const obj=(v:unknown):Record<string,unknown>=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:{};
const str=(v:unknown)=>typeof v==='string'?v.trim():'';
const key=(r:TruthRef)=>r.table+':'+r.id;
const unique=(v:string[])=>[...new Set(v)].sort();
const email=(v:unknown)=>/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(str(v))?str(v).toLowerCase():null;
const time=(r:TruthRow)=>[r.confirmed_at,r.received_at,r.sent_at,r.message_at,r.occurred_at,r.recorded_at,r.created_at].map(str).find(v=>v&&Number.isFinite(Date.parse(v)))||null;
/** A deny heuristic only: an unrecognised mailbox is UNKNOWN, never thereby person-verified. */
export function sharedIdentityMailbox(value:string){return /^(?:info|hello|contact(?:us)?|enquir(?:y|ies)|corporate|office|admin|sales|support|customer|careline|reception|booking|conf\d*|fom|politicalaffairs|rail[._-]?enquiries|glasgow|content|team|press|marketing|hr|people|accounts)(?:[._+-]|$)/i.test(value.split('@')[0]);}
function candidateEmails(r:TruthRow){return unique([r.email,r.sender_email,obj(r.metadata).email,obj(r.engine_state).email,obj(r.raw).email].map(email).filter((v):v is string=>!!v));}
function personVerified(r:TruthRow,value:string){const m=obj(r.metadata);return !sharedIdentityMailbox(value)&&identitySourceFacts({table:'acquisition_items',id:r.id},r).emails.includes(value)&&(r.email_scope==='person'||m.email_scope==='person')&&(r.email_person_verified===true||m.person_email_verified===true);}
function activeReasons(r:TruthRow){const e=obj(r.engine_state);const reasons:string[]=[];
 for(const fields of [r,e])for(const [field,value] of Object.entries(fields))if(['follow_up_status','follow_up_stage','next_follow_up_at','next_action_at','last_outbound_at','last_inbound_at','replied_at','linkedin_conversation_active','reply_status','reply_state'].includes(field)&&value!==null&&value!==undefined&&value!==false&&value!==''&&value!=='no_reply')reasons.push(field+':'+String(value));
 if(/^(sent|replied|awaiting_our_reply|human_reply_required|waiting_for_human)$/i.test(str(e.status)||str(r.status)))reasons.push('recorded_workflow_status:'+(str(e.status)||str(r.status)));
 return unique(reasons);
}

export function enrichIdentityReview(input:TruthInput,policy:TruthPolicy,candidates:IdentityReviewCandidate[],rows:IdentityLedgerRow[]=[]):EnrichedIdentityReview[]{
 if(!Number.isFinite(Date.parse(policy.asOf)))throw Error('A valid audit cutoff is required.');
 const safe=visibleTruthInput(input,policy),nodes=identityNodes(safe,policy),byRef=new Map(nodes.map(n=>[key(n.ref),n.row]));
 const decisions=ledgerDecisions(rows,policy);const latest=new Map<string,typeof decisions[number]>();
 for(const d of decisions){if(d.decision==='review_later')continue;const pair=[key(d.sourceRefA),key(d.sourceRefB)].sort().join('|');if(!latest.has(pair)||latest.get(pair)!.revision<d.revision)latest.set(pair,d);}
 return candidates.flatMap(c=>{
  const refs=[c.left.ref,c.right.ref],a=byRef.get(key(refs[0])),b=byRef.get(key(refs[1]));
  if(!a||!b)return []; // Denied Founder/tenant evidence must not leak even candidate names.
  const authority=latest.get(c.id);if(authority?.decision==='same_relationship')return [];
  const evidence:IdentityEnrichment[]=[];const reasons:string[]=[];
  const add=(sourceRef:TruthRef,relatedSourceRef:TruthRef|null,evidenceType:string,value:string,basis:string,provider:string,ids:string[],scope:IdentityEnrichment['scope'],authorises=false,row?:TruthRow,threadId:string|null=null,messageId:string|null=null)=>{const at=row?time(row):null,future=!!at&&Date.parse(at)>Date.parse(policy.asOf);evidence.push({sourceRef:{...sourceRef},relatedSourceRef:relatedSourceRef?{...relatedSourceRef}:null,evidenceType,value,verificationBasis:basis,provider,evidenceIds:unique(ids),threadId,messageId,at,scope,canAuthoriseIdentity:authorises&&!future,nonAuthoritativeReason:future?'Evidence is later than the audit cutoff.':authorises?null:basis});};
  const fa=identitySourceFacts(refs[0],a),fb=identitySourceFacts(refs[1],b),facts=[fa,fb],sources=[a,b];
  const profiles=unique([...fa.profiles,...fb.profiles]);
  let conflict=profiles.length>1||fa.emails.length>0&&fb.emails.length>0&&!fa.emails.some(e=>fb.emails.includes(e));
  const sharedClaims=candidateEmails(a).filter(e=>candidateEmails(b).includes(e));
  for(let i=0;i<2;i++){
   const r=sources[i],ref=refs[i],other=refs[1-i];
   for(const value of candidateEmails(r)){
    const scope=sharedIdentityMailbox(value)?'company_shared':personVerified(r,value)?'person':'unknown';
    const eligible=scope==='person'&&personVerified(sources[1-i],value);
    add(ref,other,eligible?'verified_person_email':scope==='company_shared'?'shared_mailbox_only':'unverified_person_binding',value,eligible?'Both exact addresses have explicit verified person-scope binding.':scope==='company_shared'?'Generic/shared mailbox is not person identity.':'Address verification/deliverability does not establish a person binding on both sources.',str(obj(r.metadata).source)||str(r.source_engine)||ref.table,[key(ref)],scope,eligible,r);
   }
   for(const profile of facts[i].profiles)add(ref,other,'canonical_linkedin_identity',profile,'Canonical profile recorded on source; pair authority requires the same exact canonical profile.', 'linkedin',[key(ref)],'person',facts[1-i].profiles.includes(profile),r);
   const structural=[{field:'acquisition_item_id',table:'acquisition_items'},{field:'linked_acquisition_item_id',table:'acquisition_items'}];
   for(const edge of structural)if(((ref.table==='growth_targets'&&edge.field==='acquisition_item_id')||(ref.table==='founder_research_records'&&edge.field==='linked_acquisition_item_id'))&&str(r[edge.field])===other.id&&other.table===edge.table)add(ref,other,ref.table==='founder_research_records'?'founder_explicit_link':'explicit_source_fk',key(other),'Exact persisted same-tenant source foreign key; entity checks still apply.',ref.table,[key(ref),key(other)],fa.kind===fb.kind?'person':'unknown',fa.kind===fb.kind,r);
   if(ref.table==='acquisition_items'&&str(obj(obj(r.metadata).handoff).target_id)===other.id&&other.table==='growth_targets')add(ref,other,'explicit_source_fk',key(other),'Exact recorded Acquisition handoff target.',ref.table,[key(ref),key(other)],'person',fa.kind===fb.kind,r);
   for(const m of safe.emailMessages){
    const thread=str(r.email_thread_id)||str(r.gmail_thread_id),mt=str(m.gmail_thread_id),mid=str(m.gmail_message_id);
    // Exact participant + thread + provider message IDs AND verified source address. No body/name matching.
    if(!thread||thread!==mt||!mid)continue;
    for(const participant of unique([email(m.sender_email),email(m.recipient_email)].filter((v):v is string=>!!v))){
    if(!facts[i].emails.includes(participant))continue;
    const specific=personVerified(r,participant),otherBound=personVerified(sources[1-i],participant)&&(str(sources[1-i].email_thread_id)||str(sources[1-i].gmail_thread_id))===mt;
    add(ref,other,'verified_thread_participant',participant,specific?'Exact verified participant, Gmail message and authorised source thread; pair requires both endpoints bound.':'Exact Gmail sender/thread verifies mailbox evidence, not person identity.','gmail',[key(ref),'email_conversation_messages:'+m.id],specific?'person':sharedIdentityMailbox(participant)?'company_shared':'unknown',specific&&otherBound,m,mt,mid);
    }
   }
   for(const m of safe.linkedinMessages){const li=identitySourceFacts({table:'linkedin_conversation_messages',id:m.id},m).profiles;for(const profile of li.filter(p=>facts[i].profiles.includes(p)))add(ref,other,'canonical_linkedin_identity',profile,'Stored conversation matches exact recorded canonical profile; no display-name matching.','linkedin',[key(ref),'linkedin_conversation_messages:'+m.id],'person',facts[1-i].profiles.includes(profile),m,str(m.thread_id)||null);}
   for(const event of [...safe.acquisitionEvents,...safe.responseEvents,...safe.founderActivities,...safe.activities])if((event.source_table===ref.table&&event.source_id===ref.id)||(ref.table==='acquisition_items'&&event.acquisition_item_id===ref.id)||(ref.table==='founder_research_records'&&event.research_record_id===ref.id)||(ref.table==='inbox_items'&&event.inbox_item_id===ref.id)){add(ref,null,'historical_activity',event.activity_type?String(event.activity_type):String(event.id),'Explicit source-linked activity; timing/context alone is not identity.','ops',[key(ref),'activity:'+event.id],'unknown',false,event);}
   for(const founder of safe.founder)for(const contact of Array.isArray(founder.contacts)?founder.contacts:[]){const f=obj(contact),address=email(f.email);if(!address||!candidateEmails(r).includes(address))continue;add(ref,{table:'founder_research_records',id:founder.id},'founder_nested_contact',address,'Nested contact evidence preserves its parent provenance; company membership does not establish person equivalence.','founder',[key(ref),'founder_research_records:'+founder.id],f.email_verified===true&&f.email_scope==='person'&&!sharedIdentityMailbox(address)?'person':'unknown',false,founder);}
   if(!facts[i].profiles.length&&(/linkedin/i.test(str(r.platform))||r.linkedin_previously_contacted===true))reasons.push(key(ref)+': historical LinkedIn evidence lacks canonical identity');
   for(const reason of activeReasons(r))add(ref,null,'active_workflow_dependency',reason,'Recorded send/reply/follow-up dependency requires deferral.','ops',[key(ref)],'unknown',false,r);
  }
  // Shared provider record identity must be person-scoped and explicitly verified on both endpoints.
  const provider=str(a.provider)||str(obj(a.metadata).provider),providerId=str(a.provider_record_id)||str(obj(a.metadata).provider_record_id);
  if(provider&&provider===str(b.provider||obj(b.metadata).provider)&&providerId&&providerId===str(b.provider_record_id||obj(b.metadata).provider_record_id))add(refs[0],refs[1],'provider_source_identity',providerId,'Matching provider ID without explicit person identity semantics remains non-authoritative.',provider,refs.map(key),'unknown');
  const linked=safe.links.filter(l=>refs.some(r=>l.source_table===r.table&&l.source_id===r.id));
  for(const l of linked)add({table:String(l.source_table),id:String(l.source_id)},null,'workspace_source_link',str(l.workspace_id),'Source belongs to a workspace; workspace co-membership can include people and companies, so is not person equivalence.','ops',['relationship_source_links:'+l.source_table+':'+l.source_id],'unknown',false,l);
  if(linked.length&&unique(linked.map(l=>str(l.workspace_id))).length>1){conflict=true;reasons.push('Separate workspace histories require explicit review.');}
  const names=[str(a.person)||str(a.person_name)||str(a.author_name)||str(a.target_name),str(b.person)||str(b.person_name)||str(b.author_name)||str(b.target_name)];
  if(sharedClaims.some(sharedIdentityMailbox)&&names[0]&&names[1]&&names[0].toLowerCase()!==names[1].toLowerCase()){conflict=true;reasons.push('Different recorded people share an organisational mailbox; mailbox cannot collapse them.');}
  const negative=authority?.decision==='keep_separate';if(negative)reasons.push('Explicit keep_separate decision '+authority.id+' remains authoritative.');
  const shapeBlocked=!c.sameAllowed||fa.kind!==fb.kind;if(shapeBlocked)reasons.push(c.blockedReason||'Person/company shape requires association, not equivalence.');
  if(conflict)reasons.push('Conflicting identity evidence remains blocked.');
  const active=evidence.some(e=>e.evidenceType==='active_workflow_dependency'),positive=evidence.find(e=>e.canAuthoriseIdentity);
  const disposition:EnrichmentDisposition=negative?'MUST_REMAIN_SEPARATE':active?'DEFER_DUE_TO_ACTIVE_WORKFLOW':conflict||shapeBlocked?'MUST_REMAIN_SEPARATE':positive?'NOW_SAFE_FOR_HUMAN_REVIEW':'STILL_AMBIGUOUS';
  if(!positive)reasons.push('No additional pair-level person identity authority established from captured stored evidence.');
  return [{pairId:c.id,groupIds:[...c.groupIds],sources:refs.map(r=>({...r})),names,strongestEvidence:active?'active_workflow_dependency':negative||conflict?'conflicting_identity':positive?.evidenceType|| (evidence.some(e=>e.evidenceType==='shared_mailbox_only')?'shared_mailbox_only':evidence.length?'insufficient_evidence':'name_company_only'),disposition,evidence,reasons:unique(reasons),gainedAuthoritativeEvidence:!!positive&&!conflict&&!shapeBlocked&&!negative,readOnly:true as const}];
 });
}
