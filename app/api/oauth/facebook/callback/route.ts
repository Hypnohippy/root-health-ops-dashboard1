// app/api/oauth/facebook/callback/route.ts
import { NextRequest, NextResponse } from "next/server";

function base64UrlDecode(input: string) {
  const b64 = input.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4 ? "=".repeat(4 - (b64.length % 4)) : "";
  return Buffer.from(b64 + pad, "base64").toString("utf8");
}

export async function GET(req: NextRequest) {
  try {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
    const FACEBOOK_APP_ID = process.env.FACEBOOK_APP_ID || "";
    const FACEBOOK_APP_SECRET = process.env.FACEBOOK_APP_SECRET || "";

    if (!appUrl || !FACEBOOK_APP_ID || !FACEBOOK_APP_SECRET) {
      return NextResponse.json(
        { error: "Missing NEXT_PUBLIC_APP_URL or FACEBOOK_APP_ID or FACEBOOK_APP_SECRET" },
        { status: 500 }
      );
    }

    const url = req.nextUrl;
    const code = url.searchParams.get("code") || "";
    const state = url.searchParams.get("state") || "";
    const error = url.searchParams.get("error") || "";
    const errorDesc = url.searchParams.get("error_description") || "";

    if (error) {
      return NextResponse.json(
        { error: `Facebook OAuth error: ${error}`, details: errorDesc || null },
        { status: 400 }
      );
    }

    if (!code) {
      return NextResponse.json({ error: "Missing code" }, { status: 400 });
    }

    const appUrlClean = appUrl.replace(/\/$/, "");
    const redirectUri = `${appUrlClean}/api/oauth/facebook/callback`;

    // 1) Exchange code -> short-lived user access token
    const tokenRes = await fetch(
      `https://graph.facebook.com/v19.0/oauth/access_token?` +
        new URLSearchParams({
          client_id: FACEBOOK_APP_ID,
          redirect_uri: redirectUri,
          client_secret: FACEBOOK_APP_SECRET,
          code,
        }).toString(),
      { method: "GET", cache: "no-store" }
    );

    const tokenJson: any = await tokenRes.json().catch(() => null);

    if (!tokenRes.ok) {
      return NextResponse.json(
        { error: "Token exchange failed", details: tokenJson },
        { status: 400 }
      );
    }

    const userToken = String(tokenJson?.access_token || "");
    if (!userToken) {
      return NextResponse.json(
        { error: "Token exchange returned no access_token", details: tokenJson },
        { status: 400 }
      );
    }

    // (Optional safety) decode state to make sure it's valid-ish
    if (state) {
      try {
        const decoded = JSON.parse(base64UrlDecode(state));
        // no-op: we just ensure it is parseable
        void decoded;
      } catch {
        // ignore: we won't hard-fail on state parsing
      }
    }

    // 2) Redirect to picker UI so YOU choose the correct Page (not Wellbeing Cafe)
    const pickerUrl =
      `${appUrlClean}/oauth/facebook/pick-page` +
      `?token=${encodeURIComponent(userToken)}` +
      `&state=${encodeURIComponent(state)}`;

    return NextResponse.redirect(pickerUrl, { status: 302 });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Facebook callback crashed" },
      { status: 500 }
    );
  }
}
