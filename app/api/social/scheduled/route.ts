// app/api/social/scheduled/update/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../../lib/supabaseAdmin";

export const runtime = "nodejs";

/**
 * POST /api/social/scheduled/update
 * Body: { id, message, scheduled_for, platforms, image_url }
 *
 * Single-tenant safe:
 * - Finds the first organisation and only updates rows for that org
 * - Blocks editing posted rows (can be relaxed later)
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({} as any));

    const id = String(body?.id || "").trim();
    const message = String(body?.message || "").trim();
    const scheduled_for = String(body?.scheduled_for || "").trim();
    const platformsRaw = Array.isArray(body?.platforms) ? body.platforms : [];
    const platforms = platformsRaw.map((p: any) => String(p || "").toLowerCase().trim()).filter(Boolean);
    const image_url = body?.image_url === null ? null : String(body?.image_url || "").trim() || null;

    if (!id) return NextResponse.json({ success: false, error: "Missing id" }, { status: 200 });
    if (!message) return NextResponse.json({ success: false, error: "Message is required" }, { status: 200 });
    if (!scheduled_for) return NextResponse.json({ success: false, error: "scheduled_for is required" }, { status: 200 });
    if (platforms.length === 0) return NextResponse.json({ success: false, error: "Pick at least one platform" }, { status: 200 });

    // Single-tenant: get org
    const { data: orgs, error: orgErr } = await supabaseAdmin.from("organisations").select("id").limit(1);
    if (orgErr || !orgs || orgs.length === 0) {
      return NextResponse.json({ success: false, error: "No organisation found." }, { status: 200 });
    }
    const organisationId = String(orgs[0].id);

    // Load row (guard)
    const { data: row, error: readErr } = await supabaseAdmin
      .from("scheduled_posts")
      .select("id, organisation_id, status")
      .eq("id", id)
      .eq("organisation_id", organisationId)
      .maybeSingle();

    if (readErr || !row) {
      return NextResponse.json({ success: false, error: "Post not found." }, { status: 200 });
    }

    const status = String((row as any).status || "").toLowerCase();
    if (status === "posted") {
      return NextResponse.json({ success: false, error: "This post is already posted and can’t be edited." }, { status: 200 });
    }

    const nowIso = new Date().toISOString();

    const { error: upErr } = await supabaseAdmin
      .from("scheduled_posts")
      .update({
        message,
        platforms,
        image_url,
        scheduled_for,
        updated_at: nowIso,
      })
      .eq("id", id)
      .eq("organisation_id", organisationId);

    if (upErr) {
      return NextResponse.json({ success: false, error: upErr.message }, { status: 200 });
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || "Update failed" }, { status: 200 });
  }
}
