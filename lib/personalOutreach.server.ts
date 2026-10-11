import { readLifecycleInput } from "@/lib/lifecycleSnapshot.server";
import { buildContactLifecycle, lifecycleLinkedInIdentity } from "@/lib/contactLifecycle";
import { AcquisitionWorkflowError } from "@/lib/acquisitionWorkflow";
import type { PersonalSignalItem } from "@/lib/personalSignal";

export function projectPersonalOutreach(organisationId: string, itemId: string, input: Awaited<ReturnType<typeof readLifecycleInput>>) {
  const item = input.acquisition_items.find(i => i.id === itemId && i.source_engine === "root_health_personal" && i.record_type === "partner_opportunity") as ((typeof input.acquisition_items)[number] & PersonalSignalItem) | undefined;
  if (!item) throw new AcquisitionWorkflowError("Personal partner not found.", 404);
  const m = (item.metadata || {}) as Record<string, unknown>, safety = m.engine_safety as Record<string, unknown> | undefined;
  const email = typeof m.email === "string" && /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(m.email) ? m.email : null;
  const identity = lifecycleLinkedInIdentity(m.linkedin_url || m.profile_url || item.source_url);
  const route = email ? `mailto:${email}` : identity ? `https://${identity}` : null;
  const contact = buildContactLifecycle(organisationId, input).find(c => c.records.some(r => r.table === "acquisition_items" && r.id === itemId));
  const linked = contact?.records || [];
  const prior = ["waiting", "follow_up", "needs_reply", "engaged", "meeting", "nurture", "converted", "lost", "dismissed", "no_reply_needed"].includes(contact?.currentStage || "") || linked.some(ref => {
    const row = input[ref.table].find(r => r.id === ref.id);
    const state = row?.engine_state as Record<string, unknown> | undefined;
    return !!(state?.last_outbound_at || state?.last_inbound_at || row?.contacted_at || row?.last_replied_at || row?.first_outbound_at || row?.manual_completion || row?.email_sent_at);
  });
  const replied = ["needs_reply", "engaged", "meeting"].includes(contact?.currentStage || "") || linked.some(ref => {
    const row = input[ref.table].find(r => r.id === ref.id); const state = row?.engine_state as Record<string, unknown> | undefined;
    return !!(row?.last_replied_at || state?.last_inbound_at);
  });
  const completed = ["actioned", "converted", "lost", "dismissed"].includes(item.status);
  const canStart = !!route && !prior && !completed && m.test !== true && safety?.verified_public_business === true && safety.public_context === true && safety.consumer_outreach === false && safety.health_targeting === false;
  return { item, route, canStart, relationship: replied ? "replied" : prior ? "contacted" : completed ? "completed" : "new", reason: prior ? "Previous contact or conversation exists. Continue that relationship; do not send another initial message." : !canStart ? "A verified public business contact route and safety evidence are required." : null,
    message: [m.prepared_outreach, m.outreach_draft, m.prepared_draft].find(v => typeof v === "string" && v.trim()) || "" };
}
export async function readPersonalOutreach(organisationId: string, itemId: string) {
  return projectPersonalOutreach(organisationId, itemId, await readLifecycleInput(organisationId, false));
}
