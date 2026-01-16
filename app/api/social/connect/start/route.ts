// app/api/social/connect/start/route.ts
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const provider = req.nextUrl.searchParams.get("provider") || "facebook";

  if (provider !== "facebook") {
    return NextResponse.json(
      { error: `Unsupported provider: ${provider}` },
      { status: 400 }
    );
  }

  const appId = process.env.FACEBOOK_APP_ID || "";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";

  if (!appId || !appUrl) {
    return NextResponse.json(
      {
        error: "Missing FACEBOOK_APP_ID or NEXT_PUBLIC_APP_URL",
        missing: {
          FACEBOOK_APP_ID: !appId,
          NEXT_PUBLIC_APP_URL: !appUrl,
        },
      },
      { status: 500 }
    );
  }

  // ✅ Canonical callback (single place)
  // Add THIS EXACT URL to Meta → Facebook Login → Valid OAuth Redirect URIs
  const redirectUri = `${appUrl.replace(/\/$/, "")}/api/oauth/facebook/callback`;

  const state = crypto.randomUUID();

  const authUrl =
    "https://www.facebook.com/v24.0/dialog/oauth" +
    `?client_id=${encodeURIComponent(appId)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&state=${encodeURIComponent(state)}` +
    `&response_type=code` +
    `&scope=${encodeURIComponent(
      [
        "public_profile",
        "pages_show_list",
        "pages_read_engagement",
        "pages_manage_posts",
      ].join(",")
    )}`;

  const res = NextResponse.redirect(authUrl, { status: 302 });

  res.cookies.set("fb_oauth_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 10 * 60, // 10 mins
  });

  return res;
}
