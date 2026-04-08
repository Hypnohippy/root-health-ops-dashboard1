// app/api/oauth/facebook/callback/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { randomUUID } from "crypto";

export const runtime = "nodejs";

function norm(v: any) {
  return String(v ?? "").trim();
}

function baseUrl(req: NextRequest) {
  try {
    return req.nextUrl.origin;
  } catch {
    return "";
  }
}

function decodeStateMaybe(state: string): any | null {
  const s = norm(state);
  if (!s) return null;

  if (s.startsWith("{")) {
    try {
      return JSON.parse(s);
    } catch {
      return null;
    }
  }

  try {
    const json = Buffer.from(s, "base64url").toString("utf8");
    if (!json.startsWith("{")) return null;
    return JSON.parse(json);
  } catch {
    return null;
  }
}

async function fetchJson(url: string, init?: RequestInit) {
  const res = await fetch(url, { cache: "no-store", ...(init || {}) });
  const json: any = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, json };
}

async function upsertSocialAccount(args: {
  organisationId: string;
  platform: "facebook" | "instagram";
  pageId: string;
  pageName?: string | null;
  pageAccessToken: string;
  tokenExpiresAt?: string | null;
  connectionType?: string | null;
}) {
  const organisationId = norm(args.organisationId);
  const pageId = norm(args.pageId);
  const pageAccessToken = norm(args.pageAccessToken);

  if (!organisationId || !pageId || !pageAccessToken) {
    throw new Error("Missing organisationId / pageId / pageAccessToken");
  }

  const { error: deactErr } = await supabaseAdmin
    .from("social_accounts")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("organisation_id", organisationId)
    .eq("platform", args.platform);

  if (deactErr) {
    console.warn(`[facebook/callback] deactivate existing ${args.platform} rows failed`, deactErr);
  }

  const { data: existing, error: existingError } = await supabaseAdmin
    .from("social_accounts")
    .select("id, created_at, updated_at")
    .eq("organisation_id", organisationId)
    .eq("platform", args.platform)
    .order("updated_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingError) {
    console.warn(`[facebook/callback] existing ${args.platform} lookup error`, existingError);
  }

  const payload: any = {
    page_id: pageId,
    page_name: args.pageName ? String(args.pageName) : null,
    connection_type: args.connectionType || "facebook_oauth",
    make_webhook_url: null,
    is_active: true,
    page_access_token: pageAccessToken,
    token_expires_at: args.tokenExpiresAt ?? null,
    updated_at: new Date().toISOString(),
  };

  if (existing?.id) {
    const { error } = await supabaseAdmin
      .from("social_accounts")
      .update(payload)
      .eq("id", existing.id);

    if (error) throw error;
    return;
  }

  const { error: insErr } = await supabaseAdmin.from("social_accounts").insert({
    id: randomUUID(),
    organisation_id: organisationId,
    platform: args.platform,
    created_at: new Date().toISOString(),
    ...payload,
    meta: {},
  });

  if (insErr) throw insErr;
}

