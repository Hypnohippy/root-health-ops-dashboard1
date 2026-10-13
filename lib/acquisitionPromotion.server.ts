import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { lifecycleLinkedInIdentity } from "@/lib/contactLifecycle";
import { AcquisitionWorkflowError } from "@/lib/acquisitionWorkflow";
import { personalActionPermitted } from "@/lib/personalOpportunityPolicy";
import { requirePersonalSource } from "@/lib/personalSourceHealth.server";
import { readPersonalOutreach } from "@/lib/personalOutreach.server";
import type { PersonalSignalItem } from "@/lib/personalSignal";

const text = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : null;
type Item = Record<string, unknown> & { metadata?: Record<string, unknown> };

export function acquisitionTarget(item: Item) {
  if (!["b2b_lead", "partner_opportunity"].includes(String(item.record_type)))
    throw new AcquisitionWorkflowError("Only business and partner opportunities can start direct outreach.");
  if (!["accepted", "actioned", "nurture"].includes(String(item.status)))
    throw new AcquisitionWorkflowError("Accept this opportunity before starting outreach.", 409);
  const meta = item.metadata || {};
  if(meta.founder_prior_contact===true) throw new AcquisitionWorkflowError("Prior Founder contact is recorded. Review the linked conversation before preparing initial outreach.",409);
  const linkedin = [item.source_url, meta.linkedin_url, meta.profile_url].map(lifecycleLinkedInIdentity).find(Boolean) || null;
  const email = text(meta.email)?.toLowerCase() || null;
  if (email && !/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(email))
    throw new AcquisitionWorkflowError("The recorded business email needs review.", 409);
  const company = text(item.company) || text(item.entity);
  if (item.source_engine === "linkedin_connection_network" && !linkedin)
    throw new AcquisitionWorkflowError("A valid LinkedIn profile is required.", 409);
  if (!linkedin && !(email && company))
    throw new AcquisitionWorkflowError("A reviewed business email and company, or a LinkedIn profile, is required. A company name alone is not a contact identity.", 409);
  return {
    target_name: text(item.person) || company || "LinkedIn contact", company,
    role_title: text(meta.buyer_role) || text(meta.headline), email, linkedin_identity: linkedin,
    linkedin_url: linkedin ? `https://${linkedin}` : null,
    notes: [text(item.evidence), text(item.signal), text(item.reason), text(item.source_url),
      text(meta.accepted_connection_name) ? `Suggested via ${text(meta.accepted_connection_name)}` : null].filter(Boolean).join("\n\n") || null,
  };
}

/** Both routes use this transaction; no send or delivery claims. */
export async function promoteAcquisition(organisationId: string, userId: string, itemId: string, key: string, action = "prepare_outreach", note: string | null = null) {
  const { data: item, error } = await supabaseAdmin.from("acquisition_items").select("*")
    .eq("organisation_id", organisationId).eq("id", itemId).maybeSingle();
  if (error) throw error;
  if (!item) throw new AcquisitionWorkflowError("Acquisition item not found.", 404);
  if (item.source_engine === "root_health_personal") {
    if (!personalActionPermitted(item as PersonalSignalItem, action) || item.record_type !== "partner_opportunity") throw new AcquisitionWorkflowError("Audience Intelligence cannot start private outreach or enter the contact pipeline.", 409);
    const context = await readPersonalOutreach(organisationId, itemId);
    if (!context.canStart) throw new AcquisitionWorkflowError(context.reason || "Initial outreach is not available.", 409);
    await requirePersonalSource(organisationId, item as PersonalSignalItem);
  }
  if(typeof item.metadata?.founder_research_id==="string") {
    const {data:history,error:historyError}=await supabaseAdmin.from("founder_activity_events").select("id").eq("organisation_id",organisationId).eq("research_record_id",item.metadata.founder_research_id).in("activity_type",["emailed","linkedin_contacted","called","linked_gmail_evidence"]).limit(1);
    if(historyError)throw historyError;
    if(history?.length)throw new AcquisitionWorkflowError("Founder contact activity exists. Review the current relationship before initial outreach.",409);
  }
  const target = acquisitionTarget(item);
  const { data, error: promotionError } = await supabaseAdmin.rpc("promote_acquisition_target", {
    p_organisation_id: organisationId, p_item_id: itemId, p_actor: userId,
    p_key: key, p_action: action, p_note: note, p_updated_at: item.updated_at, p_target: target,
  });
  if (promotionError) {
    if (/ambiguous|identity_conflict|changed|idempotency_key_reused/.test(promotionError.message))
      throw new AcquisitionWorkflowError("Contact identity or source state changed or is ambiguous. Refresh and review the existing records before retrying.", 409);
    throw promotionError;
  }
  const params = new URLSearchParams({ organisationId, targetId: data.targetId, acquisitionItemId: itemId });
  return { success: true, ...data, destination: `/dashboard/growth/pipeline?${params}` };
}
