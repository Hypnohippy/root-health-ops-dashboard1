// app/api/social/connect/start/route.ts
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

function b64urlEncode(obj: any) {
  const json = JSON.stringify(obj);
  return Buffer.from(json, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export async function GET(req: NextRequest) {
  const provider = req.nextUrl.searchParams.get("provider") || "facebook";

  if (provider !== "facebook") {
    return NextResponse.json(
      { error: `Unsupported provider: ${provider}` },
      { status: 400 }
    );
  }

  const appId = process.env.FACEBOOK_APP_ID || "";
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");

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

  // ✅ Optional: pass organisationId from UI now (multi-tenant ready)
  // If not provided, your /api/social-accounts route will fallback to single-tenant org.
  const organisationId = (req.nextUrl.searchParams.get("organisationId") || "").trim();

  // ✅ Canonical callback (single place)
  // This MUST match Meta "Valid OAuth Redirect URIs" exactly
  const redirectUri = `${appUrl}/api/oauth/facebook/callback`;

  // ✅ State now carries orgId + nonce (so pick-page can save to the right org)
  const statePayload = {
    provider: "facebook",
    organisationId: organisationId || null,
    nonce: crypto.randomUUID(),
    t: Date.now(),
  };

  const state = b64urlEncode(statePayload);

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

  // Store state in a short-lived cookie (basic CSRF safety)
  res.cookies.set("fb_oauth_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 10 * 60, // 10 mins
  });

  return res;
}
