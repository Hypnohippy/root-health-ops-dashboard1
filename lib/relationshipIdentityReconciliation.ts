import { projectRelationships } from "@/lib/relationshipWorkspace";
import { prepareIdentityShadow, identityNodes, identitySourceFacts, reviewIdentityPair } from "@/lib/relationshipIdentityEvidence";
import { relationshipTruth, visibleTruthInput, type RelationshipTruth, type TruthInput, type TruthPolicy, type TruthRef, type TruthRow } from "@/lib/relationshipTruth";

export type IdentityDecisionChoice="same_relationship"|"keep_separate"|"review_later";
export type IdentityAlias={type:"linkedin"|"email";value:string};
export type RelationshipIdentityDecision={
 schemaVersion:1;id:string;organisationId:string;sourceRefA:TruthRef;sourceRefB:TruthRef;
 decision:IdentityDecisionChoice;evidenceIdsShown:string[];evidenceSummary:string;actorUserId:string;decidedAt:string;
 note:string|null;revision:number;candidateRevision:string;aliasBindings:{a:IdentityAlias[];b:IdentityAlias[]};simulation:true;
};
export type IdentitySourceSummary={ref:TruthRef;name:string;company:string|null;kind:"person"|"company";channel:string;source:string;status:string;verifiedAliases:IdentityAlias[];evidenceIds:string[];workspaceIds:string[]};
export type IdentityReviewCandidate={id:string;revision:string;groupIds:string[];left:IdentitySourceSummary;right:IdentitySourceSummary;evidenceIds:string[];evidenceSummary:string;reason:string;missing:string[];sameAllowed:boolean;blockedReason:string|null};
const obj=(v:unknown):Record<string,unknown>=>v&&typeof v==="object"&&!Array.isArray(v)?v as Record<string,unknown>:{};
const txt=(v:unknown)=>typeof v==="string"?v.trim():"";
const key=(r:TruthRef)=>`${r.table}:${r.id}`;
const pairKey=(a:TruthRef,b:TruthRef)=>[key(a),key(b)].sort().join("|");
const uniq=(a:string[])=>[...new Set(a)].sort();
const allowedTables=new Set(["inbox_items","growth_targets","acquisition_items","founder_research_records"]);
const tables=["inbox_items","growth_targets","acquisition_items"] as const;
const aliasKey=(a:IdentityAlias)=>`${a.type}:${a.value}`;
function aliases(ref:TruthRef,row:TruthRow):IdentityAlias[]{const f=identitySourceFacts(ref,row);return [...f.profiles.map(value=>({type:"linkedin" as const,value})),...f.emails.map(value=>({type:"email" as const,value}))];}
const refOK=(r:TruthRef)=>r&&allowedTables.has(r.table)&&typeof r.id==="string"&&!!r.id&&r.id.length<=100;
function sourceSummary(ref:TruthRef,row:TruthRow,input:TruthInput):IdentitySourceSummary {
 const meta=obj(row.metadata),raw=obj(row.raw),engine=obj(row.engine_state);
 return {ref:{...ref},name:txt(row.author_name)||txt(row.target_name)||txt(row.person_name)||txt(row.person)||txt(engine.person)||txt(row.company)||"Not established",company:txt(row.company)||txt(engine.company)||txt(meta.company)||null,kind:identitySourceFacts(ref,row).kind,channel:txt(row.platform)||txt(engine.channel)||"Ops",source:txt(row.source_engine)||txt(row.source_type)||txt(raw.source_engine)||ref.table,status:txt(row.response_state)||txt(row.status)||txt(row.stage)||"Not established",verifiedAliases:aliases(ref,row),evidenceIds:[key(ref),...input.emailMessages.filter(m=>m.organisation_id===row.organisation_id&&row.email_thread_id&&m.gmail_thread_id===row.email_thread_id&&m.sender_email===row.sender_email).map(m=>`email_conversation_messages:${m.id}`)],workspaceIds:uniq(input.links.filter(l=>l.source_table===ref.table&&l.source_id===ref.id).map(l=>txt(l.workspace_id)).filter(Boolean))};
}

