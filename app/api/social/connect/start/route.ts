// app/api/social/connect/start/route.ts
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

export const runtime = "nodejs";

type ProviderId = "facebook" | "instagram" | "linkedin" | "threads";

function safeBaseUrl(appUrl: string) {
  return (appUrl || "").replace(/\/$/, "");
}

function encodeState(obj: any) {
  return Buffer.from(JSON.stringify(obj)).toString("base64url");
}

export async function GET(req: NextRequest) {
  const provider = (req.nextUrl.searchParams.get("provider") || "facebook") as ProviderId;

  // ----------------------------
  // Threads (Meta Threads OAuth)
  // ----------------------------
  if (provider === "threads") {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
    const clientId = process.env.THREADS_CLIENT_ID || "";

    if (!appUrl || !clientId) {
      return NextResponse.json(
        {
          error: "Missing THREADS_CLIENT_ID or NEXT_PUBLIC_APP_URL",
          missing: {
            THREADS_CLIENT_ID: !clientId,
            NEXT_PUBLIC_APP_URL: !appUrl,
          },
        },
        { status: 500 }
      );
    }

    // MUST match your callback route
    const redirectUri = `${safeBaseUrl(appUrl)}/api/oauth/threads/callback`;

    const stateObj = {
      provider: "threads",
      nonce: crypto.randomUUID(),
      t: Date.now(),
    };
    const state = encodeState(stateObj);

    // Threads API scopes (keep minimal but useful for posting)
    const scope = ["threads_basic", "threads_content_publish"].join(",");

    // Threads auth endpoint
    const authUrl =
      "https://www.threads.net/oauth/authorize" +
      `?client_id=${encodeURIComponent(clientId)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&response_type=code` +
      `&scope=${encodeURIComponent(scope)}` +
      `&state=${encodeURIComponent(state)}`;

    const res = NextResponse.redirect(authUrl, { status: 302 });

    // Keep a cookie so callback can validate/diagnose later if needed
    res.cookies.set("oauth_state_threads", state, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 10 * 60,
    });

    return res;
  }

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

    // IMPORTANT: must match exactly what's in LinkedIn Developer "Authorized redirect URLs"
    const redirectUri = `${safeBaseUrl(appUrl)}/api/oauth/linkedin/callback`;

    // State payload
    const stateObj = {
      provider: "linkedin",
      nonce: crypto.randomUUID(),
      t: Date.now(),
    };
    const state = encodeState(stateObj);

    /**
     * Use OpenID scopes + posting scope
     */
    const scope = ["openid", "profile", "email", "w_member_social"].join(" ");

    const authUrl =
      "https://www.linkedin.com/oauth/v2/authorization" +
      `?response_type=code` +
      `&client_id=${encodeURIComponent(clientId)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&state=${encodeURIComponent(state)}` +
      `&scope=${encodeURIComponent(scope)}` +
      `&prompt=consent`;

    const res = NextResponse.redirect(authUrl, { status: 302 });

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
