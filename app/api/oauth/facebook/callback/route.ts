// app/api/oauth/facebook/callback/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../../lib/supabaseAdmin";

export const runtime = "nodejs";

function norm(s: any) {
  return String(s || "").trim();
}

function decodeStateMaybe(state: string): any | null {
  const s = norm(state);
  if (!s) return null;

  // If raw JSON
  if (s.startsWith("{")) {
    try {
      return JSON.parse(s);
    } catch {
      return null;
    }
  }

  // If base64url JSON
  try {
    const json = Buffer.from(s, "base64url").toString("utf8");
    if (!json.startsWith("{")) return null;
    return JSON.parse(json);
  } catch {
    return null;
  }
}

async function upsertSocialAccount(args: {
  organisationId: string;
  platform: string;
  page_id: string | null;
  page_name: string | null;
  page_access_token: string | null;
  token_expires_at: string | null;
}) {
  const now = new Date().toISOString();

  const row: any = {
    organisation_id: args.organisationId,
    platform: args.platform,
    page_id: args.page_id,
    page_name: args.page_name,
    page_access_token: args.page_access_token,
    token_expires_at: args.token_expires_at,
    is_active: true,
    updated_at: now,
  };

  const up = await supabaseAdmin
    .from("social_accounts")
    .upsert(row, { onConflict: "organisation_id,platform" })
    .select()
    .maybeSingle();

  if (up.error) throw new Error(up.error.message);
  return up.data ?? null;
}

async function graphGet(url: string) {
  const res = await fetch(url, { cache: "no-store" });
  const json: any = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, json };
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const code = norm(url.searchParams.get("code"));
    const errorParam = norm(url.searchParams.get("error"));
    const errorDesc = norm(url.searchParams.get("error_description"));

    if (errorParam) {
      return NextResponse.redirect(
        new URL(`/dashboard/connect?error=${encodeURIComponent(errorDesc || errorParam)}`, req.url)
      );
    }

    if (!code) {
      return NextResponse.redirect(new URL(`/dashboard/connect?error=Missing+code`, req.url));
    }

    const stateRaw = norm(url.searchParams.get("state"));
    const parsed = decodeStateMaybe(stateRaw);

    // ✅ support: state could be just an org id string (older flows), or JSON/base64 JSON
    const organisationId =
      norm(parsed?.organisationId || parsed?.organisation_id || parsed?.orgId) || (stateRaw && !parsed ? stateRaw : "");

    if (!organisationId) {
      return NextResponse.redirect(new URL(`/dashboard/connect?error=Missing+state+organisationId`, req.url));
    }

    const appId = (process.env.META_APP_ID || process.env.FACEBOOK_APP_ID || "").trim();
    const appSecret = (process.env.META_APP_SECRET || process.env.FACEBOOK_APP_SECRET || "").trim();

    // Must match the URI you registered in Meta, but default to the current origin + path
    const redirectUri =
      (process.env.META_FACEBOOK_REDIRECT_URI || "").trim() || `${url.origin}/api/oauth/facebook/callback`;

    if (!appId || !appSecret) {
      return NextResponse.redirect(new URL(`/dashboard/connect?error=Missing+Meta+app+envs`, req.url));
    }

    const API_VER = "v24.0";

    // 1) Exchange code -> USER access token
    const tokenUrl =
      `https://graph.facebook.com/${API_VER}/oauth/access_token` +
      `?client_id=${encodeURIComponent(appId)}` +
      `&client_secret=${encodeURIComponent(appSecret)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&code=${encodeURIComponent(code)}`;

    const tokenRes = await graphGet(tokenUrl);
    if (!tokenRes.ok) {
      const msg = tokenRes.json?.error?.message || "Failed to exchange code for token.";
      return NextResponse.redirect(new URL(`/dashboard/connect?error=${encodeURIComponent(msg)}`, req.url));
    }

    const userAccessToken = norm(tokenRes.json?.access_token);
    if (!userAccessToken) {
      return NextResponse.redirect(new URL(`/dashboard/connect?error=Missing+user+access+token`, req.url));
    }

    // 2) Fetch pages + PAGE access tokens
    const pagesUrl =
      `https://graph.facebook.com/${API_VER}/me/accounts` +
      `?fields=id,name,access_token` +
      `&access_token=${encodeURIComponent(userAccessToken)}`;

    const pagesRes = await graphGet(pagesUrl);
    if (!pagesRes.ok) {
      const msg = pagesRes.json?.error?.message || "Failed to load pages for this user.";
      return NextResponse.redirect(new URL(`/dashboard/connect?error=${encodeURIComponent(msg)}`, req.url));
    }

    const pages: any[] = Array.isArray(pagesRes.json?.data) ? pagesRes.json.data : [];
    if (pages.length === 0) {
      return NextResponse.redirect(
        new URL(`/dashboard/connect?error=No+Facebook+Pages+found+for+this+account`, req.url)
      );
    }

    // 3) Pick first page (safe default)
    const chosen = pages[0];
    const pageId = norm(chosen?.id) || null;
    const pageName = chosen?.name ? String(chosen.name) : null;
    const pageAccessToken = norm(chosen?.access_token) || null;

    if (!pageId || !pageAccessToken) {
      return NextResponse.redirect(new URL(`/dashboard/connect?error=Could+not+select+a+page+token`, req.url));
    }

    // 4) Save PAGE token for Facebook
    await upsertSocialAccount({
      organisationId,
      platform: "facebook",
      page_id: pageId,
      page_name: pageName,
      page_access_token: pageAccessToken,
      token_expires_at: null,
    });

    return NextResponse.redirect(new URL(`/dashboard/connect?success=facebook_connected`, req.url));
  } catch (e: any) {
    return NextResponse.redirect(
      new URL(`/dashboard/connect?error=${encodeURIComponent(e?.message || "Facebook connect failed")}`, req.url)
    );
  }
}
