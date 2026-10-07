import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { readLifecycleInput } from "@/lib/lifecycleSnapshot.server";
import { buildContactLifecycle } from "@/lib/contactLifecycle";
import { humanReplyClasses, partnerActivity } from "@/lib/partnerConversation";
import type { EngineState } from "@/lib/engineState";

const text = (v: unknown) => typeof v === "string" ? v : "";
export async function readPartnerConversation(organisationId: string, itemId: string) {
  const input = await readLifecycleInput(organisationId);
  const item = input.acquisition_items.find(r => r.organisation_id === organisationId && r.id === itemId && r.record_type === "partner_opportunity");
  if (!item) throw Error("Partner opportunity not found.");
  const contact = buildContactLifecycle(organisationId, input).find(c => c.records.some(r => r.table === "acquisition_items" && r.id === itemId));
  const metadata = item.metadata && typeof item.metadata === "object" ? item.metadata as Record<string,unknown> : {};
  const email = text((item.engine_state as EngineState | null)?.email || metadata.email).trim().toLowerCase();
  const replies = input.inbox_items.filter(r => email && text(r.sender_email).trim().toLowerCase() === email && r.organisation_id === organisationId && r.platform === "email" && humanReplyClasses.includes(text(r.email_classification)) && text(r.text).trim() && contact?.records.some(ref => ref.table === "inbox_items" && ref.id === r.id))
    .sort((a,b) => text(b.created_at_platform || b.inserted_at).localeCompare(text(a.created_at_platform || a.inserted_at)));
  // Multiple threads for the same identity are not evidence of the same conversation.
  const threads = new Set(replies.map(r => text(r.email_thread_id) || r.id));
  const reply = threads.size === 1 ? replies[0] : undefined;
  const activity = partnerActivity("partner_opportunity", item.engine_state as EngineState | null);
  if (!reply) return { itemId, canGenerate: false, reason: threads.size > 1 ? "Multiple conversations match this partner. Open Responses and select the intended thread." : "No verified human reply has been imported for this partner yet.", responseId: null, activity: activity?.label || null };
  const threadId = text(reply.email_thread_id);
  const { data, error } = threadId ? await supabaseAdmin.from("email_conversation_messages").select("direction,body,subject,sent_at,sender_email,recipient_email")
    .eq("organisation_id", organisationId).eq("gmail_thread_id", threadId).order("sent_at", { ascending: false }).limit(51) : { data: [], error: null };
  if (error) throw error;
  const thread = (data || []).slice(0,50).reverse();
  const inboundAt = Date.parse(text(reply.created_at_platform || reply.inserted_at));
  const laterOutbound = activity?.answered || thread.some(m => m.direction === "outbound" && Date.parse(m.sent_at) > inboundAt) || Date.parse(text(reply.email_sent_at || reply.last_replied_at)) > inboundAt;
  const closed = ["converted", "lost", "dismissed"].includes(text(item.status)) || ["converted", "lost", "no_reply_needed"].includes(contact?.currentStage || "");
  const uncertain = ["approved", "dispatching"].includes(text(reply.email_delivery_status));
  const stale = !!(item.engine_state as EngineState | null)?.last_inbound_at && Date.parse((item.engine_state as EngineState).last_inbound_at!) > inboundAt;
  const reason = closed ? "This relationship is closed; no reply draft is appropriate." : uncertain ? "Delivery is pending or uncertain. Verify it before drafting again." : stale ? "A newer inbound event is recorded by the source. Wait for its email content to be imported." : laterOutbound ? "Response sent · Waiting on them" : null;
  return { itemId, canGenerate: !reason, reason, responseId: reply.id, activity: laterOutbound ? "Response sent · Waiting on them" : "Inbound reply received",
    context: { partner: { company: item.company, person: item.person, evidence: item.evidence, signal: item.signal, queueStatus: item.status, engineState: item.engine_state, safety: metadata.engine_safety },
      inbound: { subject: reply.email_subject, body: reply.text, at: reply.created_at_platform || reply.inserted_at }, thread, threadTruncated: (data || []).length > 50 } };
}
