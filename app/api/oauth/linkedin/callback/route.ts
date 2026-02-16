// app/api/oauth/linkedin/callback/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || "").trim();
const LINKEDIN_CLIENT_ID = (process.env.LINKEDIN_CLIENT_ID || "").trim();
const LINKEDIN_CLIENT_SECRET = (process.env.LINKEDIN_CLIENT_SECRET || "").trim();

// ✅ Safe server-only org pin (must match start route)
const SINGLE_ORG_ID = (process.env.SINGLE_ORG_ID || "").trim();

function baseUrl(req: NextRequest) {
  return APP_URL ? APP_URL.replace(/\/$/, "") : req.nextUrl.origin;
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

async function upsertLinkedInSocialAccount(args: {
  organisationId: string;
  pageId: string;
  pageName: string | null;
  accessToken: string;
  tokenExpiresAt: string | null;
}) {
  const now = new Date().toISOString();

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

  // Try upsert first
  const up = await supabaseAdmin
    .from("social_accounts")
    .upsert(row, { onConflict: "organisation_id,platform" })
    .select()
    .maybeSingle();

  if (up.error) {
    // Fallback update
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

    // Fallback insert (✅ IMPORTANT: don’t ignore errors)
    const ins = await supabaseAdmin.from("social_accounts").insert(row);
    if (ins.error) throw new Error(ins.error.message);
  }
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

    if (!SINGLE_ORG_ID) {
      back.searchParams.set("error", "missing_single_org_id");
      back.searchParams.set(
        "error_description",
        "Set SINGLE_ORG_ID in Vercel env to your active organisation id."
      );
      return NextResponse.redirect(back.toString(), { status: 302 });
    }

    const code = req.nextUrl.searchParams.get("code") || "";
    if (!code) {
      back.searchParams.set("error", "linkedin_missing_code");
      return NextResponse.redirect(back.toString(), { status: 302 });
    }

    const state = req.nextUrl.searchParams.get("state") || "";
    const stateObj = state ? decodeState(state) : null;

    // ✅ Always force the pinned org (and sanity-check state)
    const organisationId = SINGLE_ORG_ID;
    if (stateObj?.organisationId && String(stateObj.organisationId) !== SINGLE_ORG_ID) {
      // Not fatal, but tells you exactly what was wrong if it ever happens again
      console.warn("[linkedin/callback] state org mismatch", stateObj?.organisationId, SINGLE_ORG_ID);
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

    // 2) Fetch identity
    const meRes = await fetchJson("https://api.linkedin.com/v2/userinfo", {
      method: "GET",
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    let pageId = "";
    let pageName: string | null = null;

    if (meRes.ok && meRes.json?.sub) {
      pageId = String(meRes.json.sub);
      pageName = meRes.json?.name ? String(meRes.json.name) : null;
    } else {
      const legacyMe = await fetchJson(
        "https://api.linkedin.com/v2/me?projection=(id,localizedFirstName,localizedLastName)",
        { method: "GET", headers: { Authorization: `Bearer ${accessToken}` } }
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

    // 3) Save
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
