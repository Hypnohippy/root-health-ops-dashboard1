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

function decodeStateProvider(state: string): "facebook" | "instagram" | "threads" | null {
  try {
    if (!state) return null;
    // state is base64url(JSON)
    const jsonStr = Buffer.from(state, "base64url").toString("utf8");
    const obj = JSON.parse(jsonStr);
    const p = String(obj?.provider || "").toLowerCase().trim();
    if (p === "facebook" || p === "instagram" || p === "threads") return p;
    return null;
  } catch {
    return null;
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

    const code = req.nextUrl.searchParams.get("code") || "";
    const state = req.nextUrl.searchParams.get("state") || "";

    if (!code) {
      // If user hits callback without code, send them back to Connect (no JSON dead-end)
      const back = new URL(`${baseUrl(req)}/dashboard/connect`);
      back.searchParams.set("error", "missing_code");
      return NextResponse.redirect(back.toString(), { status: 302 });
    }

    const redirectUri = `${baseUrl(req)}/api/oauth/facebook/callback`;

    // 1) code -> short-lived user token
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
      const back = new URL(`${baseUrl(req)}/dashboard/connect`);
      back.searchParams.set("error", "token_exchange_failed");
      return NextResponse.redirect(back.toString(), { status: 302 });
    }

    const shortUserToken = String(shortTok.json.access_token);

    // 2) short -> long-lived user token (~60 days)
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

    // Decide where to send them next based on state.provider
    const provider = decodeStateProvider(state) || "facebook";

    let nextPath = "/oauth/facebook/pick-page";
    if (provider === "instagram") nextPath = "/oauth/instagram/pick-account";
    if (provider === "threads") nextPath = "/oauth/threads/finish";

    const nextUrl = new URL(`${baseUrl(req)}${nextPath}`);
    nextUrl.searchParams.set("token", userToken);
    if (state) nextUrl.searchParams.set("state", state);

    return NextResponse.redirect(nextUrl.toString(), { status: 302 });
  } catch (e: any) {
    const msg = e?.message || "Callback crashed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
