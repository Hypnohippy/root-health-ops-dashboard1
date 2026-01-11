// app/api/responses/list/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const organisationId = url.searchParams.get("organisationId") || "";
    const status = (url.searchParams.get("status") || "").trim(); // optional
    const limitRaw = url.searchParams.get("limit") || "100";
    const limit = Math.min(Math.max(parseInt(limitRaw, 10) || 100, 1), 500);

    if (!organisationId) {
      return NextResponse.json(
        { error: "Missing organisationId" },
        { status: 400 }
      );
    }

    let q = supabaseAdmin
      .from("inbox_items")
      .select(
        "id, organisation_id, platform, kind, status, text, author_name, author_id, created_at, permalink, social_comment_id, parent_social_comment_id, ayrshare_post_id, social_post_id"
      )
      .eq("organisation_id", organisationId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (status) q = q.eq("status", status);

    const { data, error } = await q;

    if (error) {
      console.error("[responses/list] supabase error", error);
      return NextResponse.json(
        { error: "Failed to load inbox items", details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { success: true, items: data || [] },
      { status: 200 }
    );
  } catch (err) {
    console.error("[responses/list] unexpected error", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
