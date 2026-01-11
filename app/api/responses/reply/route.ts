// app/api/responses/reply/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

const AYRSHARE_API_KEY = process.env.AYRSHARE_API_KEY;

// Supported by Ayrshare reply endpoint (threads is not listed for replies there)
const ALLOWED_PLATFORMS = new Set([
  "facebook",
  "instagram",
  "linkedin",
  "tiktok",
  "twitter",
  "youtube",
  "bluesky",
]);

export async function POST(req: NextRequest) {
  try {
    if (!AYRSHARE_API_KEY) {
      return NextResponse.json(
        { success: false, error: "Missing AYRSHARE_API_KEY in env." },
        { status: 200 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const organisationId = String(body?.organisationId || "").trim();
    const platform = String(body?.platform || "").toLowerCase().trim();
    const socialCommentId = String(body?.socialCommentId || "").trim();
    const replyText = String(body?.replyText || "").trim();

    if (!organisationId) {
      return NextResponse.json(
        { success: false, error: "Missing organisationId" },
        { status: 400 }
      );
    }

    if (!platform || !ALLOWED_PLATFORMS.has(platform)) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Unsupported platform for replies. Use: facebook, instagram, linkedin, tiktok, twitter, youtube.",
        },
        { status: 400 }
      );
    }

    if (!socialCommentId) {
      return NextResponse.json(
        { success: false, error: "Missing socialCommentId" },
        { status: 400 }
      );
    }

    if (!replyText) {
      return NextResponse.json(
        { success: false, error: "Reply text is required" },
        { status: 400 }
      );
    }

    // Reply using Social Comment ID:
    // - Must set searchPlatformId=true
    // - Must specify ONE platform
    const res = await fetch(
      `https://api.ayrshare.com/api/comments/reply/${encodeURIComponent(socialCommentId)}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${AYRSHARE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          platforms: [platform],
          comment: replyText,
          searchPlatformId: true,
          objResponse: true,
        }),
      }
    );

    const data = await res.json().catch(() => ({}));

    if (!res.ok || data?.status === "error") {
      return NextResponse.json(
        {
          success: false,
          error: "Reply failed",
          status: res.status,
          details: data,
        },
        { status: 200 }
      );
    }

    // Mark as replied in our inbox (best-effort)
    await supabaseAdmin
      .from("inbox_items")
      .update({ status: "replied" })
      .eq("organisation_id", organisationId)
      .eq("platform", platform)
      .eq("social_comment_id", socialCommentId);

    return NextResponse.json(
      { success: true, result: data },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("[responses/reply] unexpected error", err);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
