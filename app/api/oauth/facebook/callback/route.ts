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

function base64UrlDecode(str: string) {
  try {
    const b64 = str.replace(/-/g, "+").replace(/_/g, "/");
    const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
    const json = Buffer.from(b64 + pad, "base64").toString("utf8");
    return JSON.parse(json);
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
    const stateRaw = req.nextUrl.searchParams.get("state") || "";

    if (!code) {
      return NextResponse.json({ error: "Missing code" }, { status: 400 });
    }

    const decoded = base64UrlDecode(stateRaw) || {};
    const provider = (decoded?.provider || "facebook").toLowerCase();
    const nonceFromState = String(decoded?.nonce || "");
    const nonceCookie = req.cookies.get("fb_oauth_nonce")?.value || "";

    // Optional sanity check (won't block if cookie is missing)
    if (nonceCookie && nonceFromState && nonceCookie !== nonceFromState) {
      return NextResponse.json(
        { error: "State/nonce mismatch. Please click Connect again." },
        { status: 400 }
      );
    }

    const redirectUri = `${baseUrl(req)}/api/oauth/facebook/callback`;

    // 1) code -> short-lived user token
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

    // 2) short -> long-lived user token (~60 days)
    const longUrl =
      "https://graph.facebook.com/v19.0/oauth/access_token?" +
      new URLSearchParams({
        grant_type: "fb_exchange_token",
        client_id: FACEBOOK_APP_ID,
        client_secret: FACEBOOK_APP_SECRET,
        fb_exchange_token: shortUserToken,
      }).toString();

    const longTok = await fetchJson(longUrl);
    const userToken = String(longTok.json?.access_token || shortUserToken);

    // Next step page based on provider (from state)
    const nextPath =
      provider === "instagram" ? "/oauth/instagram/pick-account" : "/oauth/facebook/pick-page";

    const pickUrl = new URL(`${baseUrl(req)}${nextPath}`);
    pickUrl.searchParams.set("token", userToken);
    if (stateRaw) pickUrl.searchParams.set("state", stateRaw);

    const res = NextResponse.redirect(pickUrl.toString(), { status: 302 });

    // Clear nonce cookie
    res.cookies.set("fb_oauth_nonce", "", { path: "/", maxAge: 0 });

    return res;
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Callback crashed" },
      { status: 500 }
    );
  }
}