export async function GET(req: NextRequest) {
  const back = new URL(`${baseUrl(req)}/dashboard/connect`);

  try {
    const url = new URL(req.url);

    const errorParam = norm(url.searchParams.get("error"));
    const errorDesc = norm(url.searchParams.get("error_description"));
    if (errorParam) {
      back.searchParams.set("error", errorParam);
      if (errorDesc) back.searchParams.set("error_description", errorDesc);
      return NextResponse.redirect(back.toString(), { status: 302 });
    }

    const code = norm(url.searchParams.get("code"));
    if (!code) {
      back.searchParams.set("error", "facebook_missing_code");
      return NextResponse.redirect(back.toString(), { status: 302 });
    }

    const stateRaw = norm(url.searchParams.get("state"));
    const parsed = decodeStateMaybe(stateRaw);

    const provider = norm(parsed?.provider || "facebook");
    back.searchParams.set("provider", provider);

    const organisationId =
      norm(parsed?.organisationId || parsed?.organisation_id || parsed?.orgId);

    if (!organisationId) {
      back.searchParams.set("error", "no_organisation");
      back.searchParams.set(
        "error_description",
        "No organisation found to attach Facebook connection."
      );
      return NextResponse.redirect(back.toString(), { status: 302 });
    }

    const appId = norm(process.env.META_APP_ID || process.env.FACEBOOK_APP_ID || "");
    const appSecret = norm(process.env.META_APP_SECRET || process.env.FACEBOOK_APP_SECRET || "");

    const redirectUri =
      norm(process.env.META_FACEBOOK_REDIRECT_URI || "") ||
      `${url.origin}/api/oauth/facebook/callback`;

    if (!appId || !appSecret) {
      back.searchParams.set("error", "facebook_missing_client_credentials");
      back.searchParams.set(
        "error_description",
        "Missing META_APP_ID/META_APP_SECRET (or FACEBOOK_APP_ID/SECRET)."
      );
      return NextResponse.redirect(back.toString(), { status: 302 });
    }

    const API_VER = "v24.0";

    const tokenUrl =
      `https://graph.facebook.com/${API_VER}/oauth/access_token?` +
      new URLSearchParams({
        client_id: appId,
        client_secret: appSecret,
        redirect_uri: redirectUri,
        code,
      }).toString();

    const tokenRes = await fetchJson(tokenUrl);
    if (!tokenRes.ok || !tokenRes.json?.access_token) {
      console.error("[facebook/callback] token exchange failed", tokenRes.json);
      back.searchParams.set("error", "facebook_token_exchange_failed");
      back.searchParams.set(
        "error_description",
        tokenRes.json?.error?.message ||
          tokenRes.json?.error_description ||
          `Token exchange failed (HTTP ${tokenRes.status}).`
      );
      return NextResponse.redirect(back.toString(), { status: 302 });
    }

    const userAccessToken = norm(tokenRes.json.access_token);

    const pagesUrl =
      `https://graph.facebook.com/${API_VER}/me/accounts?` +
      new URLSearchParams({
        fields: "id,name,access_token,instagram_business_account{id,username}",
        access_token: userAccessToken,
      }).toString();

    const pagesRes = await fetchJson(pagesUrl);
    if (!pagesRes.ok) {
      back.searchParams.set("error", "facebook_pages_failed");
      back.searchParams.set(
        "error_description",
        pagesRes.json?.error?.message ||
          `Failed to load pages (HTTP ${pagesRes.status}).`
      );
      return NextResponse.redirect(back.toString(), { status: 302 });
    }

    const pages: any[] = Array.isArray(pagesRes.json?.data) ? pagesRes.json.data : [];
    if (pages.length === 0) {
      back.searchParams.set("error", "facebook_no_pages");
      back.searchParams.set(
        "error_description",
        "No Facebook Pages found for this account."
      );
      return NextResponse.redirect(back.toString(), { status: 302 });
    }

    const { data: existingFacebook } = await supabaseAdmin
      .from("social_accounts")
      .select("page_id")
      .eq("organisation_id", organisationId)
      .eq("platform", "facebook")
      .limit(1)
      .maybeSingle();

    const chosen =
      pages.find((p: any) => String(p?.id || "") === String(existingFacebook?.page_id || "")) ||
      pages[0];

    const pageId = norm(chosen?.id);
    const pageName = chosen?.name ? String(chosen.name) : null;
    const pageAccessToken = norm(chosen?.access_token);

    if (!pageId || !pageAccessToken) {
      back.searchParams.set("error", "facebook_missing_page_token");
      back.searchParams.set("error_description", "Could not select a page token.");
      return NextResponse.redirect(back.toString(), { status: 302 });
    }

    await upsertSocialAccount({
      organisationId,
      platform: "facebook",
      pageId,
      pageName,
      pageAccessToken,
      tokenExpiresAt: null,
      connectionType: "facebook_oauth",
    });

    const igId = norm(chosen?.instagram_business_account?.id);
    const igUsername = norm(chosen?.instagram_business_account?.username);

    if (igId) {
      await upsertSocialAccount({
        organisationId,
        platform: "instagram",
        pageId: igId,
        pageName: igUsername || "Instagram",
        pageAccessToken,
        tokenExpiresAt: null,
        connectionType: "facebook_oauth",
      });
    }

    back.searchParams.set("connected", "1");
    back.searchParams.set("provider", provider);
    if (igId) {
      back.searchParams.set("instagram", "connected");
    }

    return NextResponse.redirect(back.toString(), { status: 302 });
  } catch (e: any) {
    console.error("[facebook/callback] crashed", e);
    back.searchParams.set("error", "facebook_callback_crashed");
    back.searchParams.set("error_description", e?.message || "unknown");
    return NextResponse.redirect(back.toString(), { status: 302 });
  }
}
