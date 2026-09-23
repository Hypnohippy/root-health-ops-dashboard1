import { withTenantRoute } from "@/lib/tenantRoute.server";
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

function norm(v: any) {
  return String(v ?? "").trim();
}

export const POST = withTenantRoute(async function POST(req: NextRequest, tenant) {
  try {
    const ctx = { ...tenant, mode: "member_auth" };
    const body = await req.json().catch(() => ({}));

    const id = norm(body?.id);
    const status = norm(body?.status).toLowerCase();

    if (!id) return NextResponse.json({ success: false, error: "Missing id" }, { status: 400 });
    if (!["planned", "running", "completed"].includes(status)) {
      return NextResponse.json({ success: false, error: "Invalid status" }, { status: 400 });
    }

    const { data: exp, error: expErr } = await supabaseAdmin
      .from("growth_experiments")
      .select("id, organisation_id").eq("organisation_id", tenant.organisationId)
      .eq("id", id)
      .maybeSingle();

    if (expErr) throw new Error(expErr.message);
    if (!exp?.id) throw new Error("Experiment not found");

    const now = new Date().toISOString();
    const patch: any = { status, updated_at: now };

    if (status === "running") patch.started_at = now;
    if (status === "completed") patch.completed_at = now;

    const upd = await supabaseAdmin
      .from("growth_experiments")
      .update(patch)
      .eq("id", id).eq("organisation_id", tenant.organisationId)
      .select()
      .maybeSingle();

    if (upd.error) throw new Error(upd.error.message);

    return NextResponse.json({ success: true, item: upd.data, mode: ctx.mode }, { status: 200 });
  } catch (e: any) {
    const msg = e?.message || "Status update failed.";
    const status = msg === "Not authenticated" ? 401 : msg.includes("Not allowed") ? 403 : 500;
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}, { generation: false, write: true });
