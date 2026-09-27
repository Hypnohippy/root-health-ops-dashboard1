import { reconcileLifecycle } from "@/lib/lifecycleReconciliation.server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { readLifecycleInput } from "@/lib/lifecycleSnapshot.server";
import { planManualCompletion, type ManualTable } from "@/lib/operationalGovernor";
import { getResponseContactContext } from "@/lib/responseContactContext.server";
import { getOrganisationGenerationProfile } from "@/lib/organisationProfile.server";

async function revision(organisationId: string) {
  const { data, error } = await supabaseAdmin.from("lifecycle_revisions").select("revision").eq("organisation_id", organisationId).maybeSingle();
  if (error) throw error;
  return String(data?.revision || "0");
}
export async function prepareManualCompletion(organisationId: string, table: ManualTable, id: string) {
  const before = await revision(organisationId);
  const input = await readLifecycleInput(organisationId);
  const plan = planManualCompletion(organisationId, input, table, id);
  if (plan.allowed && table === "inbox_items" && plan.row.kind === "comment") {
    const context = await getResponseContactContext(organisationId, id, await getOrganisationGenerationProfile(organisationId));
    if (!context.socialOpportunity?.eligible) { plan.allowed = false; plan.reason = context.socialOpportunity?.reason || "Public safety evidence required."; }
  }
  if (before !== await revision(organisationId)) throw new Error("State changed. Refresh before takeover.");
  return { ...plan, revision: before };
}
export async function completeManualAction(organisationId: string, actor: string, request: { table: ManualTable; id: string; revision: string; key: string; completedAt: string; evidence: string; message: string }) {
  const plan = await prepareManualCompletion(organisationId, request.table, request.id);
  const previous = plan.row.manual_completion as Record<string, unknown> | null;
  if (previous?.key === request.key || (Array.isArray(previous?.history) && previous.history.some((receipt: { key?: string }) => receipt.key === request.key))) return { duplicate: true, reconciliationErrors: (await reconcileLifecycle(organisationId)).errors };
  if (!plan.allowed || plan.revision !== request.revision) throw new Error(plan.allowed ? "State changed. Refresh before takeover." : plan.reason);
  const at = Date.parse(request.completedAt);
  if (!Number.isFinite(at) || at > Date.now() || !request.evidence.trim()) throw new Error("Provide the actual completion time and evidence.");
  const priorAction = plan.contact.lastAction?.at;
  if (priorAction && at < Date.parse(priorAction)) throw new Error("Completion predates current evidence. Review without changing state.");
  const patch: Record<string, unknown> = { ...plan.patch };
  if (request.table === "growth_targets") { patch.last_action_at = new Date(at).toISOString(); patch.last_reply_text = request.message || null; }
  else { patch.last_replied_at = new Date(at).toISOString(); patch.last_reply_text = request.message || null; if (plan.row.kind === "connection_accepted") patch.contacted_at = new Date(at).toISOString(); }
  const { data, error } = await supabaseAdmin.rpc("record_manual_completion", { p_organisation_id: organisationId, p_actor: actor, p_table: request.table, p_id: request.id,
    p_revision: request.revision, p_key: request.key, p_completed_at: new Date(at).toISOString(), p_evidence: request.evidence, p_patch: patch });
  if (error) throw new Error("Completion could not be confirmed. Refresh or retry with the same receipt key; do not repeat the external action.");
  return { ...data, reconciliationErrors: (await reconcileLifecycle(organisationId)).errors };
}
