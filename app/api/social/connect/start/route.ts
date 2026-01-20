// app/api/social/connect/start/route.ts
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

type ProviderId = "facebook" | "instagram";

function safeBaseUrl(appUrl: string) {
  return (appUrl || "").replace(/\/$/, "");
}

export async function GET(req: NextRequest) {
  const provider = (req.nextUrl.searchParams.get("provider") || "facebook") as ProviderId;

  if (provider !== "facebook" && provider !== "instagram") {
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

  // ✅ Canonical callback
  // Add THIS EXACT URL to Meta → Facebook Login → Valid OAuth Redirect URIs
  const redirectUri = `${safeBaseUrl(appUrl)}/api/oauth/facebook/callback`;

  // State payload (we use provider later)
  const stateObj = {
    provider,
    nonce: crypto.randomUUID(),
    t: Date.now(),
  };
  const state = Buffer.from(JSON.stringify(stateObj)).toString("base64url");

  // ✅ Scopes
  // business_management is the KEY that makes pages show up reliably for Business Portfolio / New Pages.
  const baseScopes = [
    "public_profile",
    "pages_show_list",
    "pages_read_engagement",
    "pages_manage_posts",
    "business_management",
  ];

  // Instagram uses the SAME Meta login; we’ll pick FB Page then detect IG business acct.
  const instagramScopes = [
    ...baseScopes,
    "instagram_basic",
    "instagram_content_publish",
  ];

  const scopes = provider === "instagram" ? instagramScopes : baseScopes;

  const authUrl =
    "https://www.facebook.com/v24.0/dialog/oauth" +
    `?client_id=${encodeURIComponent(appId)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&state=${encodeURIComponent(state)}` +
    `&response_type=code` +
    // ✅ These two make Facebook re-offer missing scopes when it “remembers” you:
    `&auth_type=rerequest` +
    `&return_scopes=true` +
    `&scope=${encodeURIComponent(scopes.join(","))}`;

  const res = NextResponse.redirect(authUrl, { status: 302 });

  // Store state in short-lived cookie (CSRF + sanity)
  res.cookies.set("fb_oauth_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 10 * 60, // 10 mins
  });

  return res;
}
