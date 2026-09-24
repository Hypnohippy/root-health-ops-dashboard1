import { NextResponse } from "next/server";
import { requireOrganisation, accessErrorResponse } from "@/lib/tenantAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { uuid } from "@/lib/growthIngestion.server";
import { dispatchApprovedEmail } from "@/lib/emailEngineDispatch.server";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = (await params).id; const body = await req.json().catch(() => ({}));
    if (!uuid.test(id) || !uuid.test(body.organisationId || "") || !uuid.test(body.idempotencyKey || "") || typeof body.approvedBody !== "string" || !body.approvedBody.trim() || body.approvedBody.length > 50000) return NextResponse.json({ error: "Invalid email approval." }, { status: 400 });
    const { organisationId, userId } = await requireOrganisation(body.organisationId, true);
    const { data: item, error: readError } = await supabaseAdmin.from("inbox_items")
      .select("id, sender_email, email_subject, email_thread_id, email_message_id, in_reply_to, source_engine, email_delivery_status")
      .eq("id", id).eq("organisation_id", organisationId).eq("platform", "email").maybeSingle();
    if (readError) throw readError;
    if (!item) return NextResponse.json({ error: "Email response not found." }, { status: 404 });
    if (!item.sender_email || !item.source_engine) return NextResponse.json({ error: "This response is missing its recipient or source engine." }, { status: 409 });
    const approvedBody = body.approvedBody.trim();
    const requestRow = { organisation_id: organisationId, inbox_item_id: id, actor_user_id: userId, source_engine: item.source_engine,
      recipient: item.sender_email, subject: item.email_subject || "", approved_body: approvedBody, gmail_thread_id: item.email_thread_id || null,
      gmail_message_id: item.email_message_id || null, in_reply_to: item.in_reply_to || null, approval_idempotency_key: body.idempotencyKey, status: "dispatching" };
    const inserted = await supabaseAdmin.from("email_send_requests").insert(requestRow).select("*").maybeSingle();
    let sendRequest = inserted.data; const insertError = inserted.error;
    if (insertError?.code === "23505") {
      const existing = await supabaseAdmin.from("email_send_requests").select("*").eq("organisation_id", organisationId).eq("inbox_item_id", id).maybeSingle();
      if (existing.error) throw existing.error; sendRequest = existing.data;
      if (!sendRequest) throw insertError;
      if (sendRequest.status === "sent" || sendRequest.status === "accepted" || sendRequest.status === "dispatching") return NextResponse.json({ success: true, duplicate: true, status: sendRequest.status, sendRequestId: sendRequest.id }, { status: sendRequest.status === "sent" ? 200 : 202 });
      if (sendRequest.approved_body !== approvedBody) return NextResponse.json({ error: "A failed send can only be retried with the same approved text." }, { status: 409 });
      const reset = await supabaseAdmin.from("email_send_requests").update({ status: "dispatching", engine_error: null, updated_at: new Date().toISOString() }).eq("id", sendRequest.id).eq("organisation_id", organisationId).select("*").maybeSingle();
      if (reset.error) throw reset.error; sendRequest = reset.data;
    } else if (insertError) throw insertError;
    if (!sendRequest) throw new Error("Unable to reserve email send.");
    await supabaseAdmin.from("inbox_items").update({ email_reply_draft: approvedBody, approved_response: approvedBody, email_delivery_status: "dispatching", response_updated_at: new Date().toISOString() }).eq("id", id).eq("organisation_id", organisationId);
    await supabaseAdmin.from("email_send_events").upsert({ organisation_id: organisationId, inbox_item_id: id, send_request_id: sendRequest.id, event_type: "approved", actor_user_id: userId, details: { body_length: approvedBody.length } }, { onConflict: "send_request_id,event_type", ignoreDuplicates: true });
    try {
      await dispatchApprovedEmail({ organisation_id: organisationId, response_item_id: id, send_request_id: sendRequest.id, source_engine: item.source_engine,
        gmail_thread_id: item.email_thread_id || null, gmail_message_id: item.email_message_id || null, in_reply_to: item.in_reply_to || null,
        recipient: item.sender_email, subject: item.email_subject || "", approved_body: approvedBody, idempotency_key: sendRequest.id });
      await supabaseAdmin.from("email_send_requests").update({ status: "accepted", updated_at: new Date().toISOString() }).eq("id", sendRequest.id).eq("organisation_id", organisationId);
      await supabaseAdmin.from("inbox_items").update({ email_delivery_status: "approved", response_updated_at: new Date().toISOString() }).eq("id", id).eq("organisation_id", organisationId);
      await supabaseAdmin.from("email_send_events").upsert({ organisation_id: organisationId, inbox_item_id: id, send_request_id: sendRequest.id, event_type: "accepted", actor_user_id: userId }, { onConflict: "send_request_id,event_type", ignoreDuplicates: true });
      return NextResponse.json({ success: true, status: "accepted", sendRequestId: sendRequest.id }, { status: 202 });
    } catch {
      await supabaseAdmin.from("email_send_requests").update({ status: "failed", engine_error: "Engine dispatch failed", updated_at: new Date().toISOString() }).eq("id", sendRequest.id).eq("organisation_id", organisationId);
      await supabaseAdmin.from("inbox_items").update({ email_delivery_status: "failed", response_updated_at: new Date().toISOString() }).eq("id", id).eq("organisation_id", organisationId);
      await supabaseAdmin.from("email_send_events").upsert({ organisation_id: organisationId, inbox_item_id: id, send_request_id: sendRequest.id, event_type: "failed", actor_user_id: userId, details: { retryable: true } }, { onConflict: "send_request_id,event_type", ignoreDuplicates: true });
      return NextResponse.json({ error: "The B2B engine could not accept the email. It remains unsent and can be retried." }, { status: 502 });
    }
  } catch (error) { return accessErrorResponse(error) || NextResponse.json({ error: "Unable to approve email sending." }, { status: 503 }); }
}
