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
    const id = norm(body?.id);
    if (!id) return NextResponse.json({ success: false, error: "Missing id." }, { status: 400 });

    // Safe archive delete
    const now = new Date().toISOString();
    const upd = await supabaseAdmin
      .from("growth_experiments")
      .update({ deleted_at: now, updated_at: now })
      .eq("id", id).eq("organisation_id", tenant.organisationId)
      .select()
      .maybeSingle();

    if (upd.error) throw new Error(upd.error.message);

    return NextResponse.json({ success: true, item: upd.data });
  } catch (e: any) {
    const msg = e?.message || "Delete failed.";
    const status = msg.includes("Not a member") ? 403 : msg === "Not authenticated" ? 401 : 500;
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}, { generation: false, write: true });
