// app/api/social/scheduled/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

// We’ll default to your Root Health org if none provided
const DEFAULT_ORG_ID = "23a054db-7040-40b1-b193-2f43cfa139de";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const searchParams = url.searchParams;

    const organisationId =
      searchParams.get("organisationId") || DEFAULT_ORG_ID;

    if (!organisationId) {
      return NextResponse.json(
        {
          success: false,
          error: "organisationId is required",
        },
        { status: 200 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("scheduled_posts")
      .select(
        "id, organisation_id, message, platforms, image_url, scheduled_for, status, error_info, posted_at, created_at"
      )
      .eq("organisation_id", organisationId)
      .order("scheduled_for", { ascending: true });

    if (error) {
      console.error("[/api/social/scheduled] DB error", error);
      return NextResponse.json(
        {
          success: false,
          error: "Database error loading scheduled posts.",
        },
        { status: 200 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        items: data ?? [],
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("[/api/social/scheduled] unexpected error", err);
    return NextResponse.json(
      {
        success: false,
        error: "Internal server error in /api/social/scheduled",
      },
      { status: 200 }
    );
  }
}
