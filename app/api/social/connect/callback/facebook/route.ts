import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../../lib/supabaseAdmin";

export async function GET(req: NextRequest) {
  try {
    const appId = process.env.FACEBOOK_APP_ID;
    const appSecret = process.env.FACEBOOK_APP_SECRET;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL;

    if (!appId || !appSecret || !appUrl) {
      return NextResponse.json(
        {
          error: "Missing FACEBOOK_APP_ID or FACEBOOK_APP_SECRET or NEXT_PUBLIC_APP_URL",
          missing: {
            FACEBOOK_APP_ID: !appId,
            FACEBOOK_APP_SECRET: !appSecret,
            NEXT_PUBLIC_APP_URL: !appUrl,
          },
        },
        { status: 500 }
      );
    }

    const code = req.nextUrl.searchParams.get("code");
    const errorParam = req.nextUrl.searchParams.get("error");
    const errorDesc = req.nextUrl.searchParams.get("error_description");
    const state = req.nextUrl.searchParams.get("state") || "";

    if (errorParam) {
      // Return user to Connect page with a clear message
      const url = new URL(`${appUrl}/connect`);
      url.searchParams.set("provider", "facebook");
      url.searchParams.set("success", "false");
      url.searchParams.set("error", errorDesc || errorParam);
      return NextResponse.redirect(url.toString(), { status: 302 });
    }

    if (!code) {
      return NextResponse.json({ error: "Missing code" }, { status: 400 });
    }

    // Check CSRF state cookie
    const cookieState = req.cookies.get("fb_oauth_state")?.value || "";
    if (!cookieState || cookieState !== state) {
      return NextResponse.json({ error: "Invalid state" }, { status: 400 });
    }

    const redirectUri = `${appUrl}/api/social/connect/callback/facebook`;

    // Exchange code for user access token
    const tokenUrl =
      "https://graph.facebook.com/v24.0/oauth/access_token" +
      `?client_id=${encodeURIComponent(appId)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&client_secret=${encodeURIComponent(appSecret)}` +
      `&code=${encodeURIComponent(code)}`;

    const tokenRes = await fetch(tokenUrl, { method: "GET" });
    const tokenJson: any = await tokenRes.json().catch(() => null);

    if (!tokenRes.ok || !tokenJson?.access_token) {
      return NextResponse.json(
        { error: "Token exchange failed", details: tokenJson },
        { status: 400 }
      );
    }

    const userAccessToken = tokenJson.access_token as string;

    // Fetch pages the user manages
    const pagesRes = await fetch(
      `https://graph.facebook.com/v24.0/me/accounts?access_token=${encodeURIComponent(
        userAccessToken
      )}`,
      { method: "GET" }
    );
    const pagesJson: any = await pagesRes.json().catch(() => null);

    if (!pagesRes.ok || !Array.isArray(pagesJson?.data) || pagesJson.data.length === 0) {
      return NextResponse.json(
        { error: "No pages returned from Facebook", details: pagesJson },
        { status: 400 }
      );
    }

    // Pick the first Page for now (we can add a chooser later)
    const page = pagesJson.data[0];
    const pageId = String(page.id || "");
    const pageName = String(page.name || "Facebook Page");
    const pageAccessToken = String(page.access_token || "");

    if (!pageId || !pageAccessToken) {
      return NextResponse.json(
        { error: "Missing page token", details: page },
        { status: 400 }
      );
    }

    // ✅ Save to your social_accounts table
    // NOTE: for now we use your existing single-org approach.
    // Later we’ll swap to real org by logged-in user/org membership.
    const ORG_ID = "23a054db-7040-40b1-b193-2f43cfa139de";

    await supabaseAdmin.from("social_accounts").upsert(
      {
        organisation_id: ORG_ID,
        platform: "facebook",
        page_id: pageId,
        page_name: pageName,
        connection_type: "oauth",
        is_active: true,
        // If you have a column for tokens, store it there.
        // If not, leave it out and we’ll add securely later.
      },
      { onConflict: "organisation_id,platform" as any }
    );

    // Return to Connect page with success
    const url = new URL(`${appUrl}/connect`);
    url.searchParams.set("provider", "facebook");
    url.searchParams.set("success", "true");
    url.searchParams.set("pageName", pageName);

    const res = NextResponse.redirect(url.toString(), { status: 302 });

    // Clear state cookie
    res.cookies.set("fb_oauth_state", "", {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });

    return res;
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Facebook callback crashed" },
      { status: 500 }
    );
  }
}
