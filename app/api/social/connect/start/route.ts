// app/api/social/connect/start/route.ts
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

type ProviderId = "facebook" | "instagram" | "linkedin";

function safeBaseUrl(appUrl: string) {
  return (appUrl || "").replace(/\/$/, "");
}

function encodeState(obj: any) {
  return Buffer.from(JSON.stringify(obj)).toString("base64url");
}

export async function GET(req: NextRequest) {
  const provider = (req.nextUrl.searchParams.get("provider") || "facebook") as ProviderId;

  // ----------------------------
  // LinkedIn (separate OAuth)
  // ----------------------------
  if (provider === "linkedin") {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
    const clientId = process.env.LINKEDIN_CLIENT_ID || "";

    if (!appUrl || !clientId) {
      return NextResponse.json(
        {
          error: "Missing LINKEDIN_CLIENT_ID or NEXT_PUBLIC_APP_URL",
          missing: {
            LINKEDIN_CLIENT_ID: !clientId,
            NEXT_PUBLIC_APP_URL: !appUrl,
          },
        },
        { status: 500 }
      );
    }

    const redirectUri = `${safeBaseUrl(appUrl)}/api/oauth/linkedin/callback`;

    // State payload
    const stateObj = {
      provider: "linkedin",
      nonce: crypto.randomUUID(),
      t: Date.now(),
    };
    const state = encodeState(stateObj);

    // Minimal scopes needed to post:
    // - r_liteprofile: identify the member (author)
    // - w_member_social: create posts
    const scope = ["r_liteprofile", "w_member_social"].join(" ");

    const authUrl =
      "https://www.linkedin.com/oauth/v2/authorization" +
      `?response_type=code` +
      `&client_id=${encodeURIComponent(clientId)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&state=${encodeURIComponent(state)}` +
      `&scope=${encodeURIComponent(scope)}`;

    const res = NextResponse.redirect(authUrl, { status: 302 });

    // short-lived CSRF cookie (same pattern you used for FB)
    res.cookies.set("oauth_state_linkedin", state, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 10 * 60,
    });

    return res;
  }

  // ----------------------------
  // Meta (Facebook/Instagram)
  // ----------------------------
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
  const redirectUri = `${safeBaseUrl(appUrl)}/api/oauth/facebook/callback`;

  const stateObj = {
    provider,
    nonce: crypto.randomUUID(),
    t: Date.now(),
  };
  const state = encodeState(stateObj);

  const baseScopes = [
    "public_profile",
    "pages_show_list",
    "pages_read_engagement",
    "pages_manage_posts",
    "business_management",
  ];

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
    `&auth_type=rerequest` +
    `&return_scopes=true` +
    `&scope=${encodeURIComponent(scopes.join(","))}`;

  const res = NextResponse.redirect(authUrl, { status: 302 });

  res.cookies.set("fb_oauth_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 10 * 60,
  });

  return res;
}
