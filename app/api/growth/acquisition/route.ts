import { NextResponse } from "next/server";
import { requireOrganisation, accessErrorResponse } from "@/lib/tenantAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { recordTypes, statuses, uuid } from "@/lib/growthIngestion.server";
export async function GET(req: Request) {
  try {
    const params = new URL(req.url).searchParams;
    const requested = params.get("organisationId") || "";
    if (!uuid.test(requested)) return NextResponse.json({ error: "Select an organisation explicitly." }, { status: 400 });
    const { organisationId } = await requireOrganisation(requested, false);
    const page = Number(params.get("page") || 0);
    const status = params.get("status");
    const recordType = params.get("record_type");
    if (recordType !== null && !recordTypes.includes(recordType as typeof recordTypes[number])) return NextResponse.json({ error: "Invalid record_type." }, { status: 400 });
    const itemId = params.get("itemId");
    if (itemId && !uuid.test(itemId)) return NextResponse.json({ error: "Invalid item." }, { status: 400 });
    if (!Number.isInteger(page) || page < 0 || page > 10000 || (status && !statuses.includes(status as typeof statuses[number]))) return NextResponse.json({ error: "Invalid filter." }, { status: 400 });
    let query = supabaseAdmin.from("acquisition_items").select("*, acquisition_item_events(id, action, previous_status, new_status, outcome, note, created_at, actor_user_id, idempotency_key)", { count: "exact" }).eq("organisation_id", organisationId);
    if (status) query = query.eq("status", status);
    if (recordType === "personal_opportunity") query = query.or("record_type.eq.personal_opportunity,and(record_type.eq.social_opportunity,source_engine.eq.root_health_personal)");
    else if (recordType) query = query.eq("record_type", recordType);
    if (itemId) query = query.eq("id", itemId);
    const { data, count, error } = await query.order("created_at", { ascending: false }).order("id").range(page * 25, page * 25 + 24);
    if (error) throw error;
    const candidates = (data || []).filter(item => {
      const handoff = item.metadata?.handoff;
      return ["b2b_lead", "partner_opportunity"].includes(item.record_type) && ["prepare_outreach", "route_outreach"].includes(handoff?.action) &&
        handoff.destination === "/dashboard/growth/pipeline" && uuid.test(handoff?.target_id || "") && item.acquisition_item_events?.some((event: { idempotency_key: string; action: string }) =>
        event.idempotency_key === handoff.idempotency_key && event.action === handoff.action);
    });
    const linked = new Set<string>();
    if (candidates.length) {
      const { data: targets, error: targetError } = await supabaseAdmin.from("growth_targets").select("id")
        .eq("organisation_id", organisationId).in("id", candidates.map(item => item.metadata.handoff.target_id));
      if (targetError) throw targetError;
      for (const target of targets || []) linked.add(target.id);
    }
    return NextResponse.json({ items: (data || []).map(item => ({ ...item,
      outreachTargetId: candidates.includes(item) && linked.has(item.metadata.handoff.target_id) ? item.metadata.handoff.target_id : null,
    })), total: count, page });
  } catch (error) { return accessErrorResponse(error) || NextResponse.json({ error: "Unable to load acquisition queue." }, { status: 503 }); }
}
