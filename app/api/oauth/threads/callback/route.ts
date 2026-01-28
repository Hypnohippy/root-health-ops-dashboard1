// app/api/oauth/threads/callback/route.ts
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
const THREADS_CLIENT_ID = process.env.THREADS_CLIENT_ID || "";
const THREADS_CLIENT_SECRET = process.env.THREADS_CLIENT_SECRET || "";

function baseUrl(req: NextRequest) {
  return APP_URL || req.nextUrl.origin;
}

async function fetchJson(url: string, init?: RequestInit) {
  const res = await fetch(url, { cache: "no-store", ...(init || {}) });
  const json: any = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, json };
}

export async function GET(req: NextRequest) {
  const back = new URL(`${baseUrl(req)}/dashboard/connect`);

  try {
    if (!THREADS_CLIENT_ID || !THREADS_CLIENT_SECRET) {
      back.searchParams.set("provider", "threads");
      back.searchParams.set("error", "threads_missing_client_credentials");
      return NextResponse.redirect(back.toString(), { status: 302 });
    }

    // Some providers also send ?error=...
    const error = req.nextUrl.searchParams.get("error") || "";
    const errorDescription = req.nextUrl.searchParams.get("error_description") || "";
    if (error) {
      back.searchParams.set("provider", "threads");
      back.searchParams.set("error", error);
      if (errorDescription) back.searchParams.set("error_description", errorDescription);
      return NextResponse.redirect(back.toString(), { status: 302 });
    }

    const code = req.nextUrl.searchParams.get("code") || "";
    const state = req.nextUrl.searchParams.get("state") || "";

    if (!code) {
      back.searchParams.set("provider", "threads");
      back.searchParams.set("error", "threads_missing_code");
      return NextResponse.redirect(back.toString(), { status: 302 });
    }

    // Optional CSRF check if you set a cookie in start route
    const cookieState = req.cookies.get("oauth_state_threads")?.value || "";
    if (cookieState && state && cookieState !== state) {
      back.searchParams.set("provider", "threads");
      back.searchParams.set("error", "state_mismatch");
      return NextResponse.redirect(back.toString(), { status: 302 });
    }

    const redirectUri = `${baseUrl(req)}/api/oauth/threads/callback`;

    // 1) code -> short-lived token
    const tokenUrl = "https://graph.threads.net/oauth/access_token";
    const tokenRes = await fetchJson(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: THREADS_CLIENT_ID,
        client_secret: THREADS_CLIENT_SECRET,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
        code,
      }),
    });

    if (!tokenRes.ok || !tokenRes.json?.access_token) {
      console.error("[threads/callback] token exchange failed", tokenRes.json);
      back.searchParams.set("provider", "threads");
      back.searchParams.set("error", "threads_token_exchange_failed");
      return NextResponse.redirect(back.toString(), { status: 302 });
    }

    const shortToken = String(tokenRes.json.access_token);

    // 2) short -> long-lived token (best effort; don’t fail the whole connect if it doesn’t work)
    let accessToken = shortToken;

    try {
      const exchangeUrl =
        "https://graph.threads.net/access_token?" +
        new URLSearchParams({
          grant_type: "th_exchange_token",
          client_secret: THREADS_CLIENT_SECRET,
          access_token: shortToken,
        }).toString();

      const longRes = await fetchJson(exchangeUrl);
      if (longRes.ok && longRes.json?.access_token) {
        accessToken = String(longRes.json.access_token);
      }
    } catch (e) {
      console.warn("[threads/callback] long-lived exchange skipped", e);
    }

    // ✅ Redirect to finish page which SAVES into the same org the dashboard uses
    const finish = new URL(`${baseUrl(req)}/oauth/threads/finish`);
    finish.searchParams.set("token", accessToken);
    if (state) finish.searchParams.set("state", state);

    return NextResponse.redirect(finish.toString(), { status: 302 });
  } catch (e: any) {
    console.error("[threads/callback] crashed", e);
    back.searchParams.set("provider", "threads");
    back.searchParams.set("error", "threads_callback_crashed");
    return NextResponse.redirect(back.toString(), { status: 302 });
  }
}
