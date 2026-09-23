import { withTenantRoute } from "@/lib/tenantRoute.server";
import { requireOwnedRecord, accessErrorResponse } from "@/lib/tenantAuth";
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

function norm(v: any) {
  return String(v ?? "").trim();
}

export const POST = withTenantRoute(async function POST(req: NextRequest, tenant) {
  try {
    const body = await req.json().catch(() => ({}));
    const suggestion = body?.suggestion;

    const organisationId = tenant.organisationId;

    const platform = norm(suggestion?.platform) || null;
    const pattern_type = norm(suggestion?.pattern_type);
    const format = norm(suggestion?.format);
    const hook_style = norm(suggestion?.hook_style) || null;
    const cta_style = norm(suggestion?.cta_style) || null;
    const notes = norm(suggestion?.notes) || null;
    const performance_score =
      suggestion?.performance_score != null ? Number(suggestion.performance_score) : null;
    const source_post_id = norm(suggestion?.source_post_id) || null;
    await requireOwnedRecord("scheduled_posts", source_post_id, tenant.organisationId);

    if (!pattern_type || !format) {
      return NextResponse.json(
        { success: false, error: "Missing pattern_type or format." },
        { status: 200 }
      );
    }

    const now = new Date().toISOString();

    const { error } = await supabaseAdmin.from("growth_patterns").insert({
      organisation_id: organisationId,
      source_post_id,
      platform,
      pattern_type,
      format,
      hook_style,
      cta_style,
      notes,
      performance_score,
      suggested: true,
      saved_by_user: true,
      created_at: now,
      updated_at: now,
    } as any);

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 200 });
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (e: any) {
    const denied = accessErrorResponse(e);
    if (denied) return denied;
    return NextResponse.json({ success: false, error: e?.message || "Save failed" }, { status: 200 });
  }
}, { generation: false, write: true });
