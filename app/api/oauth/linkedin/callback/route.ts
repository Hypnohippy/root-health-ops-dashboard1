// app/api/oauth/linkedin/callback/route.ts
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
const LINKEDIN_CLIENT_ID = process.env.LINKEDIN_CLIENT_ID || "";
const LINKEDIN_CLIENT_SECRET = process.env.LINKEDIN_CLIENT_SECRET || "";

function baseUrl(req: NextRequest) {
  return APP_URL || req.nextUrl.origin;
}

function encodeStatePassthrough(state: string) {
  return state ? `&state=${encodeURIComponent(state)}` : "";
}

export async function GET(req: NextRequest) {
  const back = new URL(`${baseUrl(req)}/dashboard/connect`);

  try {
    // LinkedIn may return ?error=... instead of ?code=...
    const error = req.nextUrl.searchParams.get("error") || "";
    const errorDescription = req.nextUrl.searchParams.get("error_description") || "";
    if (error) {
      back.searchParams.set("provider", "linkedin");
      back.searchParams.set("error", error);
      if (errorDescription) back.searchParams.set("error_description", errorDescription);
      return NextResponse.redirect(back.toString(), { status: 302 });
    }

    const code = req.nextUrl.searchParams.get("code") || "";
    const state = req.nextUrl.searchParams.get("state") || "";

    if (!code) {
      back.searchParams.set("provider", "linkedin");
      back.searchParams.set("error", "missing_code");
      return NextResponse.redirect(back.toString(), { status: 302 });
    }

    // Optional CSRF check
    const cookieState = req.cookies.get("oauth_state_linkedin")?.value || "";
    if (cookieState && state && cookieState !== state) {
      back.searchParams.set("provider", "linkedin");
      back.searchParams.set("error", "state_mismatch");
      return NextResponse.redirect(back.toString(), { status: 302 });
    }

    if (!LINKEDIN_CLIENT_ID || !LINKEDIN_CLIENT_SECRET) {
      back.searchParams.set("provider", "linkedin");
      back.searchParams.set("error", "missing_linkedin_env");
      return NextResponse.redirect(back.toString(), { status: 302 });
    }

    const redirectUri = `${baseUrl(req)}/api/oauth/linkedin/callback`;

    // Exchange code -> access token
    const tokenRes = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        client_id: LINKEDIN_CLIENT_ID,
        client_secret: LINKEDIN_CLIENT_SECRET,
      }),
      cache: "no-store",
    });

    const tokenJson: any = await tokenRes.json().catch(() => null);

    if (!tokenRes.ok || !tokenJson?.access_token) {
      console.error("[linkedin-callback] token exchange failed", tokenJson);
      back.searchParams.set("provider", "linkedin");
      back.searchParams.set("error", "token_exchange_failed");
      return NextResponse.redirect(back.toString(), { status: 302 });
    }

    const accessToken = String(tokenJson.access_token);

    // ✅ Redirect to finish page which SAVES into the same org the dashboard uses
    const finish = new URL(`${baseUrl(req)}/oauth/linkedin/finish`);
    finish.searchParams.set("token", accessToken);
    if (state) finish.searchParams.set("state", state);

    return NextResponse.redirect(finish.toString(), { status: 302 });
  } catch (e: any) {
    console.error("[linkedin-callback] crashed", e);
    back.searchParams.set("provider", "linkedin");
    back.searchParams.set("error", "callback_crashed");
    return NextResponse.redirect(back.toString(), { status: 302 });
  }
}
