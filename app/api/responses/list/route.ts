import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const organisationId = url.searchParams.get("organisationId") || "";
    const limitRaw = url.searchParams.get("limit") || "200";
    const limit = Math.min(Math.max(parseInt(limitRaw, 10) || 200, 1), 500);

    if (!organisationId) {
      return NextResponse.json(
        { success: false, error: "Missing organisationId" },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("inbox_items")
      .select(
        "id, platform, status, text, author_name, author_id, created_at, permalink, reply_draft, reply_final, replied_at, replied_by"
      )
      .eq("organisation_id", organisationId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      console.error("[responses/list] supabase error", error);
      return NextResponse.json(
        { success: false, error: "Failed to load inbox items", details: error.message },
        { status: 500 }
      );
    }

    const items = (data || []).map((r: any) => ({
      id: String(r.id),
      platform: (String(r.platform || "unknown").toLowerCase() as any) || "unknown",
      status: (String(r.status || "unknown") as any) || "unknown",
      kind: "comment",
      text: String(r.text || ""),
      authorName: r.author_name ?? null,
      authorHandle: null,
      createdAt: String(r.created_at),
      permalink: r.permalink ?? null,
      postText: null,
      postId: null,

      // enterprise fields (used by UI)
      replyDraft: r.reply_draft ?? "",
      replyFinal: r.reply_final ?? "",
      repliedAt: r.replied_at ?? null,
      repliedBy: r.replied_by ?? null,
    }));

    return NextResponse.json({ success: true, configured: true, items }, { status: 200 });
  } catch (err) {
    console.error("[responses/list] unexpected error", err);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
