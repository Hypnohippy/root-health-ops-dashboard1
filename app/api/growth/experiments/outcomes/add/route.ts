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

    const experimentId = norm(body?.experimentId);
    const metric_name = norm(body?.metric_name);
    const metric_value = body?.metric_value ?? null;
    const meta = body?.meta ?? {};

    if (!experimentId) return NextResponse.json({ success: false, error: "Missing experimentId" }, { status: 400 });
    if (!metric_name) return NextResponse.json({ success: false, error: "Missing metric_name" }, { status: 400 });

    // Always load experiment to get its organisation_id (fixes your NULL org id issue)
    const { data: exp, error: expErr } = await supabaseAdmin
      .from("growth_experiments")
      .select("id, organisation_id").eq("organisation_id", tenant.organisationId)
      .eq("id", experimentId)
      .maybeSingle();

    if (expErr) throw new Error(expErr.message);
    if (!exp?.id) throw new Error("Experiment not found");

    const now = new Date().toISOString();

    const row: any = {
      organisation_id: exp.organisation_id, // ✅ fixed (no more null)
      experiment_id: experimentId,
      metric_name,
      metric_value,
      meta,
      created_at: now,
    };

    const ins = await supabaseAdmin
      .from("growth_experiment_outcomes")
      .insert(row)
      .select().eq("organisation_id", tenant.organisationId)
      .maybeSingle();

    if (ins.error) throw new Error(ins.error.message);

    return NextResponse.json({ success: true, item: ins.data, mode: "member_auth" }, { status: 200 });
  } catch (e: any) {
    const msg = e?.message || "Failed to add outcome.";
    const status = msg === "Not authenticated" ? 401 : msg.includes("Not allowed") ? 403 : 500;
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}, { generation: false, write: true });
