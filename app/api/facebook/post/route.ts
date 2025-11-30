import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/facebook/post
 *
 * Body:
 * {
 *   "text": "The full post text to publish to Facebook",
 *   "link"?: "https://optional-link.com"
 * }
 *
 * This posts to your Fuel Geist Facebook PAGE, using:
 * - FACEBOOK_PAGE_ID
 * - FACEBOOK_PAGE_ACCESS_TOKEN
 */

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { text, link } = body || {};

    if (!text || typeof text !== "string" || !text.trim()) {
      return NextResponse.json(
        { error: "Missing 'text' in request body for Facebook post" },
        { status: 400 }
      );
    }

    const pageId = process.env.FACEBOOK_PAGE_ID;
    const accessToken = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;

    if (!pageId || !accessToken) {
      return NextResponse.json(
        {
          error:
            "FACEBOOK_PAGE_ID or FACEBOOK_PAGE_ACCESS_TOKEN not configured in environment",
        },
        { status: 500 }
      );
    }

    // Build parameters for Graph API
    const params: Record<string, string> = {
      message: text,
      access_token: accessToken,
    };

    if (link && typeof link === "string" && link.trim()) {
      params.link = link.trim();
    }

    const fbRes = await fetch(
      `https://graph.facebook.com/v21.0/${pageId}/feed`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams(params),
      }
    );

    const fbData = await fbRes.json();

    if (!fbRes.ok) {
      console.error("Facebook API error:", fbData);
      return NextResponse.json(
        {
          error:
            fbData?.error?.message ||
            "Facebook API error when creating the post",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      postId: fbData.id || fbData.post_id || null,
    });
  } catch (err: any) {
    console.error("Facebook post route error:", err);
    return NextResponse.json(
      { error: err?.message || "Unexpected server error in Facebook route" },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    route: "/api/facebook/post",
    usage:
      "POST { text: '...', link?: 'https://...' } to create a post on the configured Facebook Page.",
  });
}
