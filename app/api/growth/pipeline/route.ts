import { withTenantRoute } from "@/lib/tenantRoute.server";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

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

  return NextResponse.json({
    success: true,
    data: data || [],
  });
}, { generation: false, write: false });
