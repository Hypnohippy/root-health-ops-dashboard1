import { buildContactLifecycle, lifecycleLinkedInIdentity, lifecycleStagePriority, unresolvedLinkedInNotification, type LifecycleInput } from "@/lib/contactLifecycle";
import { externalSentAt, sendReceipts } from "@/lib/linkedinSendEvidence";
import { cadenceDays, legacyCadenceStages } from "@/lib/growthOutreach";

/** Shadow only. No database, network, clock reads, source mutation or consumer wiring. */
export type TruthRow = Record<string, unknown> & { organisation_id: string; id: string };
export type TruthRef = { table: string; id: string };
export type TruthConclusion<T> = { value: T; kind: "recorded_fact" | "derived_operational_state" | "interpretation" | "uncertainty"; evidenceIds: string[]; rule: string };
export type TruthEvidence = { id: string; source: TruthRef; kind: string; channel: string; direction: string | null; at: string | null; recordedAt: string | null; bodyAvailable: boolean; thread: string | null };
export type TruthIssue = TruthConclusion<string> & { code: string };
export type TruthInput = {
  lifecycle: LifecycleInput;
  founder: TruthRow[]; founderActivities: TruthRow[];
  emailMessages: TruthRow[]; linkedinMessages: TruthRow[];
  workspaces: TruthRow[]; links: TruthRow[]; activities: TruthRow[]; tasks: TruthRow[];
  acquisitionEvents: TruthRow[]; responseEvents: TruthRow[];
};
export type TruthPolicy = { organisationId: string; founderAllowed: boolean; asOf: string; partialSources?: string[] };
export type RelationshipTruth = {
  schemaVersion: 1; asOf: string; relationshipId: string; anchor: TruthRef; acceptedLocators: string[];
  entityKind: "person" | "company";
  verifiedAliases: TruthConclusion<{ type: "linkedin" | "email"; value: string }>[];
  sourceRecords: TruthRef[]; evidenceTimeline: TruthEvidence[];
  recordedFacts: TruthConclusion<{ field: string; value: string }>[];
  latestConfirmedInbound: TruthConclusion<TruthEvidence | null>;
  latestConfirmedOutbound: TruthConclusion<TruthEvidence | null>;
  lifecycleStage: TruthConclusion<string>; actionableState: TruthConclusion<string>;
  nextLegitimateAction: TruthConclusion<string | null>; dueDate: TruthConclusion<string | null>;
  commitments: TruthConclusion<{ taskId: string; status: string; dueAt: string | null; text: string }>[];
  suppressionReasons: TruthIssue[]; contradictions: TruthIssue[]; missingEvidence: TruthIssue[];
  interpretations: TruthConclusion<string>[];
  replyState: TruthConclusion<string>;
  relatedFounderContacts: TruthConclusion<{ name: string | null; email: string; founderId: string }>[];
  readOnly: true;
};
const obj = (v: unknown): Record<string, unknown> => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};
const str = (v: unknown) => typeof v === "string" ? v.trim() : "";
const arr = (v: unknown): Record<string, unknown>[] => Array.isArray(v) ? v.map(obj) : [];
const date = (v: unknown) => str(v) && Number.isFinite(Date.parse(str(v))) ? new Date(str(v)).toISOString() : null;
const email = (v: unknown) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str(v)) ? str(v).toLowerCase() : null;
const key = (r: TruthRef) => `${r.table}:${r.id}`;
const ref = (table: string, r: TruthRow): TruthRef => ({ table, id: r.id });
const fact = <T>(value: T, evidenceIds: string[], rule: string, kind: TruthConclusion<T>["kind"] = "derived_operational_state"): TruthConclusion<T> => ({ value, kind, evidenceIds: [...new Set(evidenceIds)].sort(), rule });
const issue = (code: string, value: string, ids: string[]): TruthIssue => ({ ...fact(value, ids, code, "uncertainty"), code });
const tables = ["inbox_items", "growth_targets", "acquisition_items"] as const;
const prefix: Record<string, string> = { inbox_items: "inbox", growth_targets: "target", acquisition_items: "acquisition", founder_research_records: "founder" };

