// app/api/social/scheduled/delete/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../../lib/supabaseAdmin";

export const runtime = "nodejs";

/**
 * POST /api/social/scheduled/delete
 * Body: { id }
 *
 * Single-tenant safe:
 * - Deletes only if the row belongs to the first org
 * - Blocks deleting posted rows
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({} as any));
    const id = String(body?.id || "").trim();

    if (!id) return NextResponse.json({ success: false, error: "Missing id" }, { status: 200 });

    const { data: orgs, error: orgErr } = await supabaseAdmin.from("organisations").select("id").limit(1);
    if (orgErr || !orgs || orgs.length === 0) {
      return NextResponse.json({ success: false, error: "No organisation found." }, { status: 200 });
    }
    const organisationId = String(orgs[0].id);

    const { data: row, error: readErr } = await supabaseAdmin
      .from("scheduled_posts")
      .select("id, status")
      .eq("id", id)
      .eq("organisation_id", organisationId)
      .maybeSingle();

    if (readErr || !row) {
      return NextResponse.json({ success: false, error: "Post not found." }, { status: 200 });
    }

    const status = String((row as any).status || "").toLowerCase();
    if (status === "posted") {
      return NextResponse.json({ success: false, error: "This post is already posted and can’t be deleted." }, { status: 200 });
    }

    const { error: delErr } = await supabaseAdmin
      .from("scheduled_posts")
      .delete()
      .eq("id", id)
      .eq("organisation_id", organisationId);

    if (delErr) {
      return NextResponse.json({ success: false, error: delErr.message }, { status: 200 });
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || "Delete failed" }, { status: 200 });
  }
}
