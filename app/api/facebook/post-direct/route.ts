// app/api/facebook/post-direct/route.ts
import { NextResponse } from "next/server";

// Try a few possible env var names so we don't fight naming differences
const PAGE_ID =
  process.env.FACEBOOK_PAGE_ID ||
  process.env.FB_PAGE_ID ||
  process.env.NEXT_PUBLIC_FACEBOOK_PAGE_ID;

const PAGE_ACCESS_TOKEN =
  process.env.FACEBOOK_PAGE_ACCESS_TOKEN ||
  process.env.FB_PAGE_ACCESS_TOKEN ||
  process.env.PAGE_ACCESS_TOKEN ||
  process.env.NEXT_PUBLIC_FACEBOOK_PAGE_ACCESS_TOKEN;

export async function POST(req: Request) {
  try {
    if (!PAGE_ID || !PAGE_ACCESS_TOKEN) {
      return NextResponse.json(
        {
          error:
            "Missing Facebook Page ID or Access Token env vars. Expected one of: FACEBOOK_PAGE_ID / FB_PAGE_ID (for ID) and FACEBOOK_PAGE_ACCESS_TOKEN / FB_PAGE_ACCESS_TOKEN / PAGE_ACCESS_TOKEN (for token).",
        },
        { status: 500 }
      );
    }

    const body = (await req.json().catch(() => null)) as any;

    const message = body?.message as string | undefined;

    if (!message || !message.trim()) {
      return NextResponse.json(
        { error: "Message is required." },
        { status: 400 }
      );
    }

    // Facebook Graph API: POST /{page-id}/feed
    const url = `https://graph.facebook.com/v18.0/${PAGE_ID}/feed`;

    const params = new URLSearchParams();
    params.set("message", message);
    params.set("access_token", PAGE_ACCESS_TOKEN);

    const fbRes = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });

    let fbData: any = null;
    try {
      fbData = await fbRes.json();
    } catch {
      fbData = null;
    }

    if (!fbRes.ok) {
      console.error("[facebook/post-direct] Facebook error", fbData || fbRes.status);
      const errMsg =
        fbData?.error?.message ||
        `Facebook returned status ${fbRes.status}. Check your tokens, page ID and permissions.`;
      return NextResponse.json({ error: errMsg }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      facebookResponse: fbData,
    });
  } catch (error: any) {
    console.error("[facebook/post-direct] Unexpected error", error);
    return NextResponse.json(
      { error: error?.message || "Unexpected error posting to Facebook." },
      { status: 500 }
    );
  }
}
