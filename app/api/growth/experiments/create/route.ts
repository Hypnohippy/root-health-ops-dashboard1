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
    const ctx = { ...tenant, mode: "member_auth" };

    const title = norm(body?.title);
    const platform = norm(body?.platform);
    const pattern_type = norm(body?.pattern_type);
    const format = norm(body?.format);

    if (!title || !platform || !pattern_type || !format) {
      return NextResponse.json(
        { success: false, error: "Missing required fields (title/platform/pattern/format)." },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();

    const row: any = {
      organisation_id: ctx.organisationId,
      title,
      platform,
      goal: norm(body?.goal) || "Improve engagement",
      format,
      pattern_type,
      hook_style: norm(body?.hook_style) || null,
      cta_style: norm(body?.cta_style) || null,
      notes: norm(body?.notes) || null,
      hypothesis: norm(body?.hypothesis) || null,
      status: "planned",
      confidence: Number.isFinite(Number(body?.confidence)) ? Number(body.confidence) : 60,
      created_at: now,
      updated_at: now,
      started_at: null,
      completed_at: null,
      deleted_at: null,
    };

    const ins = await supabaseAdmin.from("growth_experiments").insert(row).select().eq("organisation_id", tenant.organisationId).maybeSingle();
    if (ins.error) throw new Error(ins.error.message);

    return NextResponse.json({ success: true, organisationId: ctx.organisationId, item: ins.data, mode: ctx.mode }, { status: 200 });
  } catch (e: any) {
    const msg = e?.message || "Failed to create experiment.";
    const status = msg === "Not authenticated" ? 401 : msg.includes("Not a member") ? 403 : 500;
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}, { generation: false, write: true });
