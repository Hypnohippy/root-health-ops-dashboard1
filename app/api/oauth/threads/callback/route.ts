// app/api/oauth/threads/callback/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { randomUUID } from "crypto";

export const runtime = "nodejs";

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");

// IMPORTANT:
// We allow either explicit THREADS creds OR fall back to your FB app creds,
// because you’re intentionally using ONE Meta app for IG/FB (+ Threads scopes).
const CLIENT_ID =
  process.env.THREADS_CLIENT_ID ||
  process.env.FACEBOOK_APP_ID ||
  "";

const CLIENT_SECRET =
  process.env.THREADS_CLIENT_SECRET ||
  process.env.FACEBOOK_APP_SECRET ||
  "";

function baseUrl(req: NextRequest) {
  try {
    return APP_URL || req.nextUrl.origin;
  } catch {
    return APP_URL || "";
  }
}

async function fetchJson(url: string, init?: RequestInit) {
  const res = await fetch(url, { cache: "no-store", ...(init || {}) });
  const json: any = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, json };
}

async function getSingleTenantOrganisationId() {
  const { data, error } = await supabaseAdmin
    .from("organisations")
    .select("id")
    .limit(1);

  if (error) {
    console.error("[threads/callback] organisations error", error);
    return null;
  }
  if (!data || data.length === 0) return null;
  return data[0].id as string;
}

async function upsertThreadsSocialAccount(args: {
  organisationId: string;
  threadsUserId: string;
  username?: string;
  accessToken: string;
  tokenExpiresAt?: string | null;
}) {
  const { data: existing } = await supabaseAdmin
    .from("social_accounts")
    .select("id")
    .eq("organisation_id", args.organisationId)
    .eq("platform", "threads")
    .limit(1);

  const pageName = args.username ? String(args.username) : null;

  if (existing && existing.length > 0) {
    const id = existing[0].id;
    const { error } = await supabaseAdmin
      .from("social_accounts")
      .update({
        page_id: String(args.threadsUserId),
        page_name: pageName,
        connection_type: "threads_oauth",
        make_webhook_url: null,
        is_active: true,
        page_access_token: String(args.accessToken),
        token_expires_at: args.tokenExpiresAt ?? null,
      })
      .eq("id", id);

    if (error) throw error;
    return;
  }

  const { error } = await supabaseAdmin.from("social_accounts").insert({
    id: randomUUID(),
    organisation_id: args.organisationId,
    platform: "threads",
    page_id: String(args.threadsUserId),
    page_name: pageName,
    connection_type: "threads_oauth",
    make_webhook_url: null,
    is_active: true,
    page_access_token: String(args.accessToken),
    token_expires_at: args.tokenExpiresAt ?? null,
  });

  if (error) throw error;
}

export async function GET(req: NextRequest) {
  const back = new URL(`${baseUrl(req)}/dashboard/connect`);
  back.searchParams.set("provider", "threads");

  try {
    // error from OAuth provider
    const err = req.nextUrl.searchParams.get("error") || "";
    const errDesc = req.nextUrl.searchParams.get("error_description") || "";
    if (err) {
      back.searchParams.set("error", err);
      if (errDesc) back.searchParams.set("error_description", errDesc);
      return NextResponse.redirect(back.toString(), { status: 302 });
    }

    const code = req.nextUrl.searchParams.get("code") || "";
    const state = req.nextUrl.searchParams.get("state") || "";

    if (!code) {
      back.searchParams.set("error", "threads_missing_code");
      return NextResponse.redirect(back.toString(), { status: 302 });
    }

    // CSRF cookie check (best-effort)
    const cookieState = req.cookies.get("oauth_state_threads")?.value || "";
    if (cookieState && state && cookieState !== state) {
      back.searchParams.set("error", "threads_state_mismatch");
      return NextResponse.redirect(back.toString(), { status: 302 });
    }

    if (!CLIENT_ID || !CLIENT_SECRET) {
      back.searchParams.set("error", "threads_missing_client_credentials");
      return NextResponse.redirect(back.toString(), { status: 302 });
    }

    const redirectUri = `${baseUrl(req)}/api/oauth/threads/callback`;

    // 1) Exchange code -> short-lived token (Instagram OAuth token endpoint)
    const tokenRes = await fetchJson("https://api.instagram.com/oauth/access_token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
        code,
      }),
    });

    if (!tokenRes.ok || !tokenRes.json?.access_token) {
      console.error("[threads/callback] ig oauth token exchange failed", tokenRes.json);
      back.searchParams.set("error", "threads_token_exchange_failed");
      return NextResponse.redirect(back.toString(), { status: 302 });
    }

    const shortToken = String(tokenRes.json.access_token);

    // 2) short -> long-lived token (Threads)
    const exchangeUrl =
      "https://graph.threads.net/access_token?" +
      new URLSearchParams({
        grant_type: "th_exchange_token",
        client_secret: CLIENT_SECRET,
        access_token: shortToken,
      }).toString();

    const longRes = await fetchJson(exchangeUrl);

    const accessToken = String(longRes.json?.access_token || shortToken);
    const expiresIn = Number(longRes.json?.expires_in || 0);
    const tokenExpiresAt =
      expiresIn > 0 ? new Date(Date.now() + expiresIn * 1000).toISOString() : null;

    // 3) fetch Threads user
    const meUrl =
      "https://graph.threads.net/v1.0/me?" +
      new URLSearchParams({
        fields: "id,username",
        access_token: accessToken,
      }).toString();

    const meRes = await fetchJson(meUrl);

    if (!meRes.ok || !meRes.json?.id) {
      console.error("[threads/callback] failed to fetch me", meRes.json);
      back.searchParams.set("error", "threads_me_failed");
      return NextResponse.redirect(back.toString(), { status: 302 });
    }

    const threadsUserId = String(meRes.json.id);
    const username = meRes.json.username ? String(meRes.json.username) : undefined;

    // 4) upsert DB
    const organisationId = await getSingleTenantOrganisationId();
    if (!organisationId) {
      back.searchParams.set("error", "no_organisation");
      return NextResponse.redirect(back.toString(), { status: 302 });
    }

    await upsertThreadsSocialAccount({
      organisationId,
      threadsUserId,
      username,
      accessToken,
      tokenExpiresAt,
    });

    // back to Connect
    back.searchParams.set("connected", "1");
    return NextResponse.redirect(back.toString(), { status: 302 });
  } catch (e: any) {
    console.error("[threads/callback] crashed", e);
    back.searchParams.set("error", "threads_callback_crashed");
    back.searchParams.set("error_description", e?.message || "unknown");
    return NextResponse.redirect(back.toString(), { status: 302 });
  }
}
