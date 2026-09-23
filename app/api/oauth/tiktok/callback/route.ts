import { requireOrganisation } from "@/lib/tenantAuth";
import { consumeOAuthState } from "@/lib/oauthState";
// app/api/oauth/tiktok/callback/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { randomUUID } from "crypto";

export const runtime = "nodejs";

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || "").trim();

const TIKTOK_CLIENT_KEY = (process.env.TIKTOK_CLIENT_KEY || "").trim();
const TIKTOK_CLIENT_SECRET = (process.env.TIKTOK_CLIENT_SECRET || "").trim();
const TIKTOK_REDIRECT_URI = (process.env.TIKTOK_REDIRECT_URI || "").trim(); // must match TikTok app setting

function baseUrl(req: NextRequest) {
  try {
    return APP_URL ? APP_URL.replace(/\/$/, "") : req.nextUrl.origin;
  } catch {
    return APP_URL ? APP_URL.replace(/\/$/, "") : "";
  }
}

function norm(v: any) {
  return String(v ?? "").trim();
}

// expected: "<base64url(json)>.<base64url(signatureHex)>"

async function fetchJson(url: string, init?: RequestInit) {
  const res = await fetch(url, { cache: "no-store", ...(init || {}) });
  const json: any = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, json };
}

async function exchangeCodeForToken(code: string) {
  const url = "https://open.tiktokapis.com/v2/oauth/token/";

  const form = new URLSearchParams();
  form.set("client_key", TIKTOK_CLIENT_KEY);
  form.set("client_secret", TIKTOK_CLIENT_SECRET);
  form.set("code", code);
  form.set("grant_type", "authorization_code");
  form.set("redirect_uri", TIKTOK_REDIRECT_URI);

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
    cache: "no-store",
  });

  const json: any = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, json };
}

async function fetchTikTokUser(accessToken: string) {
  const url =
    "https://open.tiktokapis.com/v2/user/info/?fields=open_id,union_id,avatar_url,display_name,username";

  const res = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });

  const json: any = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, json };
}

/**
 * ✅ IMPORTANT:
 * Ensure exactly ONE active tiktok row per org.
 */
async function upsertTikTokSocialAccount(args: {
  organisationId: string;
  openId: string | null;
  displayName: string | null;
  accessToken: string;
  tokenExpiresAt: string | null;
  refreshToken?: string | null;
  rawToken?: any;
  rawUser?: any;
}) {
  const organisationId = norm(args.organisationId);
  const accessToken = norm(args.accessToken);

  if (!organisationId || !accessToken) {
    throw new Error("Missing organisationId / accessToken");
  }

  // 1) deactivate ALL tiktok rows for this org
  const { error: deactErr } = await supabaseAdmin
    .from("social_accounts")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("organisation_id", organisationId)
    .eq("platform", "tiktok");

  if (deactErr) {
    console.warn("[tiktok/callback] deactivate existing tiktok rows failed", deactErr);
  }

  // 2) find newest existing row (if any)
  const { data: existing, error: existingError } = await supabaseAdmin
    .from("social_accounts")
    .select("id, created_at, updated_at")
    .eq("organisation_id", organisationId)
    .eq("platform", "tiktok")
    .order("updated_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingError) {
    console.warn("[tiktok/callback] existing lookup error", existingError);
  }

  const payload: any = {
    page_id: args.openId ? String(args.openId) : null,
    page_name: args.displayName ? String(args.displayName) : "TikTok",
    connection_type: "tiktok_oauth",
    make_webhook_url: null,
    is_active: true,
    page_access_token: accessToken,
    token_expires_at: args.tokenExpiresAt,
    updated_at: new Date().toISOString(),
  };

  // meta is useful, but if your table ever didn’t have it, we’ll fail gracefully
  const metaPayload = {
    refresh_token: args.refreshToken || null,
    raw_token: args.rawToken || null,
    raw_user: args.rawUser || null,
  };

  if (existing?.id) {
    // try update with meta first
    const attempt1 = await supabaseAdmin
      .from("social_accounts")
      .update({ ...payload, meta: metaPayload })
      .eq("id", existing.id);

    if (!attempt1.error) return;

    // fallback update without meta
    const attempt2 = await supabaseAdmin
      .from("social_accounts")
      .update(payload)
      .eq("id", existing.id);

    if (attempt2.error) throw attempt2.error;
    return;
  }

  // insert new (try with meta, fallback without meta)
  const attemptIns1 = await supabaseAdmin.from("social_accounts").insert({
    id: randomUUID(),
    organisation_id: organisationId,
    platform: "tiktok",
    created_at: new Date().toISOString(),
    ...payload,
    meta: metaPayload,
  });

  if (!attemptIns1.error) return;

  const attemptIns2 = await supabaseAdmin.from("social_accounts").insert({
    id: randomUUID(),
    organisation_id: organisationId,
    platform: "tiktok",
    created_at: new Date().toISOString(),
    ...payload,
  });

  if (attemptIns2.error) throw attemptIns2.error;
}

