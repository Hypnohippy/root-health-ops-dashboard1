// app/api/social/connect/start/route.ts
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

type Provider = "facebook" | "instagram";

function isProvider(v: string): v is Provider {
  return v === "facebook" || v === "instagram";
}

function base64UrlEncode(obj: any) {
  const json = JSON.stringify(obj);
  const b64 = Buffer.from(json, "utf8").toString("base64");
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export async function GET(req: NextRequest) {
  const providerParam = (req.nextUrl.searchParams.get("provider") || "facebook").toLowerCase();
  const provider: Provider = isProvider(providerParam) ? providerParam : "facebook";

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

  // MUST match Meta -> Facebook Login -> Valid OAuth Redirect URIs EXACTLY
  const redirectUri = `${appUrl.replace(/\/$/, "")}/api/oauth/facebook/callback`;

  // Put provider INSIDE state so we don't rely on cookies surviving redirects.
  const nonce = crypto.randomUUID();
  const state = base64UrlEncode({
    provider,
    nonce,
    t: Date.now(),
  });

  const baseScopes = ["public_profile", "pages_show_list", "pages_read_engagement"];
  const fbExtraScopes = ["pages_manage_posts"];
  const igExtraScopes = ["instagram_basic", "instagram_content_publish"];

  const scopes =
    provider === "instagram"
      ? [...baseScopes, ...igExtraScopes]
      : [...baseScopes, ...fbExtraScopes];

  const authUrl =
    "https://www.facebook.com/v24.0/dialog/oauth" +
    `?client_id=${encodeURIComponent(appId)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&state=${encodeURIComponent(state)}` +
    `&response_type=code` +
    `&scope=${encodeURIComponent(scopes.join(","))}`;

  const res = NextResponse.redirect(authUrl, { status: 302 });

  // Still keep a simple nonce cookie (optional sanity check)
  res.cookies.set("fb_oauth_nonce", nonce, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 10 * 60,
  });

  return res;
}
