// app/api/oauth/linkedin/callback/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || "").trim();
const LINKEDIN_CLIENT_ID = (process.env.LINKEDIN_CLIENT_ID || "").trim();
const LINKEDIN_CLIENT_SECRET = (process.env.LINKEDIN_CLIENT_SECRET || "").trim();

function baseUrl(req: NextRequest) {
  return APP_URL ? APP_URL.replace(/\/$/, "") : req.nextUrl.origin;
}

async function fetchJson(url: string, init?: RequestInit) {
  const res = await fetch(url, { cache: "no-store", ...(init || {}) });
  const json: any = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, json };
}

async function getLatestOrganisationId() {
  const { data, error } = await supabaseAdmin
    .from("organisations")
    .select("id, created_at")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return null;
  return data?.id ? String(data.id) : null;
}

function decodeState(state: string) {
  try {
    const raw = Buffer.from(state, "base64url").toString("utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function upsertLinkedInSocialAccount(args: {
  organisationId: string;
  pageId: string;
  pageName: string | null;
  accessToken: string;
  tokenExpiresAt: string | null;
}) {
  const now = new Date().toISOString();

  // Prefer upsert if unique constraint exists, otherwise update/insert fallback.
  const row: any = {
    organisation_id: args.organisationId,
    platform: "linkedin",
    page_id: args.pageId,
    page_name: args.pageName,
    page_access_token: args.accessToken,
    token_expires_at: args.tokenExpiresAt,
    is_active: true,
    updated_at: now,
  };

  const up = await supabaseAdmin
    .from("social_accounts")
    .upsert(row, { onConflict: "organisation_id,platform" })
    .select()
    .maybeSingle();

  if (!up.error) return;

  // fallback update
  const { data: updated, error: uErr } = await supabaseAdmin
    .from("social_accounts")
    .update({
      page_id: args.pageId,
      page_name: args.pageName,
      page_access_token: args.accessToken,
      token_expires_at: args.tokenExpiresAt,
      is_active: true,
      updated_at: now,
    })
    .eq("organisation_id", args.organisationId)
    .eq("platform", "linkedin")
    .select()
    .maybeSingle();

  if (!uErr && updated) return;

  // fallback insert
  await supabaseAdmin.from("social_accounts").insert(row);
}

export async function GET(req: NextRequest) {
  const back = new URL(`${baseUrl(req)}/dashboard/connect`);
  back.searchParams.set("provider", "linkedin");

  try {
    const err = req.nextUrl.searchParams.get("error") || "";
    const errDesc = req.nextUrl.searchParams.get("error_description") || "";
    if (err) {
      back.searchParams.set("error", err);
      if (errDesc) back.searchParams.set("error_description", errDesc);
      return NextResponse.redirect(back.toString(), { status: 302 });
    }

    if (!LINKEDIN_CLIENT_ID || !LINKEDIN_CLIENT_SECRET) {
      back.searchParams.set("error", "linkedin_missing_client_credentials");
      return NextResponse.redirect(back.toString(), { status: 302 });
    }

    const code = req.nextUrl.searchParams.get("code") || "";
    if (!code) {
      back.searchParams.set("error", "linkedin_missing_code");
      return NextResponse.redirect(back.toString(), { status: 302 });
    }

    // Resolve organisationId from state first (prevents “saved to wrong org”)
    const state = req.nextUrl.searchParams.get("state") || "";
    const stateObj = state ? decodeState(state) : null;
    const organisationId =
      (stateObj?.organisationId ? String(stateObj.organisationId) : "") ||
      (await getLatestOrganisationId());

    if (!organisationId) {
      back.searchParams.set("error", "no_organisation");
      return NextResponse.redirect(back.toString(), { status: 302 });
    }

    const redirectUri = `${baseUrl(req)}/api/oauth/linkedin/callback`;

    // 1) Exchange code -> access token
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

    const accessToken = String(tokenRes.json?.access_token || "").trim();
    const expiresIn = Number(tokenRes.json?.expires_in || 0);

    if (!tokenRes.ok || !accessToken) {
      back.searchParams.set("error", "linkedin_token_exchange_failed");
      back.searchParams.set(
        "error_description",
        tokenRes.json?.error_description || tokenRes.json?.message || "Token exchange failed"
      );
      return NextResponse.redirect(back.toString(), { status: 302 });
    }

    const tokenExpiresAt =
      expiresIn > 0 ? new Date(Date.now() + expiresIn * 1000).toISOString() : null;

    // 2) Fetch identity (OIDC userinfo)
    const meRes = await fetchJson("https://api.linkedin.com/v2/userinfo", {
      method: "GET",
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    // Fallback if userinfo isn't available
    let pageId = "";
    let pageName: string | null = null;

    if (meRes.ok && meRes.json?.sub) {
      pageId = String(meRes.json.sub);
      const name = meRes.json?.name ? String(meRes.json.name) : "";
      pageName = name ? name : null;
    } else {
      // Try legacy /v2/me
      const legacyMe = await fetchJson(
        "https://api.linkedin.com/v2/me?projection=(id,localizedFirstName,localizedLastName)",
        {
          method: "GET",
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );

      if (!legacyMe.ok || !legacyMe.json?.id) {
        back.searchParams.set("error", "linkedin_me_failed");
        back.searchParams.set(
          "error_description",
          legacyMe.json?.message || legacyMe.json?.error?.message || "Could not fetch LinkedIn profile"
        );
        return NextResponse.redirect(back.toString(), { status: 302 });
      }

      pageId = String(legacyMe.json.id);
      const fn = legacyMe.json?.localizedFirstName ? String(legacyMe.json.localizedFirstName) : "";
      const ln = legacyMe.json?.localizedLastName ? String(legacyMe.json.localizedLastName) : "";
      const nm = `${fn} ${ln}`.trim();
      pageName = nm ? nm : null;
    }

    // 3) Save to social_accounts (this is the “Threads fix” equivalent)
    await upsertLinkedInSocialAccount({
      organisationId,
      pageId,
      pageName,
      accessToken,
      tokenExpiresAt,
    });

    back.searchParams.set("connected", "1");
    return NextResponse.redirect(back.toString(), { status: 302 });
  } catch (e: any) {
    console.error("[linkedin/callback] crashed", e);
    back.searchParams.set("error", "linkedin_callback_crashed");
    back.searchParams.set("error_description", e?.message || "unknown");
    return NextResponse.redirect(back.toString(), { status: 302 });
  }
}
