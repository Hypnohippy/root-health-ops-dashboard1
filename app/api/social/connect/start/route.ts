// app/api/social/connect/start/route.ts
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

type ProviderId = "facebook" | "instagram" | "linkedin" | "threads";

function safeBaseUrl(appUrl: string) {
  return (appUrl || "").replace(/\/$/, "");
}

function encodeState(obj: any) {
  return Buffer.from(JSON.stringify(obj)).toString("base64url");
}

export async function GET(req: NextRequest) {
  const provider = (req.nextUrl.searchParams.get("provider") ||
    "facebook") as ProviderId;

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
          missing: {
            LINKEDIN_CLIENT_ID: !clientId,
            NEXT_PUBLIC_APP_URL: !appUrl,
          },
        },
        { status: 500 }
      );
    }

    const redirectUri = `${safeBaseUrl(appUrl)}/api/oauth/linkedin/callback`;

    const stateObj = {
      provider: "linkedin",
      nonce: crypto.randomUUID(),
      t: Date.now(),
    };
    const state = encodeState(stateObj);

    // Minimal posting scopes (you already proved posting works)
    // If your LinkedIn app uses OIDC scopes instead, keep them aligned in the callback code.
    const scope = ["r_liteprofile", "w_member_social"].join(" ");

    const authUrl =
      "https://www.linkedin.com/oauth/v2/authorization" +
      `?response_type=code` +
      `&client_id=${encodeURIComponent(clientId)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&state=${encodeURIComponent(state)}` +
      `&scope=${encodeURIComponent(scope)}`;

    const res = NextResponse.redirect(authUrl, { status: 302 });

    res.cookies.set("oauth_state_linkedin", state, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 10 * 60, // 10 mins
    });

    return res;
  }

  // ----------------------------
  // Meta (Facebook / Instagram / Threads)
  // ----------------------------
  if (provider !== "facebook" && provider !== "instagram" && provider !== "threads") {
    return NextResponse.json(
      { error: `Unsupported provider: ${provider}` },
      { status: 400 }
    );
  }

  const appId = process.env.FACEBOOK_APP_ID || "";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";

  if (!appId || !appUrl) {
    return NextResponse.json(
      {
        error: "Missing FACEBOOK_APP_ID or NEXT_PUBLIC_APP_URL",
        missing: {
          FACEBOOK_APP_ID: !appId,
          NEXT_PUBLIC_APP_URL: !appUrl,
        },
      },
      { status: 500 }
    );
  }

  // ✅ Canonical Meta callback (single place)
  // Must be listed in Meta → Facebook Login → Valid OAuth Redirect URIs
  const redirectUri = `${safeBaseUrl(appUrl)}/api/oauth/facebook/callback`;

  const stateObj = {
    provider,
    nonce: crypto.randomUUID(),
    t: Date.now(),
  };
  const state = encodeState(stateObj);

  // Base scopes that made Pages show reliably for you
  const baseScopes = [
    "public_profile",
    "pages_show_list",
    "pages_read_engagement",
    "pages_manage_posts",
    "business_management",
  ];

  // Instagram: same Meta login, then you detect IG business account linked to a Page
  const instagramScopes = [
    ...baseScopes,
    "instagram_basic",
    "instagram_content_publish",
  ];

  // Threads: Threads API scopes (Meta)
  // These are the minimum “publish” pair used in current Threads API setups. :contentReference[oaicite:1]{index=1}
  const threadsScopes = [
    "threads_basic",
    "threads_content_publish",
  ];

  const scopes =
    provider === "instagram"
      ? instagramScopes
      : provider === "threads"
        ? threadsScopes
        : baseScopes;

  const authUrl =
    "https://www.facebook.com/v24.0/dialog/oauth" +
    `?client_id=${encodeURIComponent(appId)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&state=${encodeURIComponent(state)}` +
    `&response_type=code` +
    // Forces Meta to re-offer missing scopes when it “remembers” prior approvals
    `&auth_type=rerequest` +
    `&return_scopes=true` +
    `&scope=${encodeURIComponent(scopes.join(","))}`;

  const res = NextResponse.redirect(authUrl, { status: 302 });

  // CSRF + sanity
  res.cookies.set("fb_oauth_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 10 * 60, // 10 mins
  });

  return res;
}
