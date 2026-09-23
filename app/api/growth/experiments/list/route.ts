import { withTenantRoute } from "@/lib/tenantRoute.server";
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

export const GET = withTenantRoute(async function GET(req: NextRequest, tenant) {
  try {
    const ctx = { ...tenant, mode: "member_auth" };

    const { data, error } = await supabaseAdmin
      .from("growth_experiments")
      .select("*").eq("organisation_id", tenant.organisationId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(120);

    if (error) throw new Error(error.message);

    return NextResponse.json({ success: true, organisationId: ctx.organisationId, items: data || [], mode: ctx.mode }, { status: 200 });
  } catch (e: any) {
    const msg = e?.message || "Failed to list experiments.";
    const status = msg === "Not authenticated" ? 401 : 500;
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}, { generation: false, write: false });
