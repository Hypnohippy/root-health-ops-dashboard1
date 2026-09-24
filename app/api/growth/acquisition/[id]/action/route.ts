import { NextResponse } from "next/server";
import { requireOrganisation, accessErrorResponse } from "@/lib/tenantAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { uuid } from "@/lib/growthIngestion.server";
import { AcquisitionWorkflowError, planAcquisitionAction, routeUrl } from "@/lib/acquisitionWorkflow";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const itemId = (await params).id;
    const body = await req.json().catch(() => ({}));
    if (!uuid.test(itemId) || !uuid.test(body.organisationId || "") || !uuid.test(body.idempotencyKey || "")) {
      return NextResponse.json({ error: "Item, organisation and request key are required." }, { status: 400 });
    }
    const { organisationId, userId } = await requireOrganisation(body.organisationId, true);
    const { data: item, error: readError } = await supabaseAdmin.from("acquisition_items")
      .select("id, organisation_id, record_type, status")
      .eq("id", itemId).eq("organisation_id", organisationId).maybeSingle();
    if (readError) throw readError;
    if (!item) return NextResponse.json({ error: "Acquisition item not found." }, { status: 404 });

    const plan = planAcquisitionAction(item.record_type, item.status, body.action, body.outcome);
    const note = typeof body.note === "string" ? body.note.trim().slice(0, 2000) : null;
    const { data, error } = await supabaseAdmin.rpc("apply_acquisition_action", {
      p_organisation_id: organisationId, p_item_id: itemId, p_actor_user_id: userId,
      p_expected_status: item.status, p_action: plan.action, p_new_status: plan.nextStatus,
      p_outcome: plan.outcome, p_note: note || null, p_idempotency_key: body.idempotencyKey,
      p_marks_actioned: ["prepare_outreach", "route_outreach", "create_content_draft", "route_campaign", "route_publishing", "route_responses", "mark_actioned"].includes(plan.action),
    });
    if (error?.message?.includes("acquisition_item_changed")) return NextResponse.json({ error: "This item changed. Refresh and try again." }, { status: 409 });
    if (error) throw error;
    return NextResponse.json({ success: true, item: data?.[0], destination: routeUrl(plan.destination, organisationId, itemId) });
  } catch (error) {
    const access = accessErrorResponse(error);
    if (access) return access;
    if (error instanceof AcquisitionWorkflowError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: "Unable to update acquisition item." }, { status: 503 });
  }
}