/** Fixed structural graph: same rules as Phase 3, with explicit human cannot-link constraints. */
export function identityDecisionPartition(input:TruthInput,policy:TruthPolicy,decisions:RelationshipIdentityDecision[]=[]) {
 const plan=prepareIdentityShadow(input,policy),safe=plan.input,nodes=identityNodes(safe,policy),nodeByKey=new Map(nodes.map(n=>[key(n.ref),n]));
 const fact=new Map(nodes.map(n=>[key(n.ref),identitySourceFacts(n.ref,n.row)]));
 const aliasByKey=new Map(nodes.map(n=>[key(n.ref),aliases(n.ref,n.row)]));
 const effective=new Map<string,RelationshipIdentityDecision>();
 const seenRevision=new Map<string,string>();
 for(const d of decisions) {
  if(d.organisationId!==policy.organisationId||!d.simulation||d.schemaVersion!==1||!refOK(d.sourceRefA)||!refOK(d.sourceRefB)||key(d.sourceRefA)===key(d.sourceRefB)||!Number.isInteger(d.revision)||d.revision<1||!Number.isFinite(Date.parse(d.decidedAt))||Date.parse(d.decidedAt)>Date.parse(policy.asOf)||!txt(d.actorUserId)||!d.evidenceIdsShown.length)throw Error("Invalid hypothetical identity decision.");
  const a=nodeByKey.get(key(d.sourceRefA)),b=nodeByKey.get(key(d.sourceRefB));if(!a||!b)throw Error("Decision source unavailable in authorised tenant scope.");
  const pk=pairKey(d.sourceRefA,d.sourceRefB),revisionKey=pk+':'+d.revision;
  if(seenRevision.has(revisionKey)&&seenRevision.get(revisionKey)!==JSON.stringify(d))throw Error("Conflicting decision revision.");seenRevision.set(revisionKey,JSON.stringify(d));
  if(d.decision==="review_later")continue; // Deferral never revokes an earlier authoritative choice.
  if(!["same_relationship","keep_separate"].includes(d.decision))throw Error("Unknown decision.");
  if(!effective.has(pk)||effective.get(pk)!.revision<d.revision)effective.set(pk,d);
 }
 const active=[...effective.values()].sort((a,b)=>a.id.localeCompare(b.id));
 const negative=active.filter(d=>d.decision==="keep_separate"),positive=active.filter(d=>d.decision==="same_relationship");
 const quarantined=new Set<string>();
 for(const d of negative)for(const a of d.aliasBindings.a)if(d.aliasBindings.b.some(b=>aliasKey(a)===aliasKey(b)))quarantined.add(aliasKey(a));
 // Unique endpoint aliases extend a cannot-link to future records carrying that exact alias.
 const endpoints=(ref:TruthRef,binding:IdentityAlias[],other:IdentityAlias[])=>new Set([key(ref),...nodes.filter(n=>aliasByKey.get(key(n.ref))!.some(a=>binding.some(b=>aliasKey(a)===aliasKey(b))&&!other.some(b=>aliasKey(a)===aliasKey(b)))).map(n=>key(n.ref))]);
 const constraints=negative.map(d=>({id:d.id,a:endpoints(d.sourceRefA,d.aliasBindings.a,d.aliasBindings.b),b:endpoints(d.sourceRefB,d.aliasBindings.b,d.aliasBindings.a)}));
 const parent=new Map(nodes.map(n=>[key(n.ref),key(n.ref)])),members=new Map(nodes.map(n=>[key(n.ref),new Set([key(n.ref)])]));
 const root=(k:string):string=>parent.get(k)===k?k:root(parent.get(k)!);
 const violates=(a:Set<string>,b:Set<string>)=>constraints.some(c=>[...a].some(k=>c.a.has(k))&&[...b].some(k=>c.b.has(k))||[...a].some(k=>c.b.has(k))&&[...b].some(k=>c.a.has(k)));
 const skipped:{a:string;b:string;reason:string}[]=[];
 const union=(a:string,b:string,human=false)=>{const x=root(a),y=root(b);if(x===y)return;if(violates(members.get(x)!,members.get(y)!)){if(human)throw Error("Human decisions contain a transitive same/separate contradiction.");skipped.push({a,b,reason:"Explicit keep-separate constraint"});return;}const first=x<y?x:y,last=x<y?y:x;parent.set(last,first);for(const k of members.get(last)!)members.get(first)!.add(k);members.delete(last);};
 for(const d of positive) {
  const a=key(d.sourceRefA),b=key(d.sourceRefB),f=fact.get(a)!,g=fact.get(b)!;
  const workspaceIds=uniq(safe.links.filter(l=>[a,b].includes(`${l.source_table}:${l.source_id}`)).map(l=>txt(l.workspace_id)).filter(Boolean));
  if(f.kind!==g.kind||uniq([...f.profiles,...g.profiles]).length>1||workspaceIds.length>1)throw Error("Same-relationship decision needs entity/alias/workspace policy review.");
  union(a,b,true);
 }
 const emailProfiles=new Map<string,Set<string>>();for(const n of nodes){const f=fact.get(key(n.ref))!;for(const e of f.emails){const set=emailProfiles.get(e)||new Set<string>();f.profiles.forEach(p=>set.add(p));emailProfiles.set(e,set);}}
 const buckets=new Map<string,string[]>();for(const n of nodes){const f=fact.get(key(n.ref))!;for(const alias of aliasByKey.get(key(n.ref))!){const ak=aliasKey(alias);if(quarantined.has(ak)||alias.type==="email"&&(emailProfiles.get(alias.value)?.size||0)>1)continue;const bk=f.kind+':'+ak;const list=buckets.get(bk)||[];list.push(key(n.ref));buckets.set(bk,list);}}
 const edges:[string,string][]=[];for(const bucket of buckets.values())for(let i=0;i<bucket.length;i++)for(let j=i+1;j<bucket.length;j++)edges.push([bucket[i],bucket[j]]);
 const edge=(a:TruthRef,b:TruthRef)=>{const x=key(a),y=key(b);if(nodeByKey.has(x)&&nodeByKey.has(y)&&fact.get(x)!.kind===fact.get(y)!.kind)edges.push([x,y]);};
 for(const n of nodes){const r=n.row;if(r.source_type==="lifecycle_connection_accepted")edge(n.ref,{table:"inbox_items",id:txt(r.source_record_id)});if(n.ref.table==="founder_research_records"&&r.linked_acquisition_item_id)edge(n.ref,{table:"acquisition_items",id:txt(r.linked_acquisition_item_id)});if(n.ref.table==="acquisition_items"&&obj(obj(r.metadata).handoff).target_id)edge(n.ref,{table:"growth_targets",id:txt(obj(obj(r.metadata).handoff).target_id)});}
 for(const [a,b] of edges.sort((a,b)=>a.join('|').localeCompare(b.join('|'))))union(a,b);
 const groups=[...members.values()].map(s=>[...s].sort()).sort((a,b)=>a[0].localeCompare(b[0]));
 // Human-positive components must not acquire conflicting strong profiles through transitive aliases.
 for(const d of positive){const group=members.get(root(key(d.sourceRefA)))!;if(uniq([...group].flatMap(k=>fact.get(k)!.profiles)).length>1)throw Error("Human join would acquire conflicting canonical aliases.");const workspaces=uniq(safe.links.filter(l=>group.has(`${l.source_table}:${l.source_id}`)).map(l=>txt(l.workspace_id)).filter(Boolean));if(workspaces.length>1)throw Error("Human join would combine separate workspace histories.");}
 return {groups,byRef:new Map(groups.flatMap((g,i)=>g.map(k=>[k,i]))),activeDecisions:active,quarantinedAliases:[...quarantined].sort(),skippedEdges:skipped,input:safe,plan,readOnly:true as const};
}