export async function GET(req: NextRequest) {
  const back = new URL(`${baseUrl(req)}/dashboard/connect`);
  back.searchParams.set("provider", "tiktok");

  try {
    const url = new URL(req.url);

    const error = norm(url.searchParams.get("error"));
    const errorDesc = norm(url.searchParams.get("error_description"));
    if (error) {
      back.searchParams.set("error", error);
      if (errorDesc) back.searchParams.set("error_description", errorDesc);
      return NextResponse.redirect(back.toString(), { status: 302 });
    }

    const code = norm(url.searchParams.get("code"));
    const stateRaw = norm(url.searchParams.get("state"));

    if (!code) {
      back.searchParams.set("error", "tiktok_missing_code");
      return NextResponse.redirect(back.toString(), { status: 302 });
    }

    const { organisationId } = await consumeOAuthState("tiktok", stateRaw);

    if (!organisationId) {
      back.searchParams.set("error", "no_organisation");
      back.searchParams.set("error_description", "No organisation found to attach TikTok connection.");
      return NextResponse.redirect(back.toString(), { status: 302 });
    }

    if (!TIKTOK_CLIENT_KEY || !TIKTOK_CLIENT_SECRET || !TIKTOK_REDIRECT_URI) {
      back.searchParams.set("error", "tiktok_missing_env");
      back.searchParams.set("error_description", "Missing TIKTOK_CLIENT_KEY/TIKTOK_CLIENT_SECRET/TIKTOK_REDIRECT_URI.");
      return NextResponse.redirect(back.toString(), { status: 302 });
    }

    // 1) Exchange code -> token
    const tokenRes = await exchangeCodeForToken(code);
    if (!tokenRes.ok) {
      console.error("[tiktok/callback] token exchange failed", tokenRes.json);
      back.searchParams.set("error", "tiktok_token_exchange_failed");
      back.searchParams.set(
        "error_description",
        tokenRes.json?.error?.message ||
          tokenRes.json?.message ||
          tokenRes.json?.error_description ||
          `Token exchange failed (HTTP ${tokenRes.status}).`
      );
      return NextResponse.redirect(back.toString(), { status: 302 });
    }

    const accessToken =
      tokenRes.json?.access_token || tokenRes.json?.data?.access_token || "";
    const refreshToken =
      tokenRes.json?.refresh_token || tokenRes.json?.data?.refresh_token || "";
    const expiresIn =
      Number(tokenRes.json?.expires_in ?? tokenRes.json?.data?.expires_in ?? 0) || 0;

    if (!accessToken) {
      back.searchParams.set("error", "tiktok_missing_access_token");
      back.searchParams.set("error_description", "TikTok token exchange returned no access_token.");
      return NextResponse.redirect(back.toString(), { status: 302 });
    }

    const tokenExpiresAt =
      expiresIn > 0 ? new Date(Date.now() + expiresIn * 1000).toISOString() : null;

    // 2) Fetch user info (optional, but nice)
    const userRes = await fetchTikTokUser(accessToken);
    const userData = userRes.json?.data?.user || userRes.json?.data || null;

    const openId =
      norm(userData?.open_id || userData?.openId || tokenRes.json?.open_id || "") || null;

    const displayName =
      norm(userData?.display_name || userData?.displayName || userData?.username || "") || "TikTok";

    // 3) Save
    await requireOrganisation(organisationId);
    await upsertTikTokSocialAccount({
      organisationId,
      openId,
      displayName,
      accessToken,
      tokenExpiresAt,
      refreshToken,
      rawToken: tokenRes.json || null,
      rawUser: userRes.json || null,
    });

    back.searchParams.set("connected", "1");
    return NextResponse.redirect(back.toString(), { status: 302 });
  } catch (e: any) {
    console.error("[tiktok/callback] crashed", e);
    back.searchParams.set("error", "tiktok_callback_crashed");
    back.searchParams.set("error_description", e?.message || "unknown");
    return NextResponse.redirect(back.toString(), { status: 302 });
  }
}
