// app/api/social/connect/start/route.ts
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

export const runtime = "nodejs";

function baseUrl(req: NextRequest) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
  return appUrl ? appUrl.replace(/\/$/, "") : req.nextUrl.origin;
}

function encodeState(obj: any) {
  return Buffer.from(JSON.stringify(obj)).toString("base64url");
}

export async function GET(req: NextRequest) {
  const provider = (req.nextUrl.searchParams.get("provider") || "").toLowerCase();

  /**
   * ============================
   * THREADS (NATIVE OAUTH ONLY)
   * ============================
   */
  if (provider === "threads") {
    const THREADS_CLIENT_ID = process.env.THREADS_CLIENT_ID || "";
    const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "";

    if (!THREADS_CLIENT_ID || !APP_URL) {
      return NextResponse.json(
        {
          error: "Missing THREADS_CLIENT_ID or NEXT_PUBLIC_APP_URL",
          missing: {
            THREADS_CLIENT_ID: !THREADS_CLIENT_ID,
            NEXT_PUBLIC_APP_URL: !APP_URL,
          },
        },
        { status: 500 }
      );
    }

    const redirectUri = `${baseUrl(req)}/api/oauth/threads/callback`;

    const state = encodeState({
      provider: "threads",
      nonce: crypto.randomUUID(),
      t: Date.now(),
    });

    const authUrl =
      "https://www.threads.com/oauth/authorize?" +
      new URLSearchParams({
        client_id: THREADS_CLIENT_ID,
        redirect_uri: redirectUri,
        response_type: "code",
        scope: "threads_basic,threads_content_publish",
        state,
      }).toString();

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

  /**
   * ============================
   * LINKEDIN
   * ============================
   */
  if (provider === "linkedin") {
    const clientId = process.env.LINKEDIN_CLIENT_ID || "";
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";

    if (!clientId || !appUrl) {
      return NextResponse.json(
        { error: "Missing LINKEDIN_CLIENT_ID or NEXT_PUBLIC_APP_URL" },
        { status: 500 }
      );
    }

    const redirectUri = `${baseUrl(req)}/api/oauth/linkedin/callback`;

    const state = encodeState({
      provider: "linkedin",
      nonce: crypto.randomUUID(),
      t: Date.now(),
    });

    const authUrl =
      "https://www.linkedin.com/oauth/v2/authorization?" +
      new URLSearchParams({
        response_type: "code",
        client_id: clientId,
        redirect_uri: redirectUri,
        scope: "openid profile email w_member_social",
        state,
        prompt: "consent",
      }).toString();

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

  /**
   * ============================
   * META (FACEBOOK / INSTAGRAM)
   * ============================
   */
  if (provider === "facebook" || provider === "instagram") {
    const FACEBOOK_APP_ID = process.env.FACEBOOK_APP_ID || "";
    const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "";

    if (!FACEBOOK_APP_ID || !APP_URL) {
      return NextResponse.json(
        { error: "Missing FACEBOOK_APP_ID or NEXT_PUBLIC_APP_URL" },
        { status: 500 }
      );
    }

    const redirectUri = `${baseUrl(req)}/api/oauth/facebook/callback`;

    const state = encodeState({
      provider,
      nonce: crypto.randomUUID(),
      t: Date.now(),
    });

    const scopes =
      provider === "instagram"
        ? [
            "public_profile",
            "pages_show_list",
            "pages_read_engagement",
            "pages_manage_posts",
            "business_management",
            "instagram_basic",
            "instagram_content_publish",
          ]
        : [
            "public_profile",
            "pages_show_list",
            "pages_read_engagement",
            "pages_manage_posts",
            "business_management",
          ];

    const authUrl =
      "https://www.facebook.com/v24.0/dialog/oauth?" +
      new URLSearchParams({
        client_id: FACEBOOK_APP_ID,
        redirect_uri: redirectUri,
        response_type: "code",
        scope: scopes.join(","),
        state,
        auth_type: "rerequest",
        return_scopes: "true",
      }).toString();

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

  return NextResponse.json(
    { error: `Unsupported provider: ${provider}` },
    { status: 400 }
  );
}
