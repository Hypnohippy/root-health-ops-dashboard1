import { NextRequest, NextResponse } from "next/server";

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

    // ✅ If FB returned an error, bounce back to dashboard connect with message
    if (errorParam) {
      const url = new URL(`${appUrl}/dashboard/connect`);
      url.searchParams.set("provider", "facebook");
      url.searchParams.set("success", "false");
      url.searchParams.set("error", errorDesc || errorParam);
      return NextResponse.redirect(url.toString(), { status: 302 });
    }

    if (!code) {
      return NextResponse.json({ error: "Missing code" }, { status: 400 });
    }

    // ✅ CSRF state check
    const cookieState = req.cookies.get("fb_oauth_state")?.value || "";
    if (!cookieState || cookieState !== state) {
      return NextResponse.json({ error: "Invalid state" }, { status: 400 });
    }

    // This MUST match Meta "Valid OAuth Redirect URIs" exactly
    const redirectUri = `${appUrl}/api/social/connect/callback/facebook`;

    // ✅ Exchange code for a user access token
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

    // ✅ Get pages the user manages
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

    // ✅ For now pick first page (later we add a chooser UI)
    const page = pagesJson.data[0];
    const pageId = String(page.id || "");
    const pageName = String(page.name || "Facebook Page");

    if (!pageId) {
      return NextResponse.json({ error: "Missing page id", details: page }, { status: 400 });
    }

    // ✅ Save via your existing API route (avoids importing supabaseAdmin)
    const saveRes = await fetch(`${appUrl}/api/social-accounts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // Your /api/social-accounts route already knows org in your current setup
      body: JSON.stringify({
        platform: "facebook",
        pageId,
        pageName,
      }),
    });

    if (!saveRes.ok) {
      const t = await saveRes.text().catch(() => "");
      return NextResponse.json(
        { error: "Failed to save social account", status: saveRes.status, details: t },
        { status: 500 }
      );
    }

    // ✅ Redirect back to connect page with success
    const url = new URL(`${appUrl}/dashboard/connect`);
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
