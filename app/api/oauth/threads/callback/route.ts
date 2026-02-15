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

/**
 * Multi-tenant safe: choose the most recently created org as a fallback.
 * (In the future: pass orgId in state and use that instead.)
 */
async function getLatestOrganisationId() {
  const { data, error } = await supabaseAdmin
    .from("organisations")
    .select("id, created_at")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[threads/callback] organisations error", error);
    return null;
  }
  if (!data?.id) return null;
  return String(data.id);
}

function norm(v: any) {
  return String(v ?? "").trim();
}

/**
 * ✅ IMPORTANT:
 * Ensure exactly ONE active threads row per org.
 * - Deactivate all existing threads rows for this org
 * - Update the newest existing row if one exists
 * - Otherwise insert a new row
 */
async function upsertThreadsSocialAccount(args: {
  organisationId: string;
  threadsUserId: string;
  username?: string;
  accessToken: string;
  tokenExpiresAt?: string | null;
}) {
  const organisationId = norm(args.organisationId);
  const threadsUserId = norm(args.threadsUserId);
  const accessToken = norm(args.accessToken);

  if (!organisationId || !threadsUserId || !accessToken) {
    throw new Error("Missing organisationId / threadsUserId / accessToken");
  }

  // 1) Deactivate ALL threads rows for this org (scoped, multi-tenant safe)
  const { error: deactErr } = await supabaseAdmin
    .from("social_accounts")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("organisation_id", organisationId)
    .eq("platform", "threads");

  if (deactErr) {
    console.warn("[threads/callback] deactivate existing threads rows failed", deactErr);
    // We continue anyway, because we can still set the right one active.
  }

  // 2) Find the most recently updated/created threads row (if any)
  const { data: existing, error: existingError } = await supabaseAdmin
    .from("social_accounts")
    .select("id, created_at, updated_at")
    .eq("organisation_id", organisationId)
    .eq("platform", "threads")
    .order("updated_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingError) {
    console.warn("[threads/callback] existing lookup error", existingError);
  }

  const pageName = args.username ? String(args.username) : null;

  if (existing?.id) {
    const { error } = await supabaseAdmin
      .from("social_accounts")
      .update({
        page_id: threadsUserId,
        page_name: pageName,
        connection_type: "threads_oauth",
        make_webhook_url: null,
        is_active: true,
        page_access_token: accessToken,
        token_expires_at: args.tokenExpiresAt ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);

    if (error) throw error;
    return;
  }

  // 3) No existing row -> insert new
  const { error } = await supabaseAdmin.from("social_accounts").insert({
    id: randomUUID(),
    organisation_id: organisationId,
    platform: "threads",
    page_id: threadsUserId,
    page_name: pageName,
    connection_type: "threads_oauth",
    make_webhook_url: null,
    is_active: true,
    page_access_token: accessToken,
    token_expires_at: args.tokenExpiresAt ?? null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    meta: {},
  });

  if (error) throw error;
}

export async function GET(req: NextRequest) {
  try {
    const back = new URL(`${baseUrl(req)}/dashboard/connect`);
    back.searchParams.set("provider", "threads");

    // Threads may return an OAuth error instead of a code
    const err = req.nextUrl.searchParams.get("error") || "";
    const errDesc = req.nextUrl.searchParams.get("error_description") || "";
    if (err) {
      back.searchParams.set("error", err);
      if (errDesc) back.searchParams.set("error_description", errDesc);
      return NextResponse.redirect(back.toString(), { status: 302 });
    }

    if (!THREADS_CLIENT_ID || !THREADS_CLIENT_SECRET) {
      back.searchParams.set("error", "threads_missing_client_credentials");
      return NextResponse.redirect(back.toString(), { status: 302 });
    }

    const code = req.nextUrl.searchParams.get("code") || "";
    if (!code) {
      back.searchParams.set("error", "threads_missing_code");
      return NextResponse.redirect(back.toString(), { status: 302 });
    }

    const redirectUri = `${baseUrl(req)}/api/oauth/threads/callback`;

    // 1) code -> short-lived token
    const tokenRes = await fetchJson("https://graph.threads.net/oauth/access_token", {
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
      back.searchParams.set("error", "threads_token_exchange_failed");
      return NextResponse.redirect(back.toString(), { status: 302 });
    }

    const shortToken = String(tokenRes.json.access_token);

    // 2) short -> long-lived token
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
    const tokenExpiresAt =
      expiresIn > 0 ? new Date(Date.now() + expiresIn * 1000).toISOString() : null;

    // 3) fetch threads user
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

    // 4) save to org
    const organisationId = await getLatestOrganisationId();
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

    back.searchParams.set("connected", "1");
    return NextResponse.redirect(back.toString(), { status: 302 });
  } catch (e: any) {
    console.error("[threads/callback] crashed", e);
    const back = new URL(`${baseUrl(req)}/dashboard/connect`);
    back.searchParams.set("provider", "threads");
    back.searchParams.set("error", "threads_callback_crashed");
    back.searchParams.set("error_description", e?.message || "unknown");
    return NextResponse.redirect(back.toString(), { status: 302 });
  }
}
