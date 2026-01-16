// app/api/oauth/facebook/callback/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const FB_API = "https://graph.facebook.com/v19.0";

function decodeState(stateRaw: string | null): any | null {
  if (!stateRaw) return null;

  // state often arrives as base64url (like "eyJ..."), but sometimes plain JSON.
  // We'll try both safely.
  try {
    if (stateRaw.trim().startsWith("{")) return JSON.parse(stateRaw);

    const b64 = stateRaw.replace(/-/g, "+").replace(/_/g, "/");
    const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
    const json = Buffer.from(b64 + pad, "base64").toString("utf8");
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    const code = searchParams.get("code");
    const error = searchParams.get("error");
    const errorDesc = searchParams.get("error_description");
    const stateRaw = searchParams.get("state");

    if (error) {
      return NextResponse.json(
        { error, details: errorDesc || null },
        { status: 400 }
      );
    }

    if (!code) {
      return NextResponse.json({ error: "Missing code" }, { status: 400 });
    }

    const state = decodeState(stateRaw);
    const organisationId =
      typeof state?.organisationId === "string" ? state.organisationId : null;

    if (!organisationId) {
      return NextResponse.json(
        {
          error:
            "Missing organisationId in state. The start route must include it.",
          state: stateRaw,
        },
        { status: 400 }
      );
    }

    const appId = process.env.FACEBOOK_APP_ID;
    const appSecret = process.env.FACEBOOK_APP_SECRET;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL;

    if (!appId || !appSecret || !appUrl) {
      return NextResponse.json(
        { error: "Missing FACEBOOK_APP_ID / FACEBOOK_APP_SECRET / NEXT_PUBLIC_APP_URL" },
        { status: 500 }
      );
    }

    const redirectUri = `${appUrl}/api/oauth/facebook/callback`;

    // 1) Exchange code -> user access token
    const tokenRes = await fetch(
      `${FB_API}/oauth/access_token` +
        `?client_id=${appId}` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}` +
        `&client_secret=${appSecret}` +
        `&code=${encodeURIComponent(code)}`
    );

    const tokenData = await tokenRes.json();

    if (!tokenRes.ok || !tokenData?.access_token) {
      return NextResponse.json(
        { error: "Failed to exchange code for token", details: tokenData },
        { status: 400 }
      );
    }

    const userToken = tokenData.access_token as string;

    // 2) Fetch Pages
    const pagesRes = await fetch(
      `${FB_API}/me/accounts?fields=id,name,access_token&access_token=${encodeURIComponent(
        userToken
      )}`
    );

    const pagesData = await pagesRes.json();

    if (!pagesRes.ok) {
      return NextResponse.json(
        { error: "Facebook /me/accounts failed", details: pagesData },
        { status: 400 }
      );
    }

    if (!Array.isArray(pagesData?.data) || pagesData.data.length === 0) {
      return NextResponse.json(
        {
          error:
            "Could not load Facebook Pages. Usually: wrong token exchange, missing scopes, or user not granted Page access.",
          details: pagesData,
        },
        { status: 400 }
      );
    }

    // 3) Save the FIRST page for now (simple v1).
    // Later we’ll let the user pick from a list.
    const first = pagesData.data[0];

    const upsertPayload: any = {
      organisation_id: organisationId,
      platform: "facebook",
      page_id: String(first.id),
      page_name: String(first.name || "Facebook Page"),
      connection_type: "oauth",
      is_active: true,
    };

    const { error: upsertErr } = await supabaseAdmin
      .from("social_accounts")
      .upsert(upsertPayload, { onConflict: "organisation_id,platform" });

    if (upsertErr) {
      return NextResponse.json(
        { error: "Failed saving social account to DB", details: upsertErr },
        { status: 500 }
      );
    }

    // 4) Redirect back to Connect page with success flag
    return NextResponse.redirect(
      `${appUrl}/dashboard/connect?provider=facebook&success=1`,
      302
    );
  } catch (err: any) {
    console.error("[facebook oauth callback]", err);
    return NextResponse.json(
      { error: "OAuth callback crashed", message: err?.message || "Unknown" },
      { status: 500 }
    );
  }
}
