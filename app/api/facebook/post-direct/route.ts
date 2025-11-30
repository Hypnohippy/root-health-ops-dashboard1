// app/api/facebook/post-direct/route.ts
import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/facebook/post-direct
 *
 * Body:
 * { "message": "Text to post on the Fuel Geist page" }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const message = (body?.message || "").toString().trim();

    if (!message) {
      return NextResponse.json(
        { error: "Message is required" },
        { status: 400 }
      );
    }

    const pageId = process.env.FB_PAGE_ID;
    const accessToken = process.env.FB_PAGE_ACCESS_TOKEN;

    if (!pageId || !accessToken) {
      return NextResponse.json(
        {
          error:
            "Facebook page ID or access token missing. Check FB_PAGE_ID and FB_PAGE_ACCESS_TOKEN env vars.",
        },
        { status: 500 }
      );
    }

    const url = `https://graph.facebook.com/v20.0/${pageId}/feed`;

    const params = new URLSearchParams();
    params.append("message", message);
    params.append("access_token", accessToken);

    const fbRes = await fetch(url, {
      method: "POST",
      body: params,
    });

    const fbJson = await fbRes.json();

    if (!fbRes.ok) {
      return NextResponse.json(
        {
          error: fbJson?.error?.message || "Facebook API error",
          details: fbJson,
        },
        { status: fbRes.status }
      );
    }

    return NextResponse.json({
      ok: true,
      id: fbJson.id,
      message: "Posted to Facebook page successfully",
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        error: err?.message || "Server error posting to Facebook",
      },
      { status: 500 }
    );
  }
}