/** Filter before identity resolution. Protected rows must not influence aliases or contradictions. */
export function visibleTruthInput(input: TruthInput, policy: TruthPolicy): TruthInput {
  const scoped = (rows: TruthRow[], privateRows = false) => rows.filter(r => r.organisation_id === policy.organisationId && (!privateRows || policy.founderAllowed || r.founder_only !== true));
  const lifecycle = Object.fromEntries(tables.map(t => [t, scoped(input.lifecycle[t])])) as LifecycleInput;
  // Approved evidence-only research never participates in identity partitioning.
  const founder = policy.founderAllowed ? scoped(input.founder).filter(row=>!row.linked_relationship_workspace_id) : [];
  const operationalKeys = new Set(tables.flatMap(t => lifecycle[t].map(r => `${t}:${r.id}`)));
  const allLinks = scoped(input.links).filter(l => policy.founderAllowed || l.source_table !== "founder_research_records");
  const workspaces = scoped(input.workspaces).filter(w => policy.founderAllowed || !w.founder_only || allLinks.some(l => l.workspace_id === w.id && operationalKeys.has(`${l.source_table}:${l.source_id}`)));
  const workspaceIds = new Set(workspaces.map(w => w.id));
  return { lifecycle, founder, founderActivities: policy.founderAllowed ? scoped(input.founderActivities) : [],
    emailMessages: scoped(input.emailMessages), linkedinMessages: scoped(input.linkedinMessages), workspaces,
    links: allLinks.filter(l => workspaceIds.has(str(l.workspace_id))),
    activities: scoped(input.activities, true).filter(r => workspaceIds.has(str(r.workspace_id))),
    tasks: scoped(input.tasks, true).filter(r => workspaceIds.has(str(r.workspace_id))),
    acquisitionEvents: scoped(input.acquisitionEvents), responseEvents: scoped(input.responseEvents) };
}
function identities(table: string, row: TruthRow) {
  const meta = obj(row.metadata), raw = obj(row.raw), engine = obj(row.engine_state);
  const li = [row.linkedin_identity, row.linkedin_url, raw.profile_url, meta.profile_url, meta.linkedin_url, engine.linkedin_identity,
    table === "acquisition_items" ? row.source_url : null, row.platform === "linkedin" ? row.permalink : null].map(lifecycleLinkedInIdentity).filter((v): v is string => !!v);
  const verifiedEmail = row.email_verified === true || meta.email_verification === "PASSED";
  // Gmail-backed sender evidence is structural; syntactically valid discovery guesses are not.
  const mails = [verifiedEmail ? row.email || meta.email : null,
    row.platform === "email" && row.email_message_id && row.email_thread_id ? row.sender_email : null].map(email).filter((v): v is string => !!v);
  return [...new Set([...li.map(v => `linkedin:${v}`), ...mails.map(v => `email:${v}`)])];
}
function isCompany(table: string, r: TruthRow) { return r.entity_kind === "company" || table === "acquisition_items" && !r.person && !!r.company && r.record_type === "b2b_lead"; }

