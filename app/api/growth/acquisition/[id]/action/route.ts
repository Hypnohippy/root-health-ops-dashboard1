import { NextResponse } from "next/server";
import { requireOrganisation, accessErrorResponse } from "@/lib/tenantAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { uuid } from "@/lib/growthIngestion.server";
import { AcquisitionWorkflowError, planAcquisitionAction, routeUrl, acquisitionDestination } from "@/lib/acquisitionWorkflow";
import { personalSignalActions, planPersonalSignalAction, personalSocialActionAllowed } from "@/lib/personalSignal";
import { promoteAcquisition } from "@/lib/acquisitionPromotion.server";
import { personalDistributionKind } from "@/lib/personalDistribution";
import { routePersonalPublishing } from "@/lib/personalDistribution.server";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const itemId = (await params).id;
    const body = await req.json().catch(() => ({}));
    if (!uuid.test(itemId) || !uuid.test(body.organisationId || "") || !uuid.test(body.idempotencyKey || "")) {
      return NextResponse.json({ error: "Item, organisation and request key are required." }, { status: 400 });
    }
    const { organisationId, userId } = await requireOrganisation(body.organisationId, true);
    if (["prepare_outreach", "route_outreach"].includes(body.action)) {
      return NextResponse.json(await promoteAcquisition(organisationId, userId, itemId, body.idempotencyKey, body.action,
        typeof body.note === "string" ? body.note.trim().slice(0, 2000) : null));
    }
    const { data: item, error: readError } = await supabaseAdmin.from("acquisition_items")
      .select("id, organisation_id, record_type, status, metadata, source_engine, source_record_id, source_url, reason, signal, evidence, acquisition_item_events(action, created_at, idempotency_key)")
      .eq("id", itemId).eq("organisation_id", organisationId).maybeSingle();
    if (readError) throw readError;
    if (!item) return NextResponse.json({ error: "Acquisition item not found." }, { status: 404 });

    if (!personalSocialActionAllowed(item,body.action)) throw new AcquisitionWorkflowError("Content Signals cannot be used for personal response or engagement actions.");
    if (personalDistributionKind(item) === "SOCIAL_CONTENT" && ["create_content_draft", "route_publishing"].includes(body.action)) {
      if (process.env.PERSONAL_DISTRIBUTION_ENABLED !== "true") return NextResponse.json({ error: "Personal publishing handoff is not enabled yet. Your draft has been retained." }, { status: 503 });
      const plan = planAcquisitionAction(item.record_type, item.status, body.action);
      const publication = await routePersonalPublishing(supabaseAdmin, item, body.publication, userId);
      const priorHandoff = item.metadata?.handoff;
      const duplicate = priorHandoff?.action === body.action && item.acquisition_item_events?.some((event: { action: string; idempotency_key: string }) =>
        event.action === body.action && event.idempotency_key === priorHandoff.idempotency_key);
      if (!duplicate) {
        const { error } = await supabaseAdmin.rpc("apply_acquisition_action", {
          p_organisation_id: organisationId, p_item_id: itemId, p_actor_user_id: userId,
          p_expected_status: item.status, p_action: plan.action, p_new_status: plan.nextStatus, p_outcome: null,
          p_note: `Personal content draft linked to Publishing: ${publication.id}`, p_idempotency_key: body.idempotencyKey, p_marks_actioned: true,
        });
        if (error?.message?.includes("acquisition_item_changed")) throw new AcquisitionWorkflowError("This item changed. Refresh and try again.", 409);
        if (error) throw error;
      }
      return NextResponse.json({ success: true, duplicate: Boolean(duplicate), scheduledPostId: publication.id,
        destination: `/dashboard/approvals?${new URLSearchParams({ organisationId })}` });
    }
    const handoff = item.metadata?.handoff;
    if (personalDistributionKind(item) !== "SEARCH_ASSET" && handoff?.action === body.action && handoff.destination === acquisitionDestination(body.action) && handoff.idempotency_key) {
      const { data: receipt, error: receiptError } = await supabaseAdmin.from("acquisition_item_events").select("id")
        .eq("organisation_id", organisationId).eq("acquisition_item_id", itemId).eq("action", body.action).eq("idempotency_key", handoff.idempotency_key).maybeSingle();
      if (receiptError) throw receiptError;
      if (receipt) return NextResponse.json({ success: true, item, duplicate: true, destination: routeUrl(handoff.destination, organisationId, itemId) });
    }
    const personal = personalSignalActions.includes(body.action);
    if (personal) {
      const prior = item.acquisition_item_events?.find((event: {idempotency_key:string}) => event.idempotency_key === body.idempotencyKey);
      if (prior && prior.action !== body.action) throw new AcquisitionWorkflowError("Request key was already used for another action.",409);
      if (prior) return NextResponse.json({success:true,item,duplicate:true,destination:null});
    }
    const plan = personal ? planPersonalSignalAction(item, body.action, body.confirmed) : planAcquisitionAction(item.record_type, item.status, body.action, body.outcome);
    const note = typeof body.note === "string" ? body.note.trim().slice(0, 2000) : null;
    const { data, error } = await supabaseAdmin.rpc("apply_acquisition_action", {
      p_organisation_id: organisationId, p_item_id: itemId, p_actor_user_id: userId,
      p_expected_status: item.status, p_action: plan.action, p_new_status: plan.nextStatus,
      p_outcome: plan.outcome, p_note: note || null, p_idempotency_key: body.idempotencyKey,
      p_marks_actioned: personal ? body.action === "personal_responded" : ["prepare_outreach", "route_outreach", "create_content_draft", "route_campaign", "route_publishing", "route_responses", "mark_actioned"].includes(plan.action),
    });
    if (personal && error?.message?.includes("handoff_required")) return NextResponse.json({error:"Personal Signal confirmations are not enabled yet. No funnel change was saved."},{status:503});
    if (error?.message?.includes("acquisition_item_changed")) return NextResponse.json({ error: "This item changed. Refresh and try again." }, { status: 409 });
    if (error) throw error;
    if (personalDistributionKind(item) === "SEARCH_ASSET" && body.action === "create_content_draft") {
      const updated = data?.[0];
      const { data: savedBrief, error: briefError } = await supabaseAdmin.from("acquisition_items").update({ metadata: { ...updated.metadata,
        personal_distribution: { asset_type: "SEARCH_ASSET", campaign_id: `pa-${itemId}`, acquisition_id: itemId,
          source_engine: item.source_engine, source_record_id: item.source_record_id, manual_publication_required: true,
          brief: `Educational article brief: ${item.signal || item.reason || "Review the verified search demand"}. Explain the topic in general terms, offer practical ideas without diagnosis or guarantees, and include the Root Capacity Check as an optional next step. Requires editorial review and manual website publication.`,
          cta_url: `https://www.roothealth.app/capacity-check?${new URLSearchParams({ acquisition_id: itemId, utm_campaign: `pa-${itemId}`, utm_source: "root", utm_medium: "search" })}`,
        } } }).eq("organisation_id", organisationId).eq("id", itemId).eq("updated_at", updated.updated_at).select("id").maybeSingle();
      if (briefError) throw briefError;
      if (!savedBrief) throw new AcquisitionWorkflowError("This item changed. Refresh and retry the content brief.", 409);
    }
    return NextResponse.json({ success: true, item: data?.[0], destination: routeUrl(plan.destination, organisationId, itemId) });
  } catch (error) {
    const access = accessErrorResponse(error);
    if (access) return access;
    if (error instanceof AcquisitionWorkflowError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: "Unable to update acquisition item." }, { status: 503 });
  }
}
