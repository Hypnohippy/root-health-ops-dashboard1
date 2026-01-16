// app/api/oauth/facebook/callback/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const FB_API = "https://graph.facebook.com/v19.0";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const code = searchParams.get("code");
    const error = searchParams.get("error");

    if (error) {
      return NextResponse.json({ error }, { status: 400 });
    }

    if (!code) {
      return NextResponse.json({ error: "Missing code" }, { status: 400 });
    }

    const appId = process.env.FACEBOOK_APP_ID;
    const appSecret = process.env.FACEBOOK_APP_SECRET;
    const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/oauth/facebook/callback`;

    if (!appId || !appSecret || !redirectUri) {
      return NextResponse.json(
        { error: "Missing Facebook env vars" },
        { status: 500 }
      );
    }

    // 1️⃣ Exchange code → short-lived user token
    const tokenRes = await fetch(
      `${FB_API}/oauth/access_token` +
        `?client_id=${appId}` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}` +
        `&client_secret=${appSecret}` +
        `&code=${code}`
    );

    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) {
      return NextResponse.json(
        { error: "Failed to get user token", details: tokenData },
        { status: 400 }
      );
    }

    const userToken = tokenData.access_token;

    // 2️⃣ Fetch Pages the user manages
    const pagesRes = await fetch(
      `${FB_API}/me/accounts?fields=id,name,access_token&access_token=${userToken}`
    );

    const pagesData = await pagesRes.json();

    if (!Array.isArray(pagesData.data) || pagesData.data.length === 0) {
      return NextResponse.json(
        {
          error:
            "Could not load Facebook Pages. Is the user an admin of a Page?",
          details: pagesData,
        },
        { status: 400 }
      );
    }

    // 3️⃣ Save each Page
    for (const page of pagesData.data) {
      await supabaseAdmin.from("social_accounts").upsert({
        platform: "facebook",
        page_id: page.id,
        page_name: page.name,
        connection_type: "oauth",
        is_active: true,
      });
    }

    // 4️⃣ Redirect back to Connect UI
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/connect?success=facebook`,
      302
    );
  } catch (err: any) {
    console.error("[facebook oauth callback]", err);
    return NextResponse.json(
      { error: "OAuth callback failed", message: err.message },
      { status: 500 }
    );
  }
}
