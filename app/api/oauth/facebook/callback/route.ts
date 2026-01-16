// app/api/oauth/facebook/callback/route.ts
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "";
const FACEBOOK_APP_ID = process.env.FACEBOOK_APP_ID || "";
const FACEBOOK_APP_SECRET = process.env.FACEBOOK_APP_SECRET || "";

function baseUrl(req: NextRequest) {
  // Prefer env; fallback to request origin
  try {
    return APP_URL ? APP_URL.replace(/\/$/, "") : req.nextUrl.origin;
  } catch {
    return APP_URL ? APP_URL.replace(/\/$/, "") : "";
  }
}

export async function GET(req: NextRequest) {
  try {
    if (!FACEBOOK_APP_ID || !FACEBOOK_APP_SECRET) {
      return NextResponse.json(
        { error: "Missing FACEBOOK_APP_ID or FACEBOOK_APP_SECRET" },
        { status: 400 }
      );
    }

    const errorFromFb = req.nextUrl.searchParams.get("error");
    const errorDesc = req.nextUrl.searchParams.get("error_description");
    if (errorFromFb) {
      return NextResponse.json(
        { error: "Facebook returned an error", details: { errorFromFb, errorDesc } },
        { status: 400 }
      );
    }

    const code = req.nextUrl.searchParams.get("code") || "";
    const state = req.nextUrl.searchParams.get("state") || "";

    if (!code) {
      return NextResponse.json({ error: "Missing code" }, { status: 400 });
    }

    // ✅ CRITICAL: must match the redirect_uri Facebook actually used for THIS callback request
    const redirectUri = `${baseUrl(req)}${req.nextUrl.pathname}`;

    // Exchange code for user access token
    const tokenRes = await fetch(
      "https://graph.facebook.com/v19.0/oauth/access_token?" +
        new URLSearchParams({
          client_id: FACEBOOK_APP_ID,
          client_secret: FACEBOOK_APP_SECRET,
          redirect_uri: redirectUri,
          code,
        }).toString(),
      { method: "GET", cache: "no-store" }
    );

    const tokenJson: any = await tokenRes.json().catch(() => null);

    if (!tokenRes.ok || !tokenJson?.access_token) {
      return NextResponse.json(
        {
          error: "Token exchange failed",
          used_redirect_uri: redirectUri,
          details: tokenJson,
        },
        { status: 400 }
      );
    }

    const accessToken = String(tokenJson.access_token);

    // Redirect to picker WITH token + state
    const pickUrl = new URL(`${baseUrl(req)}/oauth/facebook/pick-page`);
    pickUrl.searchParams.set("token", accessToken);
    if (state) pickUrl.searchParams.set("state", state);

    return NextResponse.redirect(pickUrl.toString(), { status: 302 });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Callback crashed" },
      { status: 500 }
    );
  }
}
