import { requireOrganisation, accessErrorResponse } from "@/lib/tenantAuth";
// app/api/social/scheduled/list/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../../lib/supabaseAdmin";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    const { organisationId } = await requireOrganisation(searchParams.get("organisationId") || "", false);
    const limitRaw = searchParams.get("limit") || "200";

    const limit = Math.max(1, Math.min(500, Number(limitRaw) || 200));

    if (!organisationId) {
      return NextResponse.json(
        { success: false, error: "Missing organisationId." },
        { status: 200 }
      );
    }

    // Pull newest-first. Include series fields + meta if present.
    const { data, error } = await supabaseAdmin
      .from("scheduled_posts")
      .select(
        "id, organisation_id, message, platforms, image_url, scheduled_for, status, created_at, sequence_id, series_part, series_total, meta"
      )
      .eq("organisation_id", organisationId)
      .order("scheduled_for", { ascending: false })
      .limit(limit);

    if (error) {
      console.error("[scheduled/list] db error", error);
      return NextResponse.json(
        {
          success: false,
          error: `DB error: ${(error as any)?.message || JSON.stringify(error)}`,
        },
        { status: 200 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        records: data || [],
      },
      { status: 200 }
    );
  } catch (err) {
    const denied = accessErrorResponse(err);
    if (denied) return denied;
    console.error("[scheduled/list] unexpected", err);
    return NextResponse.json(
      { success: false, error: "Internal error in scheduled list." },
      { status: 200 }
    );
  }
}
