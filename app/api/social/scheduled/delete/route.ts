// app/api/social/scheduled/delete/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../../lib/supabaseAdmin";

export const runtime = "nodejs";

/**
 * POST /api/social/scheduled/delete
 * Body: { id: string, organisationId?: string }
 *
 * Fix:
 * - Do NOT rely on "latest org" inside delete routes.
 * - If organisationId is provided, we enforce it.
 * - If not provided, we delete by id only (admin route).
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({} as any));
    const id = String(body?.id || "").trim();
    const organisationId = String(body?.organisationId || "").trim();

    if (!id) {
      return NextResponse.json({ success: false, error: "Missing id." }, { status: 200 });
    }

    let q = supabaseAdmin.from("scheduled_posts").delete().eq("id", id);

    // If caller provided orgId, enforce it (prevents cross-org deletes)
    if (organisationId) {
      q = q.eq("organisation_id", organisationId);
    }

    const { data, error } = await q.select("id").maybeSingle();

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 200 });
    }

    if (!data?.id) {
      return NextResponse.json(
        { success: false, error: "Post not found (id/org mismatch)." },
        { status: 200 }
      );
    }

    return NextResponse.json({ success: true, deletedId: data.id }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message || "Delete failed." },
      { status: 200 }
    );
  }
}
