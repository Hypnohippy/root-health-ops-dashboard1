import { withTenantRoute } from "@/lib/tenantRoute.server";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

export const GET = withTenantRoute(async function GET(req: Request, tenant) {
  const { data, error } = await supabaseAdmin
    .from("growth_targets")
    .select("*").eq("organisation_id", tenant.organisationId)
    .order("replied_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    data: data || [],
  });
}, { generation: false, write: false });