export function reconciliationCandidates(input:TruthInput,policy:TruthPolicy) {
 const scoped=visibleTruthInput(input,policy),partition=identityDecisionPartition(scoped,policy),nodes=identityNodes(scoped,policy),byRef=new Map(nodes.map(n=>[key(n.ref),n.row]));
 const current=projectRelationships(policy.organisationId,scoped.lifecycle,scoped.founder);
 const candidates=new Map<string,IdentityReviewCandidate>();
 for(const group of current)for(let i=0;i<group.refs.length;i++)for(let j=i+1;j<group.refs.length;j++) {
  const a=group.refs[i],b=group.refs[j],ak=key(a),bk=key(b);if(!partition.byRef.has(ak)||!partition.byRef.has(bk)||partition.byRef.get(ak)===partition.byRef.get(bk))continue;
  const review=reviewIdentityPair(input,[a,b],policy,false,partition.plan);if(!review.humanReviewRequired)continue;
  const id=pairKey(a,b),ar=byRef.get(ak)!,br=byRef.get(bk)!;
  if(candidates.has(id)){candidates.get(id)!.groupIds.push(group.locator);continue;}
  const left=sourceSummary(a,ar,partition.input),right=sourceSummary(b,br,partition.input);
  const evidenceIds=uniq([...left.evidenceIds,...right.evidenceIds]);
  const canonical=uniq([...left.verifiedAliases,...right.verifiedAliases].filter(a=>a.type==="linkedin").map(a=>a.value));
  const blockedReason=left.kind!==right.kind?"Person and company must remain distinct.":canonical.length>1?"Conflicting canonical profiles require further identity policy review.":uniq([...left.workspaceIds,...right.workspaceIds]).length>1?"Separate durable workspaces require an explicit history policy.":null;
  const evidenceSummary=`${left.source} / ${right.source}; ${left.verifiedAliases.length} / ${right.verifiedAliases.length} verified aliases. ${review.ambiguityReason}`;
  const revision=JSON.stringify({left,right,updated:[ar.updated_at||null,br.updated_at||null],missing:review.missingBridges});
  candidates.set(id,{id,revision,groupIds:[group.locator],left,right,evidenceIds,evidenceSummary,reason:review.ambiguityReason||"Explicit identity review needed",missing:review.missingBridges,sameAllowed:!blockedReason,blockedReason});
 }
 return {candidates:[...candidates.values()].sort((a,b)=>a.id.localeCompare(b.id)),groupCount:new Set([...candidates.values()].flatMap(c=>c.groupIds)).size,partition,readOnly:true as const};
}

