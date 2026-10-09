import { buildContactLifecycle, type LifecycleInput } from "@/lib/contactLifecycle";
import { linkedInRecordedEvidence } from "@/lib/linkedinOutreach";
import { firstSendEvidence, externalSentAt, sendReceipts, record } from "@/lib/linkedinSendEvidence";
import { cadenceDays, elapsedCadenceStage, nextGrowthStage, outreachStages } from "@/lib/growthOutreach";
export const cadenceLabels = { waiting_day3: "Waiting for Day 3", day3_followup: "Day 3 follow-up due", day7_parity: "Day 7 conversation due", day14_insight: "Day 14 insight due", day28_relevance: "Day 28 relevance due", day42_close: "Day 42 final message due", parked: "Parked" };
export const exclusionLabels = { replies: "Genuine reply recorded", stronger_states: "Stronger lifecycle state", historical_unknown: "Historical send date unknown", actual_send_unverified: "Actual send date unverified", never_contacted: "Never contacted — verified acceptance, no confirmed send", no_identity: "No verified LinkedIn identity or acceptance; no send evidence", no_identity_date_only: "No verified LinkedIn identity or acceptance; date-only marks", no_acceptance_date_only: "LinkedIn identity but no verified acceptance; date-only marks", no_acceptance: "No verified connection acceptance", date_only: "Verified acceptance but only a date; message/receipt missing", ownership: "Owned by another workflow", ambiguity: "Ambiguous or conflicting identity/connection", incomplete_receipt: "Incomplete receipt: message, actor, key or evidence missing", ineligible: "Inactive, ambiguous target or explicit next step" };
export function planLinkedInCadenceBackfill(org: string, input: LifecycleInput, now = Date.now()) {
 const counts = { waiting_day3: 0, day3_followup: 0, day7_parity: 0, day14_insight: 0, day28_relevance: 0, day42_close: 0, parked: 0 };
 const moves = { ...counts };
 const excluded = Object.fromEntries(Object.keys(exclusionLabels).map(k => [k, 0])) as Record<keyof typeof exclusionLabels, number>;
 const repairs: { id: string | null; patch: Record<string, unknown> }[] = [];
 const review: { name: string; table: "growth_targets" | "inbox_items"; id: string; message: string; confirmedAt: string | null; status: string }[] = [];
 const projected: LifecycleInput = { ...input, growth_targets: input.growth_targets.map(r => ({ ...r })) };
 for (const contact of buildContactLifecycle(org, input, now)) {
  if (contact.channel !== "linkedin") continue;
  const rows = contact.records.map(ref => input[ref.table].find(r => r.id === ref.id && r.organisation_id === org)!);
  if (rows.some(r => r.replied_at || r.reply_status && r.reply_status !== "no_reply" || r.platform === "linkedin" && r.kind === "dm" && r.text)) { excluded.replies++; continue; }
  if (rows.some(r => ["closed", "lost", "nurture", "converted", "archived"].includes(String(r.status)) || ["meeting", "lost", "closed", "converted", "won", "nurture", "engaged", "opportunity"].includes(String(r.deal_stage))) || ["meeting", "nurture", "lost", "converted", "dismissed", "no_reply_needed", "engaged", "needs_reply"].includes(contact.currentStage)) { excluded.stronger_states++; continue; }
  // Match the console: acceptance importer provenance is not workflow ownership.
  if (contact.engineEvidence.length || rows.some(r => !(r.platform === "linkedin" && r.kind === "connection_accepted") && (r.engine_state || ["root_health_b2b", "google_b2b_lead_engine", "root_health_personal"].includes(String(r.source_engine || r.source_type)) || ["root_health_b2b", "google_b2b_lead_engine"].includes(String(record(r.metadata).source))))) { excluded.ownership++; continue; }
  const evidence = linkedInRecordedEvidence(rows, contact.identity, now);
  const dated = rows.some(r => r.last_action_at || r.contacted_at || r.last_replied_at);
  if (!evidence.acceptance) {
   excluded[!contact.identity.startsWith("linkedin:") ? dated ? "no_identity_date_only" : "no_identity" : dated ? "no_acceptance_date_only" : "no_acceptance"]++; continue;
  }
  if (evidence.contradictory || evidence.ambiguous) { excluded.ambiguity++; continue; }
  const targetIds = new Set(contact.records.filter(r => r.table === "growth_targets").map(r => r.id));
  const targets = projected.growth_targets.filter(r => targetIds.has(r.id) && r.organisation_id === org);
  if (targets.length > 1) { excluded.ineligible++; continue; }
  let target = targets[0];
  const receiptRow = target?.manual_completion ? target : evidence.acceptance;
  const first = firstSendEvidence(receiptRow.manual_completion, now);
  if (first.status !== "verified") {
   if (first.receipt) {
    excluded[first.status === "unknown" ? "historical_unknown" : "actual_send_unverified"]++;
    const receipt = record(receiptRow.manual_completion);
    // Only original first-step receipts are eligible for first-send classification.
    if ((receipt.stage === "connection" || !receipt.stage && (!Array.isArray(receipt.history) || !receipt.history.length)) && (!target || ["day3_dm", "day3_followup", "connection"].includes(String(target.stage)))) review.push({ name: contact.name || "LinkedIn contact", table: receiptRow === target ? "growth_targets" : "inbox_items", id: receiptRow.id, message: String(first.receipt.message), confirmedAt: typeof receipt.confirmed_at === "string" ? receipt.confirmed_at : typeof receipt.completed_at === "string" ? receipt.completed_at : null, status: first.status });
   } else excluded[receiptRow.manual_completion ? "incomplete_receipt" : dated ? "date_only" : "never_contacted"]++;
   continue;
  }
  if (!target) target = { id: "__new__" + evidence.acceptance.id, organisation_id: org, target_name: contact.name, linkedin_identity: contact.identity.slice(9), linkedin_url: "https://" + contact.identity.slice(9), stage: "day3_followup", status: "active", source_type: "lifecycle_connection_accepted", source_record_id: evidence.acceptance.id, manual_completion: receiptRow.manual_completion };
  if (target.next_step || !["active", "waiting", "parked"].includes(String(target.status))) { excluded.ineligible++; continue; }
  if (!target.manual_completion) target.manual_completion = receiptRow.manual_completion;
  const firstAt = first.sentAt!;
  const sentStages = sendReceipts(target.manual_completion).filter(r => externalSentAt(r, now) && outreachStages.includes(r.stage as typeof outreachStages[number])).map(r => nextGrowthStage(String(r.stage)));
  const floor = Math.max(1, ...sentStages.map(s => outreachStages.indexOf(s)));
  const stage = outreachStages[Math.max(outreachStages.indexOf(elapsedCadenceStage(firstAt, now)), floor)];
  const patch = { stage, first_outbound_at: firstAt, first_outbound_text: String(first.receipt!.message), status: stage === "parked" ? "parked" : target.status };
  const original = input.growth_targets.find(r => r.id === target.id);
  Object.assign(target, patch);
  const key = stage === "day3_followup" && now < Date.parse(firstAt) + cadenceDays[stage] * 86400000 ? "waiting_day3" : stage as keyof typeof counts;
  counts[key]++;
  if (!original || original.stage !== stage) moves[key]++;
  if (!original) repairs.push({ id: null, patch: { ...target, id: undefined, organisation_id: undefined } });
  else if (Object.entries(patch).some(([k, v]) => original[k] !== v)) repairs.push({ id: target.id, patch });
 }
 return { asOf: new Date(now).toISOString(), organisationId: org, counts, moves, excluded, repairs, projected, review };
}
