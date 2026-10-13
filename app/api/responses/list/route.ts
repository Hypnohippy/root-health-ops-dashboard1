import { lifecycleLinkedInIdentity } from "@/lib/contactLifecycle";
import { searchQuery, matchesSearch } from "@/lib/opsSearch";
import { readTenantHistory } from "@/lib/opsSearch.server";
// app/api/responses/list/route.ts
import { NextRequest, NextResponse } from "next/server";
import { readLifecycleInput } from "@/lib/lifecycleSnapshot.server";
import { responseLifecycleMap, responseAttention } from "@/lib/responseLifecycle";
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
    const itemId = url.searchParams.get("itemId"), search=searchQuery(url.searchParams.get("q"));
    const page=Number(url.searchParams.get("page")||0);if(!Number.isInteger(page)||page<0)return okJson({error:"Invalid page."},400);
    const conversations=search?await readTenantHistory("email_conversation_messages",verified.organisationId):[];
    const linkedConversations=search?await readTenantHistory("linkedin_conversation_messages",verified.organisationId):[];

    const limitRaw = Number(url.searchParams.get("limit") || 200);
    const limit = Math.max(1, Math.min(500, isNaN(limitRaw) ? 200 : limitRaw));

    const input = await readLifecycleInput(verified.organisationId);
    const lifecycles = responseLifecycleMap(verified.organisationId, input);
    const statusOf=(id:string)=>{const state=lifecycles.get(id);if(!state)return "unknown";if(state.humanActionRequired&&state.currentStage!=="outreach_ready")return "needs_reply";if(["converted","lost","dismissed","no_reply_needed"].includes(state.currentStage))return "archived";if(state.currentStage==="outreach_ready")return "unread";return state.humanActionRequired?"needs_reply":"replied";};
    const requestedPlatform=url.searchParams.get("platform")||"all",requestedStatus=url.searchParams.get("status")||"all";
    const timestamp = (value: unknown) => typeof value === "string" ? Date.parse(value) || 0 : 0;
    const matched = input.inbox_items.filter(row => row.organisation_id === verified.organisationId && (!itemId || row.id === itemId) && (!search || requestedPlatform==="all" || row.platform===requestedPlatform) && (!search || requestedStatus==="all" || requestedStatus==="active"&&statusOf(row.id)!=="archived" || statusOf(row.id)===requestedStatus) && matchesSearch(row,search,[...conversations.filter(m=>m.gmail_thread_id===row.email_thread_id || m.gmail_thread_id===row.email_sent_thread_id).map(m=>String(m.body||"")),...linkedConversations.filter(m=>m.linkedin_identity && lifecycleLinkedInIdentity(m.linkedin_identity)===(lifecycleLinkedInIdentity(row.linkedin_identity)||lifecycleLinkedInIdentity(row.permalink))).map(m=>String(m.message||""))].join(" ")));
    const data=matched
      .sort((a, b) => Number(lifecycles.get(b.id)?.currentStage === "needs_reply") - Number(lifecycles.get(a.id)?.currentStage === "needs_reply") || timestamp(lifecycles.get(b.id)?.lastAction?.at || b.response_updated_at || b.created_at_platform || b.inserted_at) - timestamp(lifecycles.get(a.id)?.lastAction?.at || a.response_updated_at || a.created_at_platform || a.inserted_at) || a.id.localeCompare(b.id)).slice(page*limit, page*limit+limit);

    const items = (data || []).map((r) => ({
      id: String(r.id),
      linkedinNotificationId: lifecycles.get(r.id)?.linkedinNotificationId || null,
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
      total: matched.length, page,
      attention: responseAttention(verified.organisationId, input, lifecycles),
      note:
        "Loaded from Supabase inbox_items. Use “Pull latest” to fetch new comments from connected platforms.",
      items,
    });
  } catch (e) {
    return accessErrorResponse(e) || okJson({ success: false, error: "Unable to load responses." }, 500);
  }
}
