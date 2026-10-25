import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { readLifecycleInput } from "@/lib/lifecycleSnapshot.server";
import { planLinkedInCadenceBackfill } from "@/lib/linkedinCadenceBackfill";
import { linkedInOutreachQueue } from "@/lib/linkedinOutreach";
import { readOutreachSelfIdentity } from "@/lib/outreachSelfIdentity.server";
import { outreachConfirmationState } from "@/lib/linkedinWorkbench";
import { validateSendInput, sendReceipts } from "@/lib/linkedinSendEvidence";
export class LinkedInConfirmationError extends Error {
 constructor(public code: "STALE_SEND_REVISION" | "SEND_STATE_CHANGED" | "SEND_RECEIPT_MISMATCH", message: string) { super(message); }
}
async function currentRevision(org: string) {
 const { data, error } = await supabaseAdmin.from("lifecycle_revisions").select("revision").eq("organisation_id", org).maybeSingle();
 if (error) throw Error("Current confirmation state is unavailable. No LinkedIn message will be sent. Reload safely.");
 return String(data?.revision || "0");
}
const stale = () => new LinkedInConfirmationError("STALE_SEND_REVISION", "Ops refreshed the latest state. Your LinkedIn message will NOT be sent again. Retry recording this same send.");
export async function reconcileLinkedInSend(org: string, actor: string, body: Record<string, unknown>) {
 if (!["inbox_items", "growth_targets"].includes(String(body.table)) || typeof body.id !== "string" || typeof body.revision !== "string") throw Error("Invalid LinkedIn record.");
 const details = validateSendInput(body);
 const table = body.table as "inbox_items" | "growth_targets";
 const revision = await currentRevision(org);
 const input = await readLifecycleInput(org, false);
 const row = input[table].find(r => r.id === body.id && r.organisation_id === org);
 if (!row) throw Error("LinkedIn record not found.");
 const existing = sendReceipts(row.manual_completion).find(receipt => receipt.key === body.key);
 if (existing) {
  const correction = body.action === "classify_send";
  const mismatched = existing.actor !== actor || existing.message !== details.message ||
   existing.content_kind && existing.content_kind !== details.contentKind ||
   existing.correction_type && (existing.correction_type === "first_send_classification") !== correction ||
   existing.source && existing.source !== details.source ||
   details.choice !== "now" && (existing.sent_at ? Date.parse(String(existing.sent_at)) !== Date.parse(String(details.sentAt)) : details.sentAt !== null);
  if (mismatched) throw new LinkedInConfirmationError("SEND_RECEIPT_MISMATCH", "This receipt does not match the original confirmation. Reload current state and review the recorded history; do not send again.");
  return { duplicate: true };
 }
 const plan = planLinkedInCadenceBackfill(org, input);
 const review = plan.review.find(r => r.table === table && r.id === body.id);
 const selected = linkedInOutreachQueue(org, plan.projected, Date.now(), "all", [], Infinity, await readOutreachSelfIdentity(org, actor)).items.find(r => r.table === table && r.id === body.id);
 const correction = body.action === "classify_send";
 if (correction ? !review : !selected) throw new LinkedInConfirmationError("SEND_STATE_CHANGED", "This contact is no longer eligible for the original confirmation. Reload current state and review Already sent previously; do not send again.");
 // A stale request can only be rebased on an explicit retry with the original operational scope.
 // The browser never supplies the replacement revision; the RPC still enforces this fresh snapshot atomically.
 const stateMatches = !correction && typeof body.confirmationState === "string" && body.confirmationState === outreachConfirmationState(selected!);
 if (!correction && body.confirmationState !== undefined && !stateMatches || body.retryConfirmation === true && !stateMatches) throw new LinkedInConfirmationError("SEND_STATE_CHANGED", "The contact, stage or send evidence changed. The original confirmation cannot be safely retried. Reload current state and review Already sent previously; do not send again.");
 if (revision !== await currentRevision(org)) throw stale();
 if (revision !== body.revision && !correction && body.confirmationState === undefined) throw new LinkedInConfirmationError("SEND_STATE_CHANGED", "Reload current state to update this older confirmation's safety checks, then review Already sent previously. Ops will not send a LinkedIn message.");
 if (revision !== body.revision && !(body.retryConfirmation === true && stateMatches)) throw stale();
 if (correction && details.choice === "now" || !correction && details.choice === "today") throw Error("Choose the appropriate send classification.");
 if (correction && details.message !== review!.message) throw Error("Preserve the exact original message when classifying its send date.");
 if (details.choice === "today") {
  const day = (at: string) => new Intl.DateTimeFormat("en-CA", { timeZone: details.timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(at));
  if (!review?.confirmedAt || day(details.sentAt!) !== day(review.confirmedAt)) throw Error("Sent today must match the original confirmation day. Use historical classification for an earlier date.");
 }
 // The existing RPC stamps a null now-send date with its own confirmed clock.
 // Historical dates retain explicit application and SQL validation.
 const { data, error } = await supabaseAdmin.rpc("record_linkedin_send_evidence", { p_organisation_id: org, p_actor: actor, p_table: table, p_id: body.id, p_revision: body.retryConfirmation === true && stateMatches ? revision : body.revision, p_key: body.key, p_details: { ...details, sentAt: details.choice === "now" ? null : details.sentAt, correction, sentStage: selected?.stage || "connection" } });
 if (error && String(error.message || "").includes("stale_send_plan")) throw stale();
 if (error) throw Error("Ops could not verify this confirmation. Retry recording the same receipt or reload current state. No LinkedIn message will be sent.");
 return data;
}
