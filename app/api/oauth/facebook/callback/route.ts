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

function base64UrlDecodeToJson<T = any>(b64url: string): T | null {
  try {
    const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
    const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
    const json = Buffer.from(b64 + pad, "base64").toString("utf8");
    return JSON.parse(json) as T;
  } catch {
    return null;
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

    // Optional: verify state cookie matches
    const stateCookie = req.cookies.get("fb_oauth_state")?.value || "";
    if (stateCookie && state && stateCookie !== state) {
      return NextResponse.json({ error: "Invalid state (CSRF)" }, { status: 400 });
    }

    // Decode provider from state (default to facebook)
    const decoded = base64UrlDecodeToJson<{ provider?: string }>(state);
    const provider = (decoded?.provider || "facebook").toLowerCase().trim();

    const redirectUri = `${baseUrl(req)}/api/oauth/facebook/callback`;

    // 1) Exchange code -> SHORT-LIVED user token
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

    // 2) Exchange SHORT -> LONG-LIVED user token (~60 days)
    const longUrl =
      "https://graph.facebook.com/v19.0/oauth/access_token?" +
      new URLSearchParams({
        grant_type: "fb_exchange_token",
        client_id: FACEBOOK_APP_ID,
        client_secret: FACEBOOK_APP_SECRET,
        fb_exchange_token: shortUserToken,
      }).toString();

    const longTok = await fetchJson(longUrl);

    // If long exchange fails, fall back to short token
    const userToken = String(longTok.json?.access_token || shortUserToken);

    // ✅ Choose the correct picker based on provider
    const pickerPath =
      provider === "instagram" ? "/oauth/instagram/pick-account" : "/oauth/facebook/pick-page";

    const pickUrl = new URL(`${baseUrl(req)}${pickerPath}`);
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
