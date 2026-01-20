// app/api/oauth/linkedin/start/route.ts
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

function safeBaseUrl(appUrl: string) {
  return (appUrl || "").replace(/\/$/, "");
}

export async function GET(req: NextRequest) {
  const clientId = process.env.LINKEDIN_CLIENT_ID || "";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";

  if (!clientId || !appUrl) {
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

  const stateObj = {
    provider: "linkedin",
    nonce: crypto.randomUUID(),
    t: Date.now(),
  };
  const state = Buffer.from(JSON.stringify(stateObj)).toString("base64url");

  // LinkedIn scopes are space-separated
  const scope = ["openid", "profile", "email", "w_member_social"].join(" ");

  const authUrl =
    "https://www.linkedin.com/oauth/v2/authorization" +
    `?response_type=code` +
    `&client_id=${encodeURIComponent(clientId)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&state=${encodeURIComponent(state)}` +
    `&scope=${encodeURIComponent(scope)}`;

  const res = NextResponse.redirect(authUrl, { status: 302 });

  // short-lived CSRF cookie
  res.cookies.set("li_oauth_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 10 * 60,
  });

  return res;
}
