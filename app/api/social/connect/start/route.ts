// app/api/social/connect/start/route.ts
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

type Provider = "facebook" | "instagram";

function isProvider(v: string): v is Provider {
  return v === "facebook" || v === "instagram";
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

  // ✅ Canonical callback (single place)
  // Must match Meta → Facebook Login → Valid OAuth Redirect URIs EXACTLY
  const redirectUri = `${appUrl.replace(/\/$/, "")}/api/oauth/facebook/callback`;

  // CSRF-ish state (we also store in a cookie)
  const state = crypto.randomUUID();

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

  // Store state + provider in short-lived cookies
  res.cookies.set("fb_oauth_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 10 * 60, // 10 mins
  });

  res.cookies.set("fb_oauth_provider", provider, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 10 * 60, // 10 mins
  });

  return res;
}
