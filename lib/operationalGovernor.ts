import { buildContactLifecycle, type LifecycleInput, type LifecycleRow } from "@/lib/contactLifecycle";
import { nextGrowthStage } from "@/lib/growthOutreach";
import type { ControlItem } from "@/lib/homeControl";

export type ManualTable = "inbox_items" | "growth_targets";
export function governorDecision(item: Pick<ControlItem, "operationalState" | "humanReason" | "nextAction">) {
  return { state: item.operationalState === "human_action_required" ? "waiting" : item.operationalState,
    reason: item.humanReason === "by_design" ? "human_by_design" : item.humanReason,
    remainingAction: item.nextAction, mayAutoExecute: false as const };
}
const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
export function planManualCompletion(organisationId: string, input: LifecycleInput, table: ManualTable, id: string) {
  const row = input[table].find(r => r.id === id && r.organisation_id === organisationId);
  if (!row) throw new Error("Record not found.");
  const contact = buildContactLifecycle(organisationId, input).find(c => c.records.some(r => r.table === table && r.id === id));
  if (!contact) throw new Error("Lifecycle unavailable.");
  const blocked = (reason: string) => ({ allowed: false, reason, row, contact, patch: {} as Record<string, unknown> });
  const acquisition = input.acquisition_items.filter(r => r.organisation_id === organisationId && contact.records.some(ref => ref.table === "acquisition_items" && ref.id === r.id));
  // Never authorize new Personal contact using a receipt or a generic source label.
  if (acquisition.some(r => r.source_engine === "root_health_personal")) return blocked("Personal work must be verified in its source workflow; no generic manual completion override.");
  if (["converted", "lost", "dismissed", "nurture", "meeting", "no_reply_needed"].includes(contact.currentStage)) return blocked("The current lifecycle no longer permits this action. Review stronger evidence.");
  if (table === "growth_targets") {
    if (contact.actionRecord.table !== table || contact.actionRecord.id !== id || !["outreach_ready", "follow_up"].includes(contact.currentStage) || row.status !== "active" || (row.reply_status && row.reply_status !== "no_reply") || row.replied_at)
      return blocked("A reply, source-owned action, paused cadence or stronger evidence prevents outreach completion.");
    const stage = nextGrowthStage(String(row.stage));
    if (stage === row.stage) return blocked("No next cadence stage is defined.");
    return { allowed: true, reason: "Record the verified manual contact once; use the existing cadence.", row, contact, patch: { stage, status: stage === "parked" ? "parked" : "active" } };
  }
  if (row.status === "replied" || row.status === "archived" || row.manual_completion) return blocked("This response is already handled.");
  if (["approved", "dispatching"].includes(String(row.email_delivery_status))) return blocked("Delivery is in flight or uncertain. Verify with the provider before taking over.");
  if (contact.actionRecord.table !== table || contact.actionRecord.id !== id || !["outreach_ready", "needs_reply", "follow_up"].includes(contact.currentStage)) return blocked("This event is history or no reply is currently appropriate.");
  const acceptance = row.platform === "linkedin" && row.kind === "connection_accepted";
  if (!acceptance && row.platform !== "email" && row.kind !== "comment") return blocked("No manual DM or unsupported action is authorized.");
  return { allowed: true, reason: "Record actual manual completion, never an attempt.", row, contact,
    patch: { status: "replied", response_state: acceptance ? "waiting_for_human" : "engaged", follow_up_at: null } };
}
export function manualReceipt(row: LifecycleRow) { return object(row.manual_completion); }
