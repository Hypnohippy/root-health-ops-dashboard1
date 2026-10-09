import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { readLifecycleInput } from "@/lib/lifecycleSnapshot.server";
import { planLinkedInCadenceBackfill } from "@/lib/linkedinCadenceBackfill";
import { linkedInOutreachQueue } from "@/lib/linkedinOutreach";
import { readOutreachSelfIdentity } from "@/lib/outreachSelfIdentity.server";
import { validateSendInput, sendReceipts } from "@/lib/linkedinSendEvidence";
export async function reconcileLinkedInSend(org: string, actor: string, body: Record<string, unknown>) {
 if (!["inbox_items", "growth_targets"].includes(String(body.table)) || typeof body.id !== "string" || typeof body.revision !== "string") throw Error("Invalid LinkedIn record.");
 const details = validateSendInput(body);
 const table = body.table as "inbox_items" | "growth_targets";
 const input = await readLifecycleInput(org, false);
 const row = input[table].find(r => r.id === body.id && r.organisation_id === org);
 if (!row) throw Error("LinkedIn record not found.");
 if (sendReceipts(row.manual_completion).some(r => r.key === body.key)) return { duplicate: true };
 const plan = planLinkedInCadenceBackfill(org, input);
 const review = plan.review.find(r => r.table === table && r.id === body.id);
 const selected = linkedInOutreachQueue(org, plan.projected, Date.now(), "all", [], Infinity, await readOutreachSelfIdentity(org, actor)).items.find(r => r.table === table && r.id === body.id);
 const correction = body.action === "classify_send";
 if (correction ? !review : !selected) throw Error("State changed or this contact is not eligible. Reload before confirming.");
 if (correction && details.choice === "now" || !correction && details.choice === "today") throw Error("Choose the appropriate send classification.");
 if (correction && details.message !== review!.message) throw Error("Preserve the exact original message when classifying its send date.");
 if (details.choice === "today") {
  const day = (at: string) => new Intl.DateTimeFormat("en-CA", { timeZone: details.timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(at));
  if (!review?.confirmedAt || day(details.sentAt!) !== day(review.confirmedAt)) throw Error("Sent today must match the original confirmation day. Use historical classification for an earlier date.");
 }
 const { data, error } = await supabaseAdmin.rpc("record_linkedin_send_evidence", { p_organisation_id: org, p_actor: actor, p_table: table, p_id: body.id, p_revision: body.revision, p_key: body.key, p_details: { ...details, correction, sentStage: selected?.stage || "connection" } });
 if (error) throw Error("Confirmation was not recorded. Reload and retry with the same receipt key. This Preview requires the reconciliation schema; do not repeat the LinkedIn send.");
 return data;
}
