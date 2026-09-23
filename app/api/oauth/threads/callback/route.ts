import { requireOrganisation } from "@/lib/tenantAuth";
import { consumeOAuthState } from "@/lib/oauthState";
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

type Stage = "code_exchange" | "long_lived_exchange" | "identity" | "save" | "state";
type TokenType = "none" | "short_lived" | "long_lived";

// Never log raw provider/DB errors: their messages may echo credentials or URLs.
function diagnostic(stage: Stage, tokenType: TokenType, result?: { status: number; json: any }) {
  const error = result?.json?.error;
  console.error("[threads/callback] stage failed", {
    stage, tokenType, status: result?.status ?? 0,
    code: typeof error?.code === "number" ? error.code : null,
    subcode: typeof error?.error_subcode === "number" ? error.error_subcode : null,
    oauthException: error?.type === "OAuthException",
    transient: error?.is_transient === true,
  });
}

async function fetchJson(url: string, init?: RequestInit) {
  try {
    const res = await fetch(url, { cache: "no-store", ...(init || {}) });
    const json: any = await res.json().catch(() => null);
    return { ok: res.ok, status: res.status, json };
  } catch {
    // Fetch exceptions can contain the token-bearing URL. Return only a sentinel.
    return { ok: false, status: 0, json: null };
  }
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
    diagnostic("save", "none");
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
    diagnostic("save", "none");
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
      .eq("id", existing.id)
      .eq("organisation_id", organisationId);

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
  let stage: Stage = "state";
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

    const { organisationId } = await consumeOAuthState("threads", req.nextUrl.searchParams.get("state"));

    const redirectUri = `${baseUrl(req)}/api/oauth/threads/callback`;

    stage = "code_exchange";
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
      diagnostic(stage, "none", tokenRes);
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

    stage = "long_lived_exchange";
    const longRes = await fetchJson(exchangeUrl);

    const hasLongToken = longRes.ok && !longRes.json?.error &&
      typeof longRes.json?.access_token === "string" && !!longRes.json.access_token.trim();
    if (!hasLongToken) diagnostic(stage, "short_lived", longRes);
    const accessToken = hasLongToken ? String(longRes.json.access_token) : shortToken;
    const expiresIn = Number(hasLongToken ? longRes.json.expires_in : (tokenRes.json.expires_in || 3600));
    const tokenExpiresAt = Number.isFinite(expiresIn) && expiresIn > 0
      ? new Date(Date.now() + expiresIn * 1000).toISOString() : null;

    stage = "identity";
    const readIdentity = (token: string) => fetchJson(
      "https://graph.threads.net/v1.0/me?" +
      new URLSearchParams({ fields: "id,username", access_token: token }).toString()
    );
    const validIdentity = (result: Awaited<ReturnType<typeof fetchJson>>) =>
      result.ok && !result.json?.error && typeof result.json?.id === "string" && !!result.json.id.trim();
    let meRes = await readIdentity(accessToken);
    if (!validIdentity(meRes)) {
      diagnostic(stage, hasLongToken ? "long_lived" : "short_lived", meRes);
      const code = meRes.json?.error?.code;
      const transient = ![190, 10, 200].includes(code) && (
        code === 1 || code === 2 || meRes.json?.error?.is_transient === true ||
        meRes.status === 0 || meRes.status >= 500
      );
      if (hasLongToken && transient) {
        meRes = await readIdentity(shortToken);
        if (!validIdentity(meRes)) diagnostic(stage, "short_lived", meRes);
      }
    }
    if (!validIdentity(meRes)) {
      back.searchParams.set("error", "threads_me_failed");
      return NextResponse.redirect(back.toString(), { status: 302 });
    }

    const threadsUserId = String(meRes.json.id);
    const username = meRes.json.username ? String(meRes.json.username) : undefined;

    // 4) save to org

    if (!organisationId) {
      back.searchParams.set("error", "no_organisation");
      return NextResponse.redirect(back.toString(), { status: 302 });
    }

    stage = "save";
    await requireOrganisation(organisationId);
    await upsertThreadsSocialAccount({
      organisationId,
      threadsUserId,
      username,
      accessToken,
      tokenExpiresAt,
    });

    back.searchParams.set("connected", "1");
    return NextResponse.redirect(back.toString(), { status: 302 });
  } catch {
    diagnostic(stage, "none");
    const back = new URL(`${baseUrl(req)}/dashboard/connect`);
    back.searchParams.set("provider", "threads");
    back.searchParams.set("error", "threads_callback_crashed");

    return NextResponse.redirect(back.toString(), { status: 302 });
  }
}
