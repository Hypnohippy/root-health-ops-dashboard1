// app/api/oauth/facebook/callback/route.ts
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

    const redirectUri = `${baseUrl(req)}/api/oauth/facebook/callback`;

    // 1) Exchange code -> SHORT-LIVED user access token
    const shortUrl =
      "https://graph.facebook.com/v19.0/oauth/access_token?" +
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

    // 2) Exchange SHORT -> LONG-LIVED user access token (about 60 days)
    const longUrl =
      "https://graph.facebook.com/v19.0/oauth/access_token?" +
      new URLSearchParams({
        grant_type: "fb_exchange_token",
        client_id: FACEBOOK_APP_ID,
        client_secret: FACEBOOK_APP_SECRET,
        fb_exchange_token: shortUserToken,
      }).toString();

    const longTok = await fetchJson(longUrl);

    // If this fails, fall back to short token rather than breaking flow
    const userToken = String(longTok.json?.access_token || shortUserToken);

    // Redirect to picker with token + state
    const pickUrl = new URL(`${baseUrl(req)}/oauth/facebook/pick-page`);
    pickUrl.searchParams.set("token", userToken);
    if (state) pickUrl.searchParams.set("state", state);

    return NextResponse.redirect(pickUrl.toString(), { status: 302 });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Callback crashed" },
      { status: 500 }
    );
  }
}
