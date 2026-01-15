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
  const errorReason = url.searchParams.get("error_reason");
  const errorDescription = url.searchParams.get("error_description");

  const appId = process.env.FACEBOOK_APP_ID;
  const appSecret = process.env.FACEBOOK_APP_SECRET;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;

  if (!appId || !appSecret || !appUrl) {
    return NextResponse.json(
      { error: "Missing FACEBOOK_APP_ID / FACEBOOK_APP_SECRET / NEXT_PUBLIC_APP_URL" },
      { status: 500 }
    );
  }

  if (error) {
    return NextResponse.json(
      { error, errorReason, errorDescription },
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

  const redirectUri = `${appUrl.replace(/\/$/, "")}/api/oauth/facebook/callback`;

  // Exchange code → user access token
  const tokenUrl = new URL("https://graph.facebook.com/v19.0/oauth/access_token");
  tokenUrl.searchParams.set("client_id", appId);
  tokenUrl.searchParams.set("client_secret", appSecret);
  tokenUrl.searchParams.set("redirect_uri", redirectUri);
  tokenUrl.searchParams.set("code", code);

  const tokenRes = await fetch(tokenUrl.toString(), { method: "GET" });
  const tokenJson: any = await tokenRes.json().catch(() => null);

  if (!tokenRes.ok || !tokenJson?.access_token) {
    return NextResponse.json(
      { error: "Facebook token exchange failed", details: tokenJson },
      { status: 400 }
    );
  }

  const userAccessToken: string = tokenJson.access_token;

  // Get list of Pages the user manages
  const pagesRes = await fetch(
    `https://graph.facebook.com/v19.0/me/accounts?access_token=${encodeURIComponent(
      userAccessToken
    )}`,
    { method: "GET" }
  );

  const pagesJson: any = await pagesRes.json().catch(() => null);

  if (!pagesRes.ok || !Array.isArray(pagesJson?.data) || pagesJson.data.length === 0) {
    return NextResponse.json(
      { error: "Could not load Facebook Pages. Is the user an admin of a Page?", details: pagesJson },
      { status: 400 }
    );
  }

  // For now: pick the first Page (we can add a chooser UI later)
  const page = pagesJson.data[0];
  const pageId = String(page?.id || "");
  const pageName = String(page?.name || "Facebook Page");
  const pageAccessToken = String(page?.access_token || "");

  if (!pageId || !pageAccessToken) {
    return NextResponse.json(
      { error: "Missing pageId or page access token", details: page },
      { status: 400 }
    );
  }

  // Upsert social_accounts row
  const { data: existing, error: findErr } = await supabaseAdmin
    .from("social_accounts")
    .select("id")
    .eq("organisation_id", decoded.organisationId)
    .eq("platform", "facebook")
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
        platform: "facebook",
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

  // Store PAGE access token for posting
  const { error: tokErr } = await supabaseAdmin
    .from("social_account_tokens")
    .upsert(
      {
        social_account_id: socialAccountId,
        access_token: pageAccessToken,
        refresh_token: null,
        expires_at: null,
        scope: null,
      },
      { onConflict: "social_account_id" }
    );

  if (tokErr) {
    return NextResponse.json({ error: "Failed saving token", details: tokErr }, { status: 500 });
  }

  return NextResponse.redirect(`${appUrl.replace(/\/$/, "")}/dashboard/connect`);
}
