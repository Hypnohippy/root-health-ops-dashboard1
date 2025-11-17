import { NextRequest, NextResponse } from "next/server";

const FACEBOOK_PAGE_ID = process.env.FACEBOOK_PAGE_ID;
const FACEBOOK_PAGE_ACCESS_TOKEN = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;

if (!FACEBOOK_PAGE_ID || !FACEBOOK_PAGE_ACCESS_TOKEN) {
  console.warn(
    "[facebook/post] Missing FACEBOOK_PAGE_ID or FACEBOOK_PAGE_ACCESS_TOKEN env vars"
  );
}

export async function POST(req: NextRequest) {
  try {
    if (!FACEBOOK_PAGE_ID || !FACEBOOK_PAGE_ACCESS_TOKEN) {
      return NextResponse.json(
        { error: "Facebook is not configured" },
        { status: 500 }
      );
    }

    const { message, link } = await req.json();

    if (!message) {
      return NextResponse.json(
        { error: "message is required" },
        { status: 400 }
      );
    }

    const params = new URLSearchParams();
    params.append("message", message);
    params.append("access_token", FACEBOOK_PAGE_ACCESS_TOKEN);
    if (link) {
      params.append("link", link);
    }

    const res = await fetch(
      `https://graph.facebook.com/v21.0/${FACEBOOK_PAGE_ID}/feed`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
      }
    );

    const data = await res.json();

    if (!res.ok) {
      console.error("[facebook/post] Error", data);
      return NextResponse.json(
        { error: data.error?.message || "Failed to post to Facebook" },
        { status: res.status }
      );
    }

    return NextResponse.json({ ok: true, result: data });
  } catch (err: any) {
    console.error("[facebook/post] Exception", err);
    return NextResponse.json(
      { error: err?.message || "Server error" },
      { status: 500 }
    );
  }
}
