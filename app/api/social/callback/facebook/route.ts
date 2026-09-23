import { requireOrganisation } from "@/lib/tenantAuth";
import { consumeOAuthState } from "@/lib/oauthState";
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

function getMetaAppId() {
  return (
    process.env.FACEBOOK_APP_ID ||
    process.env.META_APP_ID ||
    process.env.SOCIAL_API_CLIENT_ID ||
    ""
  ).trim();
}

function getMetaAppSecret() {
  return (
    process.env.FACEBOOK_APP_SECRET ||
    process.env.META_APP_SECRET ||
    process.env.SOCIAL_API_CLIENT_SECRET ||
    ""
  ).trim();
}

function redirectToConnect(origin: string, params: Record<string, string>) {
  const url = new URL(`${origin}/dashboard/connect`);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  return NextResponse.redirect(url.toString());
}

export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;
  const code = String(req.nextUrl.searchParams.get("code") || "").trim();

  if (!code) {
    return redirectToConnect(origin, { error: "facebook_missing_code" });
  }

  const appId = getMetaAppId();
  const appSecret = getMetaAppSecret();

  if (!appId || !appSecret) {
    return redirectToConnect(origin, { error: "facebook_missing_env" });
  }

  let organisationId: string;
  try {
    ({ organisationId } = await consumeOAuthState("facebook", req.nextUrl.searchParams.get("state")));
  } catch {
    return redirectToConnect(origin, { error: "invalid_oauth_state_or_membership" });
  }

  const redirectUri = `${origin}/api/social/callback/facebook`;

  // 1) Exchange code for user token
  const shortTokenUrl = new URL("https://graph.facebook.com/v24.0/oauth/access_token");
  shortTokenUrl.searchParams.set("client_id", appId);
  shortTokenUrl.searchParams.set("client_secret", appSecret);
  shortTokenUrl.searchParams.set("redirect_uri", redirectUri);
  shortTokenUrl.searchParams.set("code", code);

  const shortRes = await fetch(shortTokenUrl.toString(), {
    method: "GET",
    cache: "no-store",
  });

  const shortJson: any = await shortRes.json().catch(() => null);

  if (!shortRes.ok || !shortJson?.access_token) {
    return redirectToConnect(origin, { error: "facebook_token_exchange_failed" });
  }

  let userAccessToken = String(shortJson.access_token || "").trim();

  // 2) Try to exchange for long-lived user token
  try {
    const longUrl = new URL("https://graph.facebook.com/v24.0/oauth/access_token");
    longUrl.searchParams.set("grant_type", "fb_exchange_token");
    longUrl.searchParams.set("client_id", appId);
    longUrl.searchParams.set("client_secret", appSecret);
    longUrl.searchParams.set("fb_exchange_token", userAccessToken);

    const longRes = await fetch(longUrl.toString(), {
      method: "GET",
      cache: "no-store",
    });

    const longJson: any = await longRes.json().catch(() => null);

    if (longRes.ok && longJson?.access_token) {
      userAccessToken = String(longJson.access_token || "").trim();
    }
  } catch {}

  // 3) Load pages the user manages
  const pagesUrl = new URL("https://graph.facebook.com/v24.0/me/accounts");
  pagesUrl.searchParams.set(
    "fields",
    "id,name,access_token,instagram_business_account{id,username}"
  );
  pagesUrl.searchParams.set("access_token", userAccessToken);

  const pagesRes = await fetch(pagesUrl.toString(), {
    method: "GET",
    cache: "no-store",
  });

  const pagesJson: any = await pagesRes.json().catch(() => null);
  const pages = Array.isArray(pagesJson?.data) ? pagesJson.data : [];

  if (!pagesRes.ok || pages.length === 0) {
    return redirectToConnect(origin, { error: "facebook_no_pages_found" });
  }

  // 4) Preserve existing page if it already exists for this org, otherwise take the first page
  const { data: existingFacebook } = await supabaseAdmin
    .from("social_accounts")
    .select("page_id")
    .eq("organisation_id", organisationId)
    .eq("platform", "facebook")
    .limit(1)
    .maybeSingle();

  let selectedPage =
    pages.find((p: any) => String(p?.id || "") === String(existingFacebook?.page_id || "")) ||
    pages[0];

  const fbPageId = String(selectedPage?.id || "").trim();
  const fbPageName = String(selectedPage?.name || "").trim();
  const fbPageToken = String(selectedPage?.access_token || "").trim();

  if (!fbPageId || !fbPageToken) {
    return redirectToConnect(origin, { error: "facebook_missing_page_token" });
  }

  const now = new Date().toISOString();

  // 5) Save FACEBOOK row
  await requireOrganisation(organisationId);
  const { error: fbSaveError } = await supabaseAdmin
    .from("social_accounts")
    .upsert(
      {
        organisation_id: organisationId,
        platform: "facebook",
        page_id: fbPageId,
        page_name: fbPageName || "Facebook Page",
        page_access_token: fbPageToken,
        is_active: true,
        updated_at: now,
      },
      { onConflict: "organisation_id,platform" }
    );

  if (fbSaveError) {
    return redirectToConnect(origin, { error: "facebook_save_failed" });
  }

  // 6) Save INSTAGRAM row too if linked business account exists
  const igId = String(selectedPage?.instagram_business_account?.id || "").trim();
  const igUsername = String(
    selectedPage?.instagram_business_account?.username || ""
  ).trim();

  if (igId) {
    await supabaseAdmin
      .from("social_accounts")
      .upsert(
        {
          organisation_id: organisationId,
          platform: "instagram",
          page_id: igId,
          page_name: igUsername || "Instagram",
          page_access_token: fbPageToken,
          is_active: true,
          updated_at: now,
        },
        { onConflict: "organisation_id,platform" }
      );
  }

  return redirectToConnect(origin, {
    connected: "facebook",
    instagram: igId ? "connected" : "not_linked",
  });
}
