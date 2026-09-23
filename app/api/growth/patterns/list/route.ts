import { withTenantRoute } from "@/lib/tenantRoute.server";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

export const GET = withTenantRoute(async function GET(req: Request, tenant) {
  try {
    const organisationId = tenant.organisationId;

    const { data, error } = await supabaseAdmin
      .from("growth_patterns")
      .select("*").eq("organisation_id", tenant.organisationId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 200 });
    }

    return NextResponse.json({ success: true, organisationId, items: data || [] }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || "List failed" }, { status: 200 });
  }
}, { generation: false, write: false });
