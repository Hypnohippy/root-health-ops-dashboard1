import { NextRequest, NextResponse } from "next/server";
import { supabaseService } from "../../../../../lib/supabaseService";

export const runtime = "nodejs";

function unpackState(state: string): { org: string | null } {
  try {
    const json = JSON.parse(Buffer.from(state, "base64url").toString("utf8"));
    return { org: typeof json?.org === "string" ? json.org : null };
  } catch {
    return { org: null };
  }
}

export async function GET(req: NextRequest) {
  try {
    const clientKey = process.env.TIKTOK_CLIENT_KEY;
    const clientSecret = process.env.TIKTOK_CLIENT_SECRET;

    if (!clientKey || !clientSecret) {
      return NextResponse.json(
        { success: false, error: "Missing TIKTOK_CLIENT_KEY / TIKTOK_CLIENT_SECRET in env." },
        { status: 500 }
      );
    }

    const code = req.nextUrl.searchParams.get("code") || "";
    const state = req.nextUrl.searchParams.get("state") || "";

    if (!code) {
      return NextResponse.json(
        { success: false, error: "Missing ?code from TikTok callback." },
        { status: 400 }
      );
    }

    const { org: organisationId } = unpackState(state);
    if (!organisationId) {
      return NextResponse.json(
        { success: false, error: "Missing/invalid state (no organisation id)." },
        { status: 400 }
      );
    }

    const base = (process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin).replace(/\/$/, "");
    const redirectUri = `${base}/api/oauth/tiktok/callback`;

    // 1) Exchange code for access token
    const tokenRes = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_key: clientKey,
        client_secret: clientSecret,
        code,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
      }),
      cache: "no-store",
    });

    const tokenJson: any = await tokenRes.json().catch(() => null);

    if (!tokenRes.ok || !tokenJson?.access_token) {
      return NextResponse.json(
        { success: false, error: "TikTok token exchange failed", details: tokenJson },
        { status: 400 }
      );
    }

    const accessToken = String(tokenJson.access_token);
    const openId = String(tokenJson.open_id || "");

    // 2) Fetch user info
    const infoUrl =
      "https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,avatar_url";

    const infoRes = await fetch(infoUrl, {
      method: "GET",
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });

    const infoJson: any = await infoRes.json().catch(() => null);

    const user = infoJson?.data?.user;
    const displayName = user?.display_name ? String(user.display_name) : null;
    const avatarUrl = user?.avatar_url ? String(user.avatar_url) : null;

    const expiresIn = Number(tokenJson.expires_in ?? 0);
    const tokenExpiresAt =
      expiresIn && expiresIn > 0 ? new Date(Date.now() + expiresIn * 1000).toISOString() : null;

    // 3) Save connection using SERVICE ROLE (bypasses RLS recursion)
    const { error: upsertErr } = await supabaseService
      .from("social_accounts")
      .upsert(
        {
          organisation_id: organisationId,
          platform: "tiktok",
          page_id: openId || null,
          page_name: displayName,
          connection_type: "oauth",
          is_active: true,
          page_access_token: accessToken,
          token_expires_at: tokenExpiresAt,
          avatar_url: avatarUrl,
        },
        { onConflict: "organisation_id,platform" }
      );

    if (upsertErr) {
      return NextResponse.json(
        { success: false, error: `Failed to save TikTok connection: ${upsertErr.message}` },
        { status: 500 }
      );
    }

    // 4) Redirect back to Connect page
    const redirectTo = new URL("/dashboard/connect", base);
    redirectTo.searchParams.set("tiktok", "connected");
    return NextResponse.redirect(redirectTo);
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message || "TikTok callback failed" },
      { status: 500 }
    );
  }
}