export function hypotheticalDecision(candidate:IdentityReviewCandidate,choice:IdentityDecisionChoice,actor:{organisationId:string;userId:string},at:string,options:{id:string;revision:number;confirmed:boolean;note?:string;candidateRevision:string;evidenceIdsShown:string[]}):RelationshipIdentityDecision {
 if(!["same_relationship","keep_separate","review_later"].includes(choice)||!txt(actor.userId)||!txt(actor.organisationId)||!Number.isFinite(Date.parse(at)))throw Error("Invalid decision context.");
 if(options.candidateRevision!==candidate.revision||JSON.stringify(uniq(options.evidenceIdsShown))!==JSON.stringify(candidate.evidenceIds))throw Error("Evidence changed. Refresh before reviewing.");
 if(choice==="same_relationship"&&(!options.confirmed||!candidate.sameAllowed))throw Error("Explicit confirmation and an eligible candidate are required.");
 if((options.note||'').length>1000||!Number.isInteger(options.revision)||options.revision<1||!options.id.startsWith('hypothetical:'))throw Error("Invalid hypothetical decision revision or note.");
 return {schemaVersion:1,id:options.id,organisationId:actor.organisationId,sourceRefA:candidate.left.ref,sourceRefB:candidate.right.ref,decision:choice,evidenceIdsShown:[...candidate.evidenceIds],evidenceSummary:candidate.evidenceSummary,actorUserId:actor.userId,decidedAt:at,note:txt(options.note)||null,revision:options.revision,candidateRevision:candidate.revision,aliasBindings:{a:candidate.left.verifiedAliases,b:candidate.right.verifiedAliases},simulation:true};
}

