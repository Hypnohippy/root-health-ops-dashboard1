// app/api/responses/list/route.ts
import { NextRequest, NextResponse } from "next/server";
import { readLifecycleInput } from "@/lib/lifecycleSnapshot.server";
import { responseLifecycleMap } from "@/lib/responseLifecycle";
import { requireOrganisation, accessErrorResponse } from "@/lib/tenantAuth";

export const runtime = "nodejs";

function okJson(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const organisationId = String(url.searchParams.get("organisationId") || "").trim();

    if (!organisationId) {
      return okJson({ success: false, error: "Missing organisationId" }, 400);
    }
    const verified = await requireOrganisation(organisationId, false);

    const limitRaw = Number(url.searchParams.get("limit") || 200);
    const limit = Math.max(1, Math.min(500, isNaN(limitRaw) ? 200 : limitRaw));

    const input = await readLifecycleInput(verified.organisationId);
    const lifecycles = responseLifecycleMap(verified.organisationId, input);
    const timestamp = (value: unknown) => typeof value === "string" ? Date.parse(value) || 0 : 0;
    const data = input.inbox_items.filter(row => row.organisation_id === verified.organisationId)
      .sort((a, b) => timestamp(b.created_at_platform || b.inserted_at) - timestamp(a.created_at_platform || a.inserted_at) || a.id.localeCompare(b.id)).slice(0, limit);

    const items = (data || []).map((r) => ({
      id: String(r.id),
      lifecycle: lifecycles.get(String(r.id)) || null,
      platform: (r.platform || "unknown"),
      status: (r.status || "unknown"),
      kind: (r.kind || "unknown"),
      authorName: r.author_name ?? null,
      authorHandle: r.author_handle ?? null,
      text: r.text || "",
      permalink: r.permalink ?? null,
      linkedinMessageUrl: r.linkedin_message_url ?? null,
      createdAt: (r.created_at_platform || r.inserted_at || new Date().toISOString()) as string,
      postText: r.post_text ?? null,
      postId: r.post_id ?? null,
      externalId: r.external_id ?? null,
      emailClassification: r.email_classification ?? null,
      responseState: r.response_state ?? null,
      emailThreadId: r.email_thread_id ?? null,
      inReplyTo: r.in_reply_to ?? null,
      outreachReference: r.outreach_reference ?? null,
      senderEmail: r.sender_email ?? null,
      subject: r.email_subject ?? null,
      followUpAt: r.follow_up_at ?? null,
      proposedResponse: r.proposed_response ?? null,
      emailReplyDraft: r.email_reply_draft ?? null,
      emailDeliveryStatus: r.email_delivery_status ?? null,
      emailSentMessageId: r.email_sent_message_id ?? null,
      emailSentThreadId: r.email_sent_thread_id ?? null,
      emailSentAt: r.email_sent_at ?? null,
    }));

    return okJson({
      success: true,
      configured: true,
      note:
        "Loaded from Supabase inbox_items. Use “Pull latest” to fetch new comments from connected platforms.",
      items,
    });
  } catch (e) {
    return accessErrorResponse(e) || okJson({ success: false, error: "Unable to load responses." }, 500);
  }
}
