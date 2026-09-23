import { withTenantRoute } from "@/lib/tenantRoute.server";
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

function norm(v: any) {
  return String(v ?? "").trim();
}

export const POST = withTenantRoute(async function POST(req: NextRequest, tenant) {
  try {

    const body = await req.json().catch(() => ({}));
    const ids = Array.isArray(body?.experimentIds) ? body.experimentIds.map((x: any) => norm(x)).filter(Boolean) : [];

    if (ids.length === 0) return NextResponse.json({ success: true, items: [] }, { status: 200 });

    const q = supabaseAdmin
      .from("growth_experiment_outcomes")
      .select("*").eq("organisation_id", tenant.organisationId)
      .in("experiment_id", ids)
      .order("created_at", { ascending: false })
      .limit(400);


    const { data, error } = await q;
    if (error) throw new Error(error.message);

    return NextResponse.json({ success: true, items: data || [], mode: "member_auth" }, { status: 200 });
  } catch (e: any) {
    const msg = e?.message || "Failed to list outcomes.";
    const status = msg === "Not authenticated" ? 401 : 500;
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}, { generation: false, write: true });
