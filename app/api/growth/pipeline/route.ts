import { withTenantRoute } from "@/lib/tenantRoute.server";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { readLifecycleInput } from "@/lib/lifecycleSnapshot.server";
import { buildContactLifecycle } from "@/lib/contactLifecycle";

export const runtime = "nodejs";

export const GET = withTenantRoute(async function GET(req: Request, tenant) {
  let query = supabaseAdmin
    .from("growth_targets")
    .select("*").eq("organisation_id", tenant.organisationId);
  const targetId = new URL(req.url).searchParams.get("targetId");
  if (targetId) query = query.eq("id", targetId);
  const { data, error } = await query
    .order("replied_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }

  if (targetId && data?.length) {
    try {
      const input = await readLifecycleInput(tenant.organisationId);
      const lifecycle = buildContactLifecycle(tenant.organisationId, input).find(c => c.records.some(r => r.table === "growth_targets" && r.id === targetId));
      const acquisition = input.acquisition_items.filter(a => a.organisation_id === tenant.organisationId &&
        (a.id === data[0].acquisition_item_id || (a.metadata as { handoff?: { target_id?: string } })?.handoff?.target_id === targetId));
      const responses = input.inbox_items.filter(r => r.organisation_id === tenant.organisationId && lifecycle?.records.some(ref => ref.table === "inbox_items" && ref.id === r.id))
        .map(r => ({ id: r.id, text: r.text, email_classification: r.email_classification, email_delivery_status: r.email_delivery_status, created_at: r.created_at_platform || r.inserted_at }));
      return NextResponse.json({ success: true, data: data.map(t => ({ ...t, lifecycle, acquisition, responses })) });
    } catch {
      return NextResponse.json({ success: false, error: "Current contact evidence could not be loaded. Refresh before acting." }, { status: 503 });
    }
  }
  return NextResponse.json({
    success: true,
    data: data || [],
  });
}, { generation: false, write: false });
