import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

function decodeState(state: string | null): { organisationId: string } | null {
  if (!state) return null;
  try {
    const json = Buffer.from(state, "base64url").toString("utf8");
    const parsed = JSON.parse(json);
    if (typeof parsed?.organisationId !== "string" || !parsed.organisationId) return null;
    return { organisationId: parsed.organisationId };
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url);

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  const errorDescription = url.searchParams.get("error_description");

  const clientId = process.env.LINKEDIN_CLIENT_ID;
  const clientSecret = process.env.LINKEDIN_CLIENT_SECRET;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;

  if (!clientId || !clientSecret || !appUrl) {
    return NextResponse.json(
      { error: "Missing LINKEDIN_CLIENT_ID / LINKEDIN_CLIENT_SECRET / NEXT_PUBLIC_APP_URL" },
      { status: 500 }
    );
  }

  if (error) {
    return NextResponse.json(
      { error, errorDescription },
      { status: 400 }
    );
  }

  if (!code) {
    return NextResponse.json({ error: "Missing code" }, { status: 400 });
  }

  const decoded = decodeState(state);
  if (!decoded) {
    return NextResponse.json({ error: "Invalid state" }, { status: 400 });
  }

  const redirectUri = `${appUrl.replace(/\/$/, "")}/api/oauth/linkedin/callback`;

  // Exchange code → access token
  const tokenRes = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      client_secret: clientSecret,
    }).toString(),
  });

  const tokenJson: any = await tokenRes.json().catch(() => null);

  if (!tokenRes.ok || !tokenJson?.access_token) {
    return NextResponse.json(
      { error: "LinkedIn token exchange failed", details: tokenJson },
      { status: 400 }
    );
  }

  const accessToken: string = tokenJson.access_token;
  const expiresIn: number | null =
    typeof tokenJson.expires_in === "number" ? tokenJson.expires_in : null;

  const expiresAt =
    expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : null;

  // Fetch basic profile for display name (OIDC userinfo)
  let pageName = "LinkedIn Account";
  let pageId = "linkedin_me";

  try {
    const meRes = await fetch("https://api.linkedin.com/v2/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const me: any = await meRes.json().catch(() => null);
    if (meRes.ok && me) {
      pageName = me?.name || me?.given_name || pageName;
      pageId = me?.sub || pageId;
    }
  } catch {
    // ignore
  }

  // Upsert social_accounts row
  const { data: existing, error: findErr } = await supabaseAdmin
    .from("social_accounts")
    .select("id")
    .eq("organisation_id", decoded.organisationId)
    .eq("platform", "linkedin")
    .limit(1);

  if (findErr) {
    return NextResponse.json({ error: "DB lookup failed", details: findErr }, { status: 500 });
  }

  let socialAccountId: string;

  if (existing && existing.length > 0) {
    socialAccountId = existing[0].id;

    const { error: upErr } = await supabaseAdmin
      .from("social_accounts")
      .update({
        page_id: pageId,
        page_name: pageName,
        connection_type: "oauth",
        make_webhook_url: null,
        is_active: true,
      })
      .eq("id", socialAccountId);

    if (upErr) {
      return NextResponse.json({ error: "Failed updating social account", details: upErr }, { status: 500 });
    }
  } else {
    socialAccountId = crypto.randomUUID();

    const { error: insErr } = await supabaseAdmin
      .from("social_accounts")
      .insert({
        id: socialAccountId,
        organisation_id: decoded.organisationId,
        platform: "linkedin",
        page_id: pageId,
        page_name: pageName,
        connection_type: "oauth",
        make_webhook_url: null,
        is_active: true,
      });

    if (insErr) {
      return NextResponse.json({ error: "Failed creating social account", details: insErr }, { status: 500 });
    }
  }

  // Store token in social_account_tokens
  const { error: tokErr } = await supabaseAdmin
    .from("social_account_tokens")
    .upsert(
      {
        social_account_id: socialAccountId,
        access_token: accessToken,
        refresh_token: tokenJson?.refresh_token ?? null,
        expires_at: expiresAt,
        scope: tokenJson?.scope ?? null,
      },
      { onConflict: "social_account_id" }
    );

  if (tokErr) {
    return NextResponse.json({ error: "Failed saving token", details: tokErr }, { status: 500 });
  }

  // Send them back to Connect page
  return NextResponse.redirect(`${appUrl.replace(/\/$/, "")}/dashboard/connect`);
}
