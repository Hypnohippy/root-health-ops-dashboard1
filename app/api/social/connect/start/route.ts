// app/api/social/connect/start/route.ts
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

type Provider = "facebook" | "instagram";

function base64UrlEncode(obj: any) {
  const json = JSON.stringify(obj);
  const b64 = Buffer.from(json, "utf8").toString("base64");
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export async function GET(req: NextRequest) {
  const providerRaw = (req.nextUrl.searchParams.get("provider") || "facebook")
    .toLowerCase()
    .trim();

  const provider: Provider =
    providerRaw === "instagram" ? "instagram" : "facebook";

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

  // Canonical callback (single place)
  // Must match Meta Valid OAuth Redirect URIs exactly
  const redirectUri = `${appUrl.replace(/\/$/, "")}/api/oauth/facebook/callback`;

  // Put provider into state so callback knows where to send user next
  const stateObj = {
    provider,
    nonce: crypto.randomUUID(),
    t: Date.now(),
  };
  const state = base64UrlEncode(stateObj);

  // Scopes
  // - Facebook posting uses pages_* scopes
  // - Instagram picker needs pages + instagram_basic to read linked IG business account
  const scopes =
    provider === "instagram"
      ? [
          "public_profile",
          "pages_show_list",
          "pages_read_engagement",
          "instagram_basic",
        ]
      : [
          "public_profile",
          "pages_show_list",
          "pages_read_engagement",
          "pages_manage_posts",
        ];

  const authUrl =
    "https://www.facebook.com/v24.0/dialog/oauth" +
    `?client_id=${encodeURIComponent(appId)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&state=${encodeURIComponent(state)}` +
    `&response_type=code` +
    `&scope=${encodeURIComponent(scopes.join(","))}`;

  const res = NextResponse.redirect(authUrl, { status: 302 });

  // Store state in a short-lived cookie (basic CSRF protection)
  res.cookies.set("fb_oauth_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 10 * 60, // 10 mins
  });

  return res;
}
