// app/api/oauth/threads/callback/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { randomUUID } from "crypto";

export const runtime = "nodejs";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "";
const THREADS_CLIENT_ID = process.env.THREADS_CLIENT_ID || "";
const THREADS_CLIENT_SECRET = process.env.THREADS_CLIENT_SECRET || "";

function baseUrl(req: NextRequest) {
  try {
    return APP_URL ? APP_URL.replace(/\/$/, "") : req.nextUrl.origin;
  } catch {
    return APP_URL ? APP_URL.replace(/\/$/, "") : "";
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
  const organisationId = args.organisationId;

  const { data: existing, error: existingError } = await supabaseAdmin
    .from("social_accounts")
    .select("id")
    .eq("organisation_id", organisationId)
    .eq("platform", "threads")
    .limit(1);

  if (existingError) {
    console.warn("[threads/callback] existing lookup error", existingError);
  }

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

  // Insert new
  const { error } = await supabaseAdmin.from("social_accounts").insert({
    id: randomUUID(),
    organisation_id: organisationId,
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
  try {
    if (!THREADS_CLIENT_ID || !THREADS_CLIENT_SECRET) {
      const back = new URL(`${baseUrl(req)}/dashboard/connect`);
      back.searchParams.set("error", "threads_missing_client_credentials");
      return NextResponse.redirect(back.toString(), { status: 302 });
    }

    const code = req.nextUrl.searchParams.get("code") || "";
    const state = req.nextUrl.searchParams.get("state") || "";
    if (!code) {
      const back = new URL(`${baseUrl(req)}/dashboard/connect`);
      back.searchParams.set("error", "threads_missing_code");
      return NextResponse.redirect(back.toString(), { status: 302 });
    }

    const redirectUri = `${baseUrl(req)}/api/oauth/threads/callback`;

    // 1) code -> short-lived threads token
    const tokenUrl = "https://graph.threads.net/oauth/access_token";

    const tokenRes = await fetchJson(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: THREADS_CLIENT_ID,
        client_secret: THREADS_CLIENT_SECRET,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
        code,
      }),
    });

    if (!tokenRes.ok || !tokenRes.json?.access_token) {
      console.error("[threads/callback] token exchange failed", tokenRes.json);
      const back = new URL(`${baseUrl(req)}/dashboard/connect`);
      back.searchParams.set("error", "threads_token_exchange_failed");
      return NextResponse.redirect(back.toString(), { status: 302 });
    }

    const shortToken = String(tokenRes.json.access_token);

    // 2) short -> long-lived token (recommended)
    const exchangeUrl =
      "https://graph.threads.net/access_token?" +
      new URLSearchParams({
        grant_type: "th_exchange_token",
        client_secret: THREADS_CLIENT_SECRET,
        access_token: shortToken,
      }).toString();

    const longRes = await fetchJson(exchangeUrl);

    const accessToken = String(longRes.json?.access_token || shortToken);
    const expiresIn = Number(longRes.json?.expires_in || 0);

    // token_expires_at (optional)
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
      const back = new URL(`${baseUrl(req)}/dashboard/connect`);
      back.searchParams.set("error", "threads_me_failed");
      return NextResponse.redirect(back.toString(), { status: 302 });
    }

    const threadsUserId = String(meRes.json.id);
    const username = meRes.json.username ? String(meRes.json.username) : undefined;

    // 4) upsert DB
    const organisationId = await getSingleTenantOrganisationId();
    if (!organisationId) {
      const back = new URL(`${baseUrl(req)}/dashboard/connect`);
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

    const back = new URL(`${baseUrl(req)}/dashboard/connect`);
    back.searchParams.set("provider", "threads");
    back.searchParams.set("success", "1");
    if (state) back.searchParams.set("state", state);

    return NextResponse.redirect(back.toString(), { status: 302 });
  } catch (e: any) {
    console.error("[threads/callback] crashed", e);
    const back = new URL(`${baseUrl(req)}/dashboard/connect`);
    back.searchParams.set("error", "threads_callback_crashed");
    return NextResponse.redirect(back.toString(), { status: 302 });
  }
}
