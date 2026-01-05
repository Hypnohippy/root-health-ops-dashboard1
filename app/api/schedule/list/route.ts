// app/api/schedule/list/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const organisationId = url.searchParams.get("organisationId") || "";

    if (!organisationId) {
      return NextResponse.json(
        { error: "Missing organisationId" },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("scheduled_posts")
      .select(
        "id, organisation_id, message, platforms, image_url, scheduled_for, status, created_at, meta"
      )
      .eq("organisation_id", organisationId)
      .order("scheduled_for", { ascending: false })
      .limit(500);

    if (error) {
      console.error("[schedule/list] supabase error", error);
      return NextResponse.json(
        { error: "Failed to load scheduled posts", details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ items: data || [] }, { status: 200 });
  } catch (err) {
    console.error("[schedule/list] unexpected error", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
