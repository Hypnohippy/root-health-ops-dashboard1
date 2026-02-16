// app/api/oauth/linkedin/callback/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { randomUUID } from "crypto";

export const runtime = "nodejs";

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || "").trim();
const LINKEDIN_CLIENT_ID = (process.env.LINKEDIN_CLIENT_ID || "").trim();
const LINKEDIN_CLIENT_SECRET = (process.env.LINKEDIN_CLIENT_SECRET || "").trim();

// IMPORTANT: do NOT use NEXT_PUBLIC_ for server-only org forcing.
// If you want a single-org override, use SINGLE_ORG_ID (server-only).
const SINGLE_ORG_ID = (process.env.SINGLE_ORG_ID || "").trim();

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

async function fetchJson(url: string, init?: RequestInit) {
  const res = await fetch(url, { cache: "no-store", ...(init || {}) });
  const json: any = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, json };
}

function decodeState(state: string) {
  try {
    const raw = Buffer.from(state, "base64url").toString("utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function getOrganisationIdFallback(): Promise<string | null> {
  if (SINGLE_ORG_ID) return SINGLE_ORG_ID;

  // Single-tenant fallback: most recently created org
  const { data, error } = await supabaseAdmin
    .from("organisations")
    .select("id, created_at")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data?.id) return null;
  return String(data.id);
}

async function upsertLinkedInSocialAccount(args: {
  organisationId: string;
  linkedInUserId: string; // "sub" from userinfo
  name?: string | null;
  accessToken: string;
  tokenExpiresAt?: string | null;
}) {
  // Try upsert (best) – requires unique (organisation_id, platform)
  const row: any = {
    organisation_id: args.organisationId,
    platform: "linkedin",
    page_id: String(args.linkedInUserId),
    page_name: args.name ? String(args.name) : null,
    connection_type: "linkedin_oauth",
    make_webhook_url: null,
    is_active: true,
    page_access_token: String(args.accessToken),
    token_expires_at: args.tokenExpiresAt ?? null,
    updated_at: new Date().toISOString(),
  };

  const up = await supabaseAdmin
    .from("social_accounts")
    .upsert(row, { onConflict: "organisation_id,platform" })
    .select()
    .maybeSingle();

  if (!up.error) return;

  // Fallback: update if exists, else insert
  const { data: existing } = await supabaseAdmin
    .from("social_accounts")
    .select("id")
    .eq("organisation_id", args.organisationId)
    .eq("platform", "linkedin")
    .limit(1);

  if (existing && existing.length > 0) {
    const { error } = await supabaseAdmin
      .from("social_accounts")
      .update(row)
      .eq("id", existing[0].id);

    if (error) throw error;
    return;
  }

  const { error: insErr } = await supabaseAdmin.from("social_accounts").insert({
    id: randomUUID(),
    ...row,
  });

  if (insErr) throw insErr;
}

export async function GET(req: NextRequest) {
  const back = new URL(`${baseUrl(req)}/dashboard/connect`);
  back.searchParams.set("provider", "linkedin");

  try {
    // LinkedIn may send OAuth error params instead of code
    const oauthErr = norm(req.nextUrl.searchParams.get("error") || "");
    const oauthErrDesc = norm(req.nextUrl.searchParams.get("error_description") || "");
    if (oauthErr) {
      back.searchParams.set("error", oauthErr);
      if (oauthErrDesc) back.searchParams.set("error_description", oauthErrDesc);
      return NextResponse.redirect(back.toString(), { status: 302 });
    }

    if (!LINKEDIN_CLIENT_ID || !LINKEDIN_CLIENT_SECRET) {
      back.searchParams.set("error", "linkedin_missing_client_credentials");
      back.searchParams.set(
        "error_description",
        "Missing LINKEDIN_CLIENT_ID or LINKEDIN_CLIENT_SECRET in Vercel env."
      );
      return NextResponse.redirect(back.toString(), { status: 302 });
    }

    const code = norm(req.nextUrl.searchParams.get("code") || "");
    if (!code) {
      back.searchParams.set("error", "linkedin_missing_code");
      return NextResponse.redirect(back.toString(), { status: 302 });
    }

    const stateRaw = norm(req.nextUrl.searchParams.get("state") || "");
    const st = stateRaw ? decodeState(stateRaw) : null;

    const redirectUri = `${baseUrl(req)}/api/oauth/linkedin/callback`;

    // 1) code -> access token
    const tokenRes = await fetchJson("https://www.linkedin.com/oauth/v2/accessToken", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        client_id: LINKEDIN_CLIENT_ID,
        client_secret: LINKEDIN_CLIENT_SECRET,
      }),
    });

    if (!tokenRes.ok || !tokenRes.json?.access_token) {
      // This is where your “Client authentication failed” is happening.
      back.searchParams.set("error", "linkedin_token_exchange_failed");
      back.searchParams.set(
        "error_description",
        tokenRes.json?.error_description ||
          tokenRes.json?.error ||
          tokenRes.json?.message ||
          `Token exchange failed (HTTP ${tokenRes.status}).`
      );
      return NextResponse.redirect(back.toString(), { status: 302 });
    }

    const accessToken = String(tokenRes.json.access_token);
    const expiresIn = Number(tokenRes.json.expires_in || 0);
    const tokenExpiresAt =
      expiresIn > 0 ? new Date(Date.now() + expiresIn * 1000).toISOString() : null;

    // 2) userinfo (because we requested openid/profile/email)
    const meRes = await fetchJson("https://api.linkedin.com/v2/userinfo", {
      method: "GET",
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!meRes.ok || !meRes.json?.sub) {
      back.searchParams.set("error", "linkedin_userinfo_failed");
      back.searchParams.set(
        "error_description",
        meRes.json?.message ||
          meRes.json?.error_description ||
          `Failed to fetch LinkedIn userinfo (HTTP ${meRes.status}).`
      );
      return NextResponse.redirect(back.toString(), { status: 302 });
    }

    const linkedInUserId = String(meRes.json.sub);
    const name =
      meRes.json?.name ||
      [meRes.json?.given_name, meRes.json?.family_name].filter(Boolean).join(" ") ||
      null;

    // 3) pick org id
    const organisationId =
      (st?.organisationId ? String(st.organisationId) : "") || (await getOrganisationIdFallback());

    if (!organisationId) {
      back.searchParams.set("error", "no_organisation");
      back.searchParams.set("error_description", "No organisation found to attach LinkedIn connection.");
      return NextResponse.redirect(back.toString(), { status: 302 });
    }

    // 4) save connection
    await upsertLinkedInSocialAccount({
      organisationId,
      linkedInUserId,
      name,
      accessToken,
      tokenExpiresAt,
    });

    back.searchParams.set("connected", "1");
    return NextResponse.redirect(back.toString(), { status: 302 });
  } catch (e: any) {
    back.searchParams.set("error", "linkedin_callback_crashed");
    back.searchParams.set("error_description", e?.message || "unknown");
    return NextResponse.redirect(back.toString(), { status: 302 });
  }
}