/** Anchor is an existing source reference. Identity strengthening never changes its URL/ID. */
export function relationshipTruth(input: TruthInput, anchor: TruthRef, policy: TruthPolicy): RelationshipTruth {
  const now = Date.parse(policy.asOf); if (!Number.isFinite(now)) throw Error("A valid audit asOf is required.");
  const safe = visibleTruthInput(input, policy);
  const nodes = [...tables.flatMap(t => safe.lifecycle[t].map(r => ({ table: t as string, row: r }))), ...safe.founder.map(row => ({ table: "founder_research_records", row }))];
  const start = nodes.find(n => n.table === anchor.table && n.row.id === anchor.id); if (!start) throw Error("Relationship source not found.");
  const company = isCompany(start.table, start.row), selected = new Set([key(anchor)]);
  const candidates = nodes.filter(n => isCompany(n.table, n.row) === company);
  const emailProfiles = new Map<string, Set<string>>();
  for (const n of candidates) {
    const aliases=identities(n.table,n.row);
    for(const e of aliases.filter(a=>a.startsWith("email:"))) {
      const profiles=emailProfiles.get(e)||new Set<string>();
      aliases.filter(a=>a.startsWith("linkedin:")).forEach(a=>profiles.add(a));
      emailProfiles.set(e,profiles);
    }
  }
  const ambiguousEmail = (alias:string) => (emailProfiles.get(alias)?.size||0)>1;
  // Strong structural edges only; never name/company/domain or global Gmail link ordering.
  for (let changed = true; changed;) {
    changed = false;
    const selectedNodes = candidates.filter(n => selected.has(`${n.table}:${n.row.id}`));
    const aliases = new Set(selectedNodes.flatMap(n => identities(n.table, n.row)));
    for (const n of candidates) {
      const k = `${n.table}:${n.row.id}`; if (selected.has(k)) continue;
      const matched = identities(n.table, n.row).some(a => aliases.has(a)&&!ambiguousEmail(a));
      const explicit = selectedNodes.some(s => s.row.source_record_id === n.row.id && s.row.source_type === "lifecycle_connection_accepted" && n.table === "inbox_items" ||
        n.row.source_record_id === s.row.id && n.row.source_type === "lifecycle_connection_accepted" && s.table === "inbox_items" ||
        s.table === "founder_research_records" && n.table === "acquisition_items" && s.row.linked_acquisition_item_id === n.row.id ||
        n.table === "founder_research_records" && s.table === "acquisition_items" && n.row.linked_acquisition_item_id === s.row.id ||
        s.table === "acquisition_items" && n.table === "growth_targets" && obj(obj(s.row.metadata).handoff).target_id === n.row.id ||
        n.table === "acquisition_items" && s.table === "growth_targets" && obj(obj(n.row.metadata).handoff).target_id === s.row.id);
      if (matched || explicit) { selected.add(k); changed = true; }
    }
  }
  const members = nodes.filter(n => selected.has(`${n.table}:${n.row.id}`));
  const refs = members.map(n => ref(n.table, n.row));
  const ids = refs.map(key);
  const filtered = Object.fromEntries(tables.map(t => [t, members.filter(n => n.table === t).map(n => n.row)])) as LifecycleInput;
  const contacts = buildContactLifecycle(policy.organisationId, filtered, now).sort((a,b) => lifecycleStagePriority[b.currentStage] - lifecycleStagePriority[a.currentStage]);
  const current = contacts[0];
  const timeline: TruthEvidence[] = [], contradictions: TruthIssue[] = [], missing: TruthIssue[] = [], suppression: TruthIssue[] = [];
  const add = (source: TruthRef, kind: string, channel: string, at: unknown, recorded: unknown, direction: string | null = null, body = false, thread: string | null = null, suffix = "") => {
    const e: TruthEvidence = { id: `${key(source)}${suffix}`, source, kind, channel, at: date(at), recordedAt: date(recorded), direction, bodyAvailable: body, thread };
    timeline.push(e); return e;
  };
  const aliases = members.flatMap(n => identities(n.table,n.row).map(a => fact({ type: a.startsWith("email:") ? "email" as const : "linkedin" as const, value: a.slice(a.indexOf(":")+1) }, [key(ref(n.table,n.row))], "structural_identity", "recorded_fact")));
  if(members.some(n=>identities(n.table,n.row).some(ambiguousEmail)))contradictions.push(issue("identity_ambiguity","Verified email is associated with multiple canonical profiles; email alone did not join those people.",ids));
  const uniqueAliases = [...new Set(aliases.map(a => `${a.value.type}:${a.value.value}`))];
  if (uniqueAliases.filter(a=>a.startsWith("linkedin:")).length > 1) contradictions.push(issue("identity_ambiguity", "Multiple canonical LinkedIn identities are structurally linked; review before any action.", ids));
  const linkedin = new Set(aliases.filter(a=>a.value.type==="linkedin").map(a=>a.value.value));
  const emails = new Set(aliases.filter(a=>a.value.type==="email").map(a=>a.value.value));
  const threadIds = new Set(members.filter(n=>n.row.platform==="email").flatMap(n=>[str(n.row.email_thread_id),str(n.row.email_sent_thread_id)]).filter(Boolean));
  const workspaceIds = [...new Set(safe.links.filter(l=>selected.has(`${l.source_table}:${l.source_id}`)).map(l=>str(l.workspace_id)))];
  if(workspaceIds.length>1)contradictions.push(issue("workspace_conflict","Multiple existing workspaces; no automatic history merge.",ids));
  const founderIds = new Set(members.filter(n=>n.table==="founder_research_records").map(n=>n.row.id));
  const founderEvents = safe.founderActivities.filter(e=>founderIds.has(str(e.research_record_id)));
  for(const e of founderEvents)if(e.activity_type==="linked_gmail_evidence" && e.gmail_message_id && e.gmail_thread_id && safe.emailMessages.some(m=>m.gmail_message_id===e.gmail_message_id&&m.gmail_thread_id===e.gmail_thread_id))threadIds.add(str(e.gmail_thread_id));
  for(const n of members) {
    const r=n.row, source=ref(n.table,r);
    add(source,"source_record",str(r.platform)||"Ops",r.created_at_platform||r.created_at,r.inserted_at||r.created_at);
    if(n.table==="inbox_items"&&r.platform==="linkedin"&&r.kind==="dm"&&str(r.text))add(source,"message","LinkedIn",r.created_at_platform,r.inserted_at,"inbound",true,null,":inbound");
    if(r.response_state)add(source,`disposition:${r.response_state}`,str(r.platform)||"Ops",r.response_updated_at,r.response_updated_at,null,false,str(r.email_thread_id)||null,":disposition");
    if(r.kind==="connection_accepted")add(source,"connection_accepted","LinkedIn",r.created_at_platform,r.inserted_at,null,false,null,":acceptance");
    for(const receipt of sendReceipts(r.manual_completion)) {
      const unknownCorrection=obj(r.manual_completion).historical_send_date_status==="unknown" && (!receipt.stage||receipt.stage==="connection");
      add(source,"manual_send_receipt","LinkedIn",unknownCorrection?null:externalSentAt(receipt,now),receipt.confirmed_at||receipt.completed_at,"outbound",!!str(receipt.message),null,`:receipt:${receipt.key}`);
    }
    for(const note of arr(obj(r.raw).linkedin_message_notifications))if(note.source==="linkedin_message_notification"&&note.gmailMessageId&&date(note.receivedAt))add(source,"reply_notification","LinkedIn",note.receivedAt,note.recordedAt,null,false,str(note.messageUrl)||null,`:notification:${note.eventKey||note.gmailMessageId}`);
    if(n.table==="inbox_items"&&r.platform==="email"&&r.email_delivery_status==="sent"&&r.email_sent_at)add(source,"successful_email_send","Email",r.email_sent_at,r.email_sent_at,"outbound",!!str(r.last_reply_text),str(r.email_sent_thread_id||r.email_thread_id)||null,":send");
  }
  for(const m of safe.linkedinMessages.filter(m=>linkedin.has(str(m.linkedin_identity))))add(ref("linkedin_conversation_messages",m),str(m.direction)==="snapshot"?"undated_snapshot":"message","LinkedIn",m.message_at,m.confirmed_at,str(m.direction),!!str(m.message));
  for(const m of safe.emailMessages.filter(m=>m.gmail_message_id&&threadIds.has(str(m.gmail_thread_id)))) {
    const participant=email(m.direction==="inbound"?m.sender_email:m.recipient_email);
    const matches=participant&&emails.has(participant);
    add(ref("email_conversation_messages",m),matches?"gmail_message":"participant_unconfirmed","Email",m.sent_at,m.created_at,str(m.direction),!!str(m.body),str(m.gmail_thread_id));
    if(!matches)missing.push(issue("participant_unconfirmed","Thread evidence exists but this message participant is not a verified person alias.",[`email_conversation_messages:${m.id}`]));
  }
  for(const e of [...safe.activities.filter(e=>workspaceIds.includes(str(e.workspace_id))),...founderEvents])add(ref(e.workspace_id?"relationship_activity_events":"founder_activity_events",e),`manual:${e.activity_type}`,"Ops",e.occurred_at,e.recorded_at,null,!!str(e.message));
  const manualEmail=safe.activities.filter(e=>workspaceIds.includes(str(e.workspace_id))&&obj(e.details).activityType==="emailed");
  if(manualEmail.length&&!safe.emailMessages.some(m=>threadIds.has(str(m.gmail_thread_id))))missing.push(issue("manual_email_not_linked","Manual email activity exists; authoritative Gmail conversation is not linked. The manual address is not a verified alias.",manualEmail.map(e=>`relationship_activity_events:${e.id}`)));
  for(const [table,events,idField,parent] of [["acquisition_item_events",safe.acquisitionEvents,"acquisition_item_id","acquisition_items"],["response_item_events",safe.responseEvents,"inbox_item_id","inbox_items"]] as const)for(const e of events.filter(e=>selected.has(`${parent}:${e[idField]}`)))add(ref(table,e),`event:${e.action||"recorded"}`,"Ops",e.created_at,e.created_at);
  const latest = (rows: TruthEvidence[]) => rows.filter(e=>e.at && Date.parse(e.at)<=now).sort((a,b)=>String(b.at).localeCompare(String(a.at))||a.id.localeCompare(b.id))[0]||null;
  const outbound=latest(timeline.filter(e=>e.direction==="outbound"&&["manual_send_receipt","successful_email_send","gmail_message","message"].includes(e.kind)));
  const inbound=latest(timeline.filter(e=>e.direction==="inbound"&&["gmail_message","message"].includes(e.kind)));
  if(inbound&&!inbound.bodyAvailable)missing.push(issue("message_body_unavailable","A dated inbound message is recorded but its actual text is unavailable.",[inbound.id]));
  const notifications=timeline.filter(e=>e.kind==="reply_notification");
  const pending=members.filter(n=>n.table==="inbox_items"&&unresolvedLinkedInNotification(n.row));
  const newestNotification=latest(notifications);
  const hasReplyText=!!newestNotification&&safe.linkedinMessages.some(m=>linkedin.has(str(m.linkedin_identity))&&(m.direction==="inbound"||m.contains_inbound_reply===true)&&!!str(m.message)&&!!date(m.confirmed_at)&&date(m.confirmed_at)!>=newestNotification.at!);
  let actionable=current?.currentStage==="needs_reply"?"needs_reply":current?.currentStage==="follow_up"?current.followUpStatus==="due"?"followup_due":"waiting":current?.currentStage||"not_established";
  let next=current?.nextAction||null, due=current?.nextDueDate||null;
  if(pending.length&&!hasReplyText){missing.push(issue("reply_text_unavailable","Reply detected, reply text unavailable.",notifications.map(e=>e.id)));if(!["lost","converted","dismissed","nurture"].includes(current?.currentStage||"")){actionable="needs_text";next="Open LinkedIn conversation and log actual reply text";due=null;}}
  if(pending.length)suppression.push(issue("reply_suppresses_cadence","Verified unresolved reply suppresses unanswered-outreach cadence.",pending.map(n=>key(ref(n.table,n.row)))));
  if(timeline.some(e=>e.kind==="undated_snapshot"&&!e.at))missing.push(issue("undated_history","Stored conversation snapshots have no established message dates.",timeline.filter(e=>e.kind==="undated_snapshot"&&!e.at).map(e=>e.id)));
  if(!outbound&&members.some(n=>n.row.last_action_at||n.row.contacted_at||n.row.manual_completion))missing.push(issue("historical_outbound_incomplete","Historical outbound evidence incomplete; recording/contact timestamps are not actual send dates.",ids));
  if(!outbound && current?.currentStage==="follow_up"){ actionable="blocked";next="Reconcile historical outbound evidence before follow-up";due=null; }
  for(const n of members.filter(n=>n.table==="growth_targets")) {
    const r=n.row, stage=legacyCadenceStages[str(r.stage)]||str(r.stage), first=members.flatMap(m=>sendReceipts(m.row.manual_completion)).filter(r=>!r.stage||r.stage==="connection").map(r=>externalSentAt(r,now)).filter((v):v is string=>!!v).sort()[0];
    const anchorAt=date(r.first_outbound_at), actionAt=date(r.last_action_at);
    if(first&&cadenceDays[stage] && (anchorAt&&anchorAt!==first || !r.manual_completion&&!r.linkedin_cadence_anchor&&actionAt&&actionAt!==first)) {
      contradictions.push(issue("followup_timing_disputed","Follow-up timing disputed: cadence timing differs from confirmed-send chronology.",[key(ref(n.table,r)),...timeline.filter(e=>e.kind==="manual_send_receipt").map(e=>e.id)]));
      actionable="blocked"; next="Review recorded cadence and confirmed-send evidence";due=null;
    }
  }
  const closedThreads=new Set(members.filter(n=>n.row.platform==="email"&&["closed_or_lost","no_reply_needed"].includes(str(n.row.response_state))).map(n=>str(n.row.email_thread_id)).filter(Boolean));
  const engaged=members.filter(n=>n.row.platform==="email"&&["engaged","needs_reply"].includes(str(n.row.response_state))&&str(n.row.email_thread_id)&&!closedThreads.has(str(n.row.email_thread_id)));
  if(closedThreads.size&&engaged.length){contradictions.push(issue("cross_thread_closure","Email engagement exists on another thread; contact-level closure may be over-broad.",engaged.map(n=>key(ref(n.table,n.row))).concat(ids)));actionable="review";next="Review thread-specific disposition without reopening or sending";due=null;}
  if(["lost","converted","dismissed","nurture","no_reply_needed"].includes(current?.currentStage||""))suppression.push(issue("recorded_disposition","Recorded disposition is retained; this does not prove that every thread or commitment ended.",ids));
  if(contradictions.some(c=>["identity_ambiguity","workspace_conflict"].includes(c.code))){actionable="blocked";next="Review identity association";due=null;}
  const relatedFounderContacts=safe.founder.flatMap(f=>arr(f.contacts).filter(c=>c.emailStatus==="verified"&&emails.has(email(c.directEmail)||"")).map(c=>fact({name:str(c.name)||null,email:email(c.directEmail)!,founderId:f.id},[`founder_research_records:${f.id}`],"verified_nested_contact_not_company_merge","recorded_fact")));
  const commitments=safe.tasks.filter(t=>workspaceIds.includes(str(t.workspace_id))).map(t=>fact({taskId:t.id,status:str(t.status),dueAt:date(t.due_at),text:str(t.task)},[`relationship_tasks:${t.id}`],"explicit_recorded_task","recorded_fact"));
  missing.push(issue("coverage_not_established","Historical and mailbox completeness are not established; absence is not proof of no activity.",ids));
  if(policy.partialSources?.length)missing.push(issue("partial_read",`Incomplete source coverage: ${policy.partialSources.join(", ")}`,ids));
  if(contacts.length>1){contradictions.push(issue("projection_identity_split","Structural association spans multiple legacy lifecycle identities.",ids));actionable="blocked";next="Review conflicting legacy identity projections";due=null;}
  const facts=members.flatMap(n=>["author_name","target_name","person","person_name","company","role_title"].flatMap(field=>str(n.row[field])?[fact({field,value:str(n.row[field])},[key(ref(n.table,n.row))],"stored_field","recorded_fact")]:[]));
  for(const e of manualEmail)if(email(obj(e.details).route))facts.push(fact({field:"manually_recorded_email_route",value:email(obj(e.details).route)!},[`relationship_activity_events:${e.id}`],"manual_route_is_not_verified_alias","recorded_fact"));
  const stableId=`${prefix[anchor.table]}_${anchor.id}`;
  if(!prefix[anchor.table])throw Error("Unsupported relationship anchor.");
  const evidenceIds=[...ids,...timeline.map(e=>e.id)];
  return {schemaVersion:1,asOf:new Date(now).toISOString(),relationshipId:stableId,anchor:{...anchor},acceptedLocators:refs.map(r=>`${prefix[r.table]}_${r.id}`).concat(workspaceIds.map(id=>`workspace_${id}`)).sort(),entityKind:company?"company":"person",verifiedAliases:aliases,sourceRecords:refs,evidenceTimeline:[...new Map(timeline.map(e=>[e.id,e])).values()].sort((a,b)=>String(a.at||a.recordedAt).localeCompare(String(b.at||b.recordedAt))||a.id.localeCompare(b.id)),recordedFacts:facts,
    latestConfirmedInbound:fact(inbound,inbound?[inbound.id]:ids,"dated_recorded_inbound",inbound?"recorded_fact":"uncertainty"),latestConfirmedOutbound:fact(outbound,outbound?[outbound.id]:ids,"verified_receipt_or_recorded_delivery",outbound?"recorded_fact":"uncertainty"),
    lifecycleStage:fact(current?.currentStage||"not_established",ids,"legacy_lifecycle_on_structurally_associated_sources"),actionableState:fact(actionable,evidenceIds,"shadow_action_evidence_v1"),nextLegitimateAction:fact(next,evidenceIds,"shadow_next_action_v1"),dueDate:fact(due,evidenceIds,due?"supported_existing_due_date":"due_date_not_established",due?"derived_operational_state":"uncertainty"),commitments,suppressionReasons:suppression,contradictions,missingEvidence:missing,interpretations:[],
    replyState:fact(pending.length?hasReplyText?"reply_text_recorded":"reply_detected_text_unavailable":notifications.length?"explicitly_handled_notification":inbound?"recorded_inbound":"not_established",evidenceIds,"reply_evidence_without_sentiment"),relatedFounderContacts,readOnly:true};
}

