// app/api/social/connect/start/route.ts
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

export const runtime = "nodejs";

type ProviderId = "facebook" | "instagram" | "linkedin" | "threads";

function safeBaseUrl(appUrl: string) {
  return (appUrl || "").replace(/\/$/, "");
}

function encodeState(obj: any) {
  return Buffer.from(JSON.stringify(obj)).toString("base64url");
}

async function getOrganisationId(): Promise<string | null> {
  const forced = (process.env.NEXT_PUBLIC_SINGLE_ORG_ID || "").trim();
  if (forced) return forced;

  const { data, error } = await supabaseAdmin
    .from("organisations")
    .select("id")
    .order("created_at", { ascending: true })
    .limit(1);

  if (error || !data || data.length === 0) return null;
  return String((data as any)[0].id);
}

export async function GET(req: NextRequest) {
  const provider = (req.nextUrl.searchParams.get("provider") || "facebook") as ProviderId;

  // ----------------------------
  // Threads (Threads OAuth)
  // ----------------------------
  if (provider === "threads") {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
    const clientId = process.env.THREADS_CLIENT_ID || "";

    if (!appUrl || !clientId) {
      return NextResponse.json(
        {
          error: "Missing THREADS_CLIENT_ID or NEXT_PUBLIC_APP_URL",
          missing: { THREADS_CLIENT_ID: !clientId, NEXT_PUBLIC_APP_URL: !appUrl },
        },
        { status: 500 }
      );
    }

    const redirectUri = `${safeBaseUrl(appUrl)}/api/oauth/threads/callback`;

    const stateObj = { provider: "threads", nonce: crypto.randomUUID(), t: Date.now() };
    const state = encodeState(stateObj);

    const scope = ["threads_basic", "threads_content_publish"].join(",");

    const authUrl =
      "https://threads.net/oauth/authorize" +
      `?client_id=${encodeURIComponent(clientId)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&response_type=code` +
      `&scope=${encodeURIComponent(scope)}` +
      `&state=${encodeURIComponent(state)}` +
      `&__coig_login=1`;

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

  // ----------------------------
  // LinkedIn (separate OAuth)
  // ----------------------------
  if (provider === "linkedin") {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
    const clientId = process.env.LINKEDIN_CLIENT_ID || "";

    if (!appUrl || !clientId) {
      return NextResponse.json(
        {
          error: "Missing LINKEDIN_CLIENT_ID or NEXT_PUBLIC_APP_URL",
          missing: { LINKEDIN_CLIENT_ID: !clientId, NEXT_PUBLIC_APP_URL: !appUrl },
        },
        { status: 500 }
      );
    }

    const redirectUri = `${safeBaseUrl(appUrl)}/api/oauth/linkedin/callback`;

    const stateObj = { provider: "linkedin", nonce: crypto.randomUUID(), t: Date.now() };
    const state = encodeState(stateObj);

    const scope = ["openid", "profile", "email", "w_member_social"].join(" ");

    const authUrl =
      "https://www.linkedin.com/oauth/v2/authorization" +
      `?response_type=code` +
      `&client_id=${encodeURIComponent(clientId)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&state=${encodeURIComponent(state)}` +
      `&scope=${encodeURIComponent(scope)}` +
      `&prompt=consent`;

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

  // ----------------------------
  // Meta (Facebook/Instagram)
  // ----------------------------
  if (provider !== "facebook" && provider !== "instagram") {
    return NextResponse.json({ error: `Unsupported provider: ${provider}` }, { status: 400 });
  }

  const appId = (process.env.META_APP_ID || process.env.FACEBOOK_APP_ID || "").trim();
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "").trim();

  if (!appId || !appUrl) {
    return NextResponse.json(
      {
        error: "Missing META_APP_ID/FACEBOOK_APP_ID or NEXT_PUBLIC_APP_URL",
        missing: { APP_ID: !appId, NEXT_PUBLIC_APP_URL: !appUrl },
      },
      { status: 500 }
    );
  }

  const organisationId = await getOrganisationId();
  if (!organisationId) {
    return NextResponse.json({ error: "No organisation found (needed for OAuth state)." }, { status: 400 });
  }

  const redirectUri = `${safeBaseUrl(appUrl)}/api/oauth/facebook/callback`;

  // ✅ include organisationId in state so callback can save tokens
  const stateObj = {
    provider,
    organisationId,
    nonce: crypto.randomUUID(),
    t: Date.now(),
  };
  const state = encodeState(stateObj);

  const baseScopes = [
    "public_profile",
    "pages_show_list",
    "pages_read_engagement",
    "pages_manage_posts",
    "pages_read_user_content",
    "pages_manage_engagement",
    "business_management",
  ];

  const instagramScopes = [...baseScopes, "instagram_basic", "instagram_content_publish"];
  const scopes = provider === "instagram" ? instagramScopes : baseScopes;

  const authUrl =
    "https://www.facebook.com/v24.0/dialog/oauth" +
    `?client_id=${encodeURIComponent(appId)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&state=${encodeURIComponent(state)}` +
    `&response_type=code` +
    `&auth_type=rerequest` +
    `&return_scopes=true` +
    `&scope=${encodeURIComponent(scopes.join(","))}`;

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
