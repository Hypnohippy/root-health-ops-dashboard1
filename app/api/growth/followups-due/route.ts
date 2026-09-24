import { withTenantRoute } from "@/lib/tenantRoute.server";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { contextualOutreachDraft, isGrowthTargetDue } from "@/lib/growthOutreach";

export const runtime = "nodejs";

export const GET = withTenantRoute(async function GET(req: Request, tenant) {
  const { data, error } = await supabaseAdmin
    .from("growth_targets")
    .select("*").eq("organisation_id", tenant.organisationId)
    .eq("status", "active")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  const due = (data || []).filter(isGrowthTargetDue).map((target) => ({
    ...target,
    suggested_message: contextualOutreachDraft(target, tenant.profile!),
  }));

  return NextResponse.json({ success: true, data: due });
}, { generation: true, write: false });
