// app/api/social/scheduled/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const organisationId = searchParams.get("organisationId");

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
      console.error("[scheduled list] DB error", error);
      return NextResponse.json(
        {
          success: false,
          error: "Database error loading scheduled posts",
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
    console.error("[scheduled list] unexpected error", err);
    return NextResponse.json(
      {
        success: false,
        error: "Internal server error in /api/social/scheduled",
      },
      { status: 200 }
    );
  }
}
