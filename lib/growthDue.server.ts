import { readLifecycleInput } from "@/lib/lifecycleSnapshot.server";
import { buildContactLifecycle, type LifecycleInput } from "@/lib/contactLifecycle";
import { isGrowthTargetDue } from "@/lib/growthOutreach";

export function lifecycleDueTargets(organisationId: string, input: LifecycleInput, now = Date.now()) {
  const actionable = new Set(buildContactLifecycle(organisationId, input, now)
    .filter(contact => ["outreach_ready", "follow_up"].includes(contact.currentStage) && contact.actionRecord.table === "growth_targets")
    .map(contact => contact.actionRecord.id));
  return input.growth_targets.filter(row => row.organisation_id === organisationId && row.status === "active" && actionable.has(row.id) && isGrowthTargetDue({ stage: String(row.stage || ""), last_action_at: String(row.last_action_at || ""), reply_status: String(row.reply_status || "") }, now));
}
export async function readDueGrowthTargets(organisationId: string) {
  return lifecycleDueTargets(organisationId, await readLifecycleInput(organisationId));
}
