import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "";
const FACEBOOK_APP_ID = process.env.FACEBOOK_APP_ID || "";
const FACEBOOK_APP_SECRET = process.env.FACEBOOK_APP_SECRET || "";

function baseUrl(req: NextRequest) {
  try {
    return APP_URL ? APP_URL.replace(/\/$/, "") : req.nextUrl.origin;
  } catch {
    return APP_URL ? APP_URL.replace(/\/$/, "") : "";
  }
}

async function fetchJson(url: string) {
  const res = await fetch(url, { method: "GET", cache: "no-store" });
  const json: any = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, json };
}

export async function GET(req: NextRequest) {
  try {
    if (!FACEBOOK_APP_ID || !FACEBOOK_APP_SECRET) {
      return NextResponse.json(
        { error: "Missing FACEBOOK_APP_ID or FACEBOOK_APP_SECRET" },
        { status: 400 }
      );
    }

    const code = req.nextUrl.searchParams.get("code") || "";
    const state = req.nextUrl.searchParams.get("state") || "";

    if (!code) {
      return NextResponse.json({ error: "Missing code" }, { status: 400 });
    }

    // MUST match your Meta Valid OAuth Redirect URI EXACTLY
    const redirectUri = `${baseUrl(req)}/api/oauth/facebook/callback`;

    // 1) Exchange code -> short-lived user token
    const shortUrl =
      "https://graph.facebook.com/v24.0/oauth/access_token?" +
      new URLSearchParams({
        client_id: FACEBOOK_APP_ID,
        client_secret: FACEBOOK_APP_SECRET,
        redirect_uri: redirectUri,
        code,
      }).toString();

    const shortTok = await fetchJson(shortUrl);

    if (!shortTok.ok || !shortTok.json?.access_token) {
      return NextResponse.json(
        { error: "Token exchange failed", details: shortTok.json },
        { status: 400 }
      );
    }

    const shortUserToken = String(shortTok.json.access_token);

    // 2) Exchange -> long-lived user token (best effort; fallback is short token)
    const longUrl =
      "https://graph.facebook.com/v24.0/oauth/access_token?" +
      new URLSearchParams({
        grant_type: "fb_exchange_token",
        client_id: FACEBOOK_APP_ID,
        client_secret: FACEBOOK_APP_SECRET,
        fb_exchange_token: shortUserToken,
      }).toString();

    const longTok = await fetchJson(longUrl);
    const userToken = String(longTok.json?.access_token || shortUserToken);

    // ✅ IMPORTANT: set cookie so pick-page can work WITHOUT token in URL
    const res = NextResponse.redirect(`${baseUrl(req)}/oauth/facebook/pick-page`, {
      status: 302,
    });

    res.cookies.set("fb_user_token", userToken, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 10 * 60, // 10 minutes
    });

    // Optional: keep state around if you want later (not required for now)
    if (state) {
      res.cookies.set("fb_oauth_state_echo", state, {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/",
        maxAge: 10 * 60,
      });
    }

    return res;
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Callback crashed" },
      { status: 500 }
    );
  }
}
