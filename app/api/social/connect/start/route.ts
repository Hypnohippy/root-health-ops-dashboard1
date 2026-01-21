// app/api/social/connect/start/route.ts
import { NextRequest, NextResponse } from "next/server";

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

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
  if (!appUrl) {
    return NextResponse.json(
      { error: "Missing NEXT_PUBLIC_APP_URL" },
      { status: 500 }
    );
  }

  // ----------------------------
  // LinkedIn (separate OAuth)
  // ----------------------------
  if (provider === "linkedin") {
    const clientId = process.env.LINKEDIN_CLIENT_ID || "";

    if (!clientId) {
      return NextResponse.json(
        { error: "Missing LINKEDIN_CLIENT_ID" },
        { status: 500 }
      );
    }

    const redirectUri = `${safeBaseUrl(appUrl)}/api/oauth/linkedin/callback`;

    const stateObj = {
      provider: "linkedin",
      nonce: crypto.randomUUID(),
      t: Date.now(),
    };
    const state = encodeState(stateObj);

    const scope = ["r_liteprofile", "w_member_social"].join(" ");

    const authUrl =
      "https://www.linkedin.com/oauth/v2/authorization" +
      `?response_type=code` +
      `&client_id=${encodeURIComponent(clientId)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&state=${encodeURIComponent(state)}` +
      `&scope=${encodeURIComponent(scope)}`;

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
  // Threads (separate OAuth)
  // ----------------------------
  if (provider === "threads") {
    const clientId = process.env.THREADS_CLIENT_ID || "";

    if (!clientId) {
      return NextResponse.json(
        { error: "Missing THREADS_CLIENT_ID" },
        { status: 500 }
      );
    }

    const redirectUri = `${safeBaseUrl(appUrl)}/api/oauth/threads/callback`;

    const stateObj = {
      provider: "threads",
      nonce: crypto.randomUUID(),
      t: Date.now(),
    };
    const state = encodeState(stateObj);

    // Threads scopes (you already saw threads_basic is required)
    const scope = ["threads_basic", "threads_content_publish"].join(" ");

    const authUrl =
      "https://threads.net/oauth/authorize" +
      `?response_type=code` +
      `&client_id=${encodeURIComponent(clientId)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&state=${encodeURIComponent(state)}` +
      `&scope=${encodeURIComponent(scope)}`;

    const res = NextResponse.redirect(authUrl, { status: 302 });

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
  // Meta (Facebook/Instagram)
  // ----------------------------
  if (provider !== "facebook" && provider !== "instagram") {
    return NextResponse.json(
      { error: `Unsupported provider: ${provider}` },
      { status: 400 }
    );
  }

  const appId = process.env.FACEBOOK_APP_ID || "";

  if (!appId) {
    return NextResponse.json(
      { error: "Missing FACEBOOK_APP_ID" },
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
