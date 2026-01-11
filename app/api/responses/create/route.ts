// app/api/responses/create/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

function cleanStr(v: any): string {
  return typeof v === "string" ? v.trim() : "";
}

function cleanPlatform(v: any): string {
  const s = cleanStr(v).toLowerCase();
  const allowed = new Set([
    "facebook",
    "instagram",
    "linkedin",
    "threads",
    "tiktok",
    "reddit",
    "unknown",
  ]);
  return allowed.has(s) ? s : "unknown";
}

function cleanStatus(v: any): string {
  const s = cleanStr(v).toLowerCase();
  const allowed = new Set(["unread", "needs_reply", "replied", "archived"]);
  return allowed.has(s) ? s : "unread";
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));

    const organisationId = cleanStr(body?.organisationId);
    const platform = cleanPlatform(body?.platform);
    const status = cleanStatus(body?.status);

    const text = cleanStr(body?.text);
    const authorName = cleanStr(body?.authorName) || null;
    const permalink = cleanStr(body?.permalink) || null;

    if (!organisationId) {
      return NextResponse.json(
        { success: false, error: "Missing organisationId" },
        { status: 400 }
      );
    }

    if (!text) {
      return NextResponse.json(
        { success: false, error: "Text is required" },
        { status: 400 }
      );
    }

    const createdAt =
      cleanStr(body?.createdAt) || new Date().toISOString();

    const { data, error } = await supabaseAdmin
      .from("inbox_items")
      .insert({
        organisation_id: organisationId,
        platform,
        kind: "comment",
        status,
        text,
        author_name: authorName,
        author_id: null,
        created_at: createdAt,
        permalink,
        ayrshare_post_id: null,
        social_post_id: null,
        social_comment_id: null,
        parent_social_comment_id: null,
        raw: body?.raw ?? null,
      })
      .select("id")
      .single();

    if (error) {
      console.error("[responses/create] supabase error", error);
      return NextResponse.json(
        { success: false, error: "Failed to create inbox item", details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { success: true, id: data?.id },
      { status: 200 }
    );
  } catch (err) {
    console.error("[responses/create] unexpected error", err);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
