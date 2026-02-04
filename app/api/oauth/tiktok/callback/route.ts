// app/api/oauth/tiktok/callback/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

export const runtime = "nodejs";

const TIKTOK_CLIENT_KEY = process.env.TIKTOK_CLIENT_KEY || "";
const TIKTOK_CLIENT_SECRET = process.env.TIKTOK_CLIENT_SECRET || "";
const TIKTOK_REDIRECT_URI = process.env.TIKTOK_REDIRECT_URI || ""; // must match TikTok app setting
const OAUTH_STATE_SECRET = process.env.OAUTH_STATE_SECRET || "dev-secret";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

function b64urlDecodeToString(input: string) {
  // base64url -> base64
  const b64 = input.replace(/-/g, "+").replace(/_/g, "/");
  // pad
  const pad = b64.length % 4 ? "=".repeat(4 - (b64.length % 4)) : "";
  return Buffer.from(b64 + pad, "base64").toString("utf8");
}

function verifyAndParseSignedState(state: string): any | null {
  // expected: "<base64url(json)>.<base64url(signatureHex)>"
  const parts = String(state || "").split(".");
  if (parts.length !== 2) return null;

  const bodyB64Url = parts[0];
  const sigB64Url = parts[1];

  const expectedHex = crypto
    .createHmac("sha256", OAUTH_STATE_SECRET)
    .update(bodyB64Url)
    .digest("hex");

  const gotHex = (() => {
    try {
      // signature stored as base64url of hex string
      return b64urlDecodeToString(sigB64Url);
    } catch {
      return "";
    }
  })();

  if (!gotHex || gotHex !== expectedHex) return null;

  try {
    const jsonStr = b64urlDecodeToString(bodyB64Url);
    return JSON.parse(jsonStr);
  } catch {
    return null;
  }
}

function parseStateAny(state: string): any | null {
  const s = String(state || "").trim();
  if (!s) return null;

  // 1) Try our signed state format
  const signed = verifyAndParseSignedState(s);
  if (signed) return signed;

  // 2) Backwards compat: raw JSON state
  try {
    if (s.startsWith("{") && s.endsWith("}")) return JSON.parse(s);
  } catch {}

  // 3) Backwards compat: base64/base64url JSON without signature
  try {
    const decoded = b64urlDecodeToString(s);
    if (decoded.startsWith("{") && decoded.endsWith("}")) return JSON.parse(decoded);
  } catch {}

  return null;
}

async function exchangeCodeForToken(code: string) {
  // TikTok OAuth token endpoint (v2)
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
  // Basic user info (TikTok Open API v2)
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

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);

    const code = String(url.searchParams.get("code") || "").trim();
    const stateRaw = String(url.searchParams.get("state") || "").trim();
    const error = String(url.searchParams.get("error") || "").trim();
    const errorDesc = String(url.searchParams.get("error_description") || "").trim();

    if (error) {
      return NextResponse.json(
        { success: false, error: errorDesc || error || "TikTok returned an error" },
        { status: 400 }
      );
    }

    if (!code) {
      return NextResponse.json({ success: false, error: "Missing code" }, { status: 400 });
    }

    const state = parseStateAny(stateRaw);
    const organisationId = String(state?.organisationId || "").trim();

    if (!organisationId) {
      return NextResponse.json(
        { success: false, error: "Missing/invalid state (no organisation id)." },
        { status: 400 }
      );
    }

    if (!TIKTOK_CLIENT_KEY || !TIKTOK_CLIENT_SECRET || !TIKTOK_REDIRECT_URI) {
      return NextResponse.json(
        { success: false, error: "TikTok env missing (client key/secret/redirect uri)." },
        { status: 500 }
      );
    }

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json(
        { success: false, error: "Supabase env missing (NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY)." },
        { status: 500 }
      );
    }

    // 1) Exchange code -> token
    const tokenRes = await exchangeCodeForToken(code);
    if (!tokenRes.ok) {
      return NextResponse.json(
        {
          success: false,
          error: tokenRes.json?.error?.message || tokenRes.json?.message || "TikTok token exchange failed",
          details: tokenRes.json,
          status: tokenRes.status,
        },
        { status: 400 }
      );
    }

    const accessToken =
      tokenRes.json?.access_token || tokenRes.json?.data?.access_token || "";
    const refreshToken =
      tokenRes.json?.refresh_token || tokenRes.json?.data?.refresh_token || "";
    const expiresIn =
      Number(tokenRes.json?.expires_in ?? tokenRes.json?.data?.expires_in ?? 0) || 0;

    if (!accessToken) {
      return NextResponse.json(
        { success: false, error: "TikTok token exchange returned no access_token", details: tokenRes.json },
        { status: 400 }
      );
    }

    // 2) Fetch user info (nice for page_name/page_id)
    const userRes = await fetchTikTokUser(accessToken);
    const userData = userRes.json?.data?.user || userRes.json?.data || null;

    const openId =
      String(userData?.open_id || userData?.openId || tokenRes.json?.open_id || "").trim();
    const displayName =
      String(userData?.display_name || userData?.displayName || userData?.username || "").trim() ||
      "TikTok";

    // 3) Save to social_accounts
    const service = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const tokenExpiresAt =
      expiresIn > 0 ? new Date(Date.now() + expiresIn * 1000).toISOString() : null;

    const { error: upsertErr } = await service
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
          // store refresh token etc in meta if you have a jsonb column (safe optional)
          meta: {
            refresh_token: refreshToken || null,
            raw_token: tokenRes.json || null,
            raw_user: userRes.json || null,
          },
        } as any,
        { onConflict: "organisation_id,platform" }
      );

    if (upsertErr) {
      return NextResponse.json(
        { success: false, error: `Failed to save TikTok connection: ${upsertErr.message}` },
        { status: 500 }
      );
    }

    // 4) Back to Connect page
    return NextResponse.redirect(`${url.origin}/dashboard/connect?connected=tiktok`);
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message || "TikTok callback failed" },
      { status: 500 }
    );
  }
}