/** Human authority changes only a disposable grouping, never existing consumers or source data. */
export function truthWithIdentityDecisions(input:TruthInput,anchor:TruthRef,policy:TruthPolicy,decisions:RelationshipIdentityDecision[],prepared=identityDecisionPartition(input,policy,decisions)):RelationshipTruth {
 const id=prepared.byRef.get(key(anchor));if(id===undefined)throw Error("Relationship source unavailable.");const refs=prepared.groups[id],keys=new Set(refs);
 const baseline=relationshipTruth(prepared.input,anchor,policy);
 const relevant=prepared.activeDecisions.filter(d=>keys.has(key(d.sourceRefA))||keys.has(key(d.sourceRefB)));
 if(!relevant.length&&baseline.sourceRecords.length===refs.length&&baseline.sourceRecords.every(r=>keys.has(key(r))))return baseline;
 const subset:TruthInput={...prepared.input,lifecycle:Object.fromEntries(tables.map(t=>[t,prepared.input.lifecycle[t].filter(r=>keys.has(`${t}:${r.id}`))])) as TruthInput['lifecycle'],founder:prepared.input.founder.filter(r=>keys.has(`founder_research_records:${r.id}`))};
 const pieces:RelationshipTruth[]=[];const visited=new Set<string>();
 for(const ref of refs){if(visited.has(ref))continue;const colon=ref.indexOf(':');const part=relationshipTruth(subset,{table:ref.slice(0,colon),id:ref.slice(colon+1)},policy);part.sourceRecords.forEach(r=>visited.add(key(r)));pieces.push(part);}
 const truth=pieces.find(p=>key(p.anchor)===key(anchor))||relationshipTruth(subset,anchor,policy);
 const merge=<T>(arrays:T[][],id:(v:T)=>string)=>[...new Map(arrays.flat().map(v=>[id(v),v])).values()];
 truth.sourceRecords=refs.map(ref=>({table:ref.slice(0,ref.indexOf(':')),id:ref.slice(ref.indexOf(':')+1)}));
 truth.acceptedLocators=uniq(pieces.flatMap(p=>p.acceptedLocators));
 truth.evidenceTimeline=merge(pieces.map(p=>p.evidenceTimeline),e=>e.id).sort((a,b)=>String(a.at||a.recordedAt).localeCompare(String(b.at||b.recordedAt))||a.id.localeCompare(b.id));
 truth.recordedFacts=merge(pieces.map(p=>p.recordedFacts),f=>JSON.stringify(f));truth.verifiedAliases=merge(pieces.map(p=>p.verifiedAliases),a=>JSON.stringify(a));
 truth.commitments=merge(pieces.map(p=>p.commitments),c=>c.value.taskId);truth.suppressionReasons=merge(pieces.map(p=>p.suppressionReasons),c=>JSON.stringify(c));truth.missingEvidence=merge(pieces.map(p=>p.missingEvidence),c=>JSON.stringify(c));truth.contradictions=merge(pieces.map(p=>p.contradictions),c=>JSON.stringify(c));
 const evidenceIds=uniq(relevant.map(d=>d.id));
 const latest=(field:"latestConfirmedInbound"|"latestConfirmedOutbound")=>pieces.map(p=>p[field]).filter(c=>c.value?.at).sort((a,b)=>String(b.value!.at).localeCompare(String(a.value!.at)))[0];
 truth.latestConfirmedInbound=latest('latestConfirmedInbound')||truth.latestConfirmedInbound;truth.latestConfirmedOutbound=latest('latestConfirmedOutbound')||truth.latestConfirmedOutbound;
 if(uniq(pieces.map(p=>p.lifecycleStage.value)).length>1)truth.contradictions.push({code:'human_identity_lifecycle_scope',value:'Hypothetical association spans distinct operational states; no lifecycle transition is authorised.',kind:'uncertainty',rule:'human_identity_is_not_lifecycle_authority',evidenceIds});
 truth.actionableState={value:'blocked',kind:'uncertainty',rule:'hypothetical_identity_not_operational_authority',evidenceIds};truth.nextLegitimateAction={value:'Review hypothetical identity evidence; operational workflows remain unchanged',kind:'uncertainty',rule:'hypothetical_identity_not_operational_authority',evidenceIds};truth.dueDate={value:null,kind:'uncertainty',rule:'identity_dry_run_no_schedule_authority',evidenceIds};
 truth.interpretations.push({value:'Hypothetical identity review only. No records, history or lifecycle state were moved or saved.',kind:'interpretation',rule:'identity_decision_dry_run',evidenceIds});
 // Association provenance must accompany every conclusion without claiming messages were verified by the decision.
 const conclusions=[truth.latestConfirmedInbound,truth.latestConfirmedOutbound,truth.lifecycleStage,truth.actionableState,truth.nextLegitimateAction,truth.dueDate,truth.replyState,...truth.recordedFacts,...truth.verifiedAliases,...truth.commitments,...truth.suppressionReasons,...truth.contradictions,...truth.missingEvidence,...truth.interpretations,...truth.relatedFounderContacts];
 for(const c of conclusions){c.evidenceIds=uniq([...c.evidenceIds,...evidenceIds]);c.rule+=';hypothetical_identity_association_only';}
 return truth;
}
/** Code-owned fictional rehearsal input; never an Ops identity lookup or persisted record. */
export function syntheticIdentityReviewInput(organisationId:string):TruthInput {
 const common={organisation_id:organisationId,record_type:'b2b_lead',person:'Avery Morgan',company:'Northbridge Example',source_engine:'manual_ops',status:'accepted'};
 return {lifecycle:{inbox_items:[],growth_targets:[],acquisition_items:[{...common,id:'11111111-1111-4111-8111-111111111111',metadata:{email:'avery@northbridge.example',email_verification:'PASSED'}},{...common,id:'22222222-2222-4222-8222-222222222222',engine_state:{email:'avery@northbridge.example',person:'Avery Morgan',company:'Northbridge Example',status:'READY'}}]},founder:[],founderActivities:[],emailMessages:[],linkedinMessages:[],workspaces:[],links:[],activities:[],tasks:[],acquisitionEvents:[],responseEvents:[]};
}
