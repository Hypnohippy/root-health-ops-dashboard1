import { buildContactLifecycle, type LifecycleInput } from "@/lib/contactLifecycle";
import { linkedInRecordedEvidence } from "@/lib/linkedinOutreach";
import { cadenceDays, elapsedCadenceStage, nextGrowthStage, outreachStages } from "@/lib/growthOutreach";
const object = (v: unknown): Record<string, unknown> => v && typeof v === "object" ? v as Record<string,unknown> : {};
export function planLinkedInCadenceBackfill(org: string, input: LifecycleInput, now = Date.now()) {
  const counts = { waiting_day3: 0, day3_followup: 0, day7_parity: 0, day14_insight: 0, day28_relevance: 0, day42_close: 0, parked: 0 };
  const moves = { ...counts };
  const excluded = { replies: 0, stronger_states: 0, missing_evidence: 0, source_or_eligibility: 0 };
  const repairs: { id: string | null; patch: Record<string,unknown> }[] = [];
  const projected: LifecycleInput = { ...input, growth_targets: input.growth_targets.map(r=>({...r})) };
  for (const contact of buildContactLifecycle(org,input,now)) {
    if (contact.channel !== "linkedin") continue;
    const rows = contact.records.map(ref=>input[ref.table].find(r=>r.id===ref.id && r.organisation_id===org)!);
    if (rows.some(r=>r.replied_at || (r.reply_status && r.reply_status!=="no_reply") || (r.platform==="linkedin" && r.kind==="dm" && r.text))) { excluded.replies++; continue; }
    if (rows.some(r=>["closed","lost","nurture","converted"].includes(String(r.status))) || ["meeting","nurture","lost","converted","dismissed","no_reply_needed","engaged","needs_reply"].includes(contact.currentStage)) { excluded.stronger_states++; continue; }
    const evidence = linkedInRecordedEvidence(rows,contact.identity,now);
    const targetIds = new Set(contact.records.filter(r=>r.table==="growth_targets").map(r=>r.id));
    const targets = projected.growth_targets.filter(r=>r.organisation_id===org && targetIds.has(r.id));
    let target = targets[0];
    if (!target && targets.length===0 && evidence.acceptance && evidence.previousOutbound && !evidence.contradictory && !evidence.ambiguous) {
      target={id:"__new__"+evidence.acceptance.id,organisation_id:org,target_name:contact.name || evidence.acceptance.author_name,linkedin_identity:contact.identity.replace(/^linkedin:/,""),linkedin_url:"https://"+contact.identity.replace(/^linkedin:/,""),stage:"day3_followup",status:"active",last_action_at:evidence.previousOutbound.sentAt,source_type:"lifecycle_connection_accepted",source_record_id:evidence.acceptance.id};
      targets.push(target);
    }
    if (!evidence.acceptance || evidence.contradictory || evidence.ambiguous || targets.length!==1 || !evidence.previousOutbound || !target) { excluded.missing_evidence++; continue; }
    if (target.next_step || !["active","waiting"].includes(String(target.status)) || rows.some(r=>r.engine_state || ["root_health_b2b","google_b2b_lead_engine","root_health_personal"].includes(String(r.source_engine || r.source_type)))) { excluded.source_or_eligibility++; continue; }
    const acceptance = evidence.acceptance;
    const receipt = object(acceptance.manual_completion);
    const targetReceipt = object(target.manual_completion);
    const provenFirst = [targetReceipt,...(Array.isArray(targetReceipt.history) ? targetReceipt.history.map(object) : [])].filter(r=>r.stage==="connection" && r.key && r.actor && r.evidence && r.message && r.completed_at).sort((a,b)=>String(a.completed_at).localeCompare(String(b.completed_at)))[0];
    const firstAt = typeof target.first_outbound_at==="string" ? target.first_outbound_at : typeof receipt.completed_at==="string" && receipt.message && receipt.key && receipt.actor && receipt.evidence ? receipt.completed_at : acceptance.status==="replied" && acceptance.contacted_at && acceptance.contacted_at===acceptance.last_replied_at && acceptance.last_reply_text ? String(acceptance.contacted_at) : provenFirst ? String(provenFirst.completed_at) : null;
    if (!firstAt || !Number.isFinite(Date.parse(firstAt)) || Date.parse(firstAt)>now) { excluded.missing_evidence++; continue; }
    const firstText = target.first_outbound_text || receipt.message || acceptance.last_reply_text || provenFirst?.message;
    if (!firstText) { excluded.missing_evidence++; continue; }
    const sentStages=[targetReceipt,...(Array.isArray(targetReceipt.history) ? targetReceipt.history.map(object) : [])].filter(r=>r.key && r.actor && r.evidence && r.message && r.completed_at && Date.parse(String(r.completed_at))<=now && outreachStages.includes(r.stage as typeof outreachStages[number])).map(r=>nextGrowthStage(String(r.stage)));
    const floor=Math.max(1,...sentStages.map(stage=>outreachStages.indexOf(stage)));
    const elapsed = elapsedCadenceStage(firstAt,now);
    const stage = outreachStages[Math.max(outreachStages.indexOf(elapsed),floor)];
    const patch = { stage, first_outbound_at: firstAt, first_outbound_text: firstText, status: stage==="parked" ? "parked" : target.status };
    Object.assign(target,patch);
    const waiting = stage==="day3_followup" && now < Date.parse(firstAt)+cadenceDays[stage]*86400000;
    counts[waiting ? "waiting_day3" : stage as keyof typeof counts]++;
    const original = input.growth_targets.find(r=>r.id===target.id && r.organisation_id===org);
    if (!original) { moves[waiting ? "waiting_day3" : stage as keyof typeof moves]++; repairs.push({id:null,patch:{...target,id:undefined,organisation_id:undefined}});continue; }
    if (original.stage!==stage) moves[waiting ? "waiting_day3" : stage as keyof typeof moves]++;
    if (Object.entries(patch).some(([k,v])=>original[k]!==v)) repairs.push({id:target.id,patch});
  }
  return { asOf: new Date(now).toISOString(), organisationId: org, counts, moves, excluded, repairs, projected };
}
