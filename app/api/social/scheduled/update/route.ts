import { requireOrganisation, accessErrorResponse } from "@/lib/tenantAuth";
// app/api/social/scheduled/update/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../../lib/supabaseAdmin";

export const runtime = "nodejs";

/**
 * POST /api/social/scheduled/update
 * Body:
 * {
 *   id: string,
 *   organisationId?: string,
 *   message?: string,
 *   scheduled_for?: string,
 *   platforms?: string[],
 *   image_url?: string | null,
 *   force_requeue?: boolean
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({} as any));

    const id = String(body?.id || "").trim();
    const { organisationId } = await requireOrganisation(String(body?.organisationId || "").trim(), true);

    if (!id) {
      return NextResponse.json({ success: false, error: "Missing id." }, { status: 200 });
    }

    const patch: any = {};
    if (typeof body?.message === "string") patch.message = body.message;
    if (typeof body?.scheduled_for === "string") patch.scheduled_for = body.scheduled_for;
    if (Array.isArray(body?.platforms)) patch.platforms = body.platforms;
    if (body?.image_url === null || typeof body?.image_url === "string") patch.image_url = body.image_url;
    patch.updated_at = new Date().toISOString();

    // Optional: force requeue clears posted fields (so it will run again)
    if (body?.force_requeue) {
      patch.posted_at = null;
      patch.status = "scheduled";
      patch.error_info = null;
    }

    let q = supabaseAdmin.from("scheduled_posts").update(patch).eq("id", id);

    q = q.eq("organisation_id", organisationId);

    const { data, error } = await q.select("*").maybeSingle();

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 200 });
    }

    if (!data?.id) {
      return NextResponse.json(
        { success: false, error: "Post not found (id/org mismatch)." },
        { status: 200 }
      );
    }

    return NextResponse.json({ success: true, item: data }, { status: 200 });
  } catch (e: any) {
    const denied = accessErrorResponse(e);
    if (denied) return denied;
    return NextResponse.json(
      { success: false, error: e?.message || "Update failed." },
      { status: 200 }
    );
  }
}
