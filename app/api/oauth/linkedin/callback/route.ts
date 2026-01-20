// app/api/oauth/linkedin/callback/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { randomUUID } from "crypto";

export const runtime = "nodejs";

type ProviderId =
  | "facebook"
  | "instagram"
  | "tiktok"
  | "linkedin"
  | "google"
  | "email"
  | "whatsapp"
  | "threads";

type SocialAccountRow = {
  id: string;
  organisation_id: string;
  platform: ProviderId;
  page_id: string | null;
  page_name: string | null;
  connection_type: string | null;
  make_webhook_url: string | null;
  is_active: boolean | null;
  page_access_token: string | null;
  token_expires_at: string | null;
};

async function getSingleTenantOrganisationId() {
  const { data, error } = await supabaseAdmin
    .from("organisations")
    .select("id")
    .limit(1);

  if (error) {
    console.error("[linkedin/callback] organisations error", error);
    return null;
  }
  if (!data || data.length === 0) return null;
  return data[0].id as string;
}

function safeBaseUrl(appUrl: string) {
  return (appUrl || "").replace(/\/$/, "");
}

async function fetchJson(url: string, init?: RequestInit) {
  const res = await fetch(url, { cache: "no-store", ...(init || {}) });
  const json: any = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, json, headers: res.headers };
}

function toIsoFromNowSeconds(seconds: number) {
  const ms = Date.now() + Math.max(0, seconds) * 1000;
  return new Date(ms).toISOString();
}

export async function GET(req: NextRequest) {
  try {
    const clientId = process.env.LINKEDIN_CLIENT_ID || "";
    const clientSecret = process.env.LINKEDIN_CLIENT_SECRET || "";
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";

    if (!clientId || !clientSecret || !appUrl) {
      return NextResponse.json(
        {
          error: "Missing LINKEDIN_CLIENT_ID / LINKEDIN_CLIENT_SECRET / NEXT_PUBLIC_APP_URL",
          missing: {
            LINKEDIN_CLIENT_ID: !clientId,
            LINKEDIN_CLIENT_SECRET: !clientSecret,
            NEXT_PUBLIC_APP_URL: !appUrl,
          },
        },
        { status: 500 }
      );
    }

    const code = req.nextUrl.searchParams.get("code") || "";
    const state = req.nextUrl.searchParams.get("state") || "";
    if (!code) return NextResponse.json({ error: "Missing code" }, { status: 400 });
    if (!state) return NextResponse.json({ error: "Missing state" }, { status: 400 });

    // CSRF check
    const stateCookie = req.cookies.get("li_oauth_state")?.value || "";
    if (!stateCookie || stateCookie !== state) {
      return NextResponse.json(
        { error: "State mismatch (cookie missing/expired or different). Please Connect LinkedIn again." },
        { status: 400 }
      );
    }

    const redirectUri = `${safeBaseUrl(appUrl)}/api/oauth/linkedin/callback`;

    // Exchange code -> access token
    const tokenRes = await fetchJson("https://www.linkedin.com/oauth/v2/accessToken", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        client_id: clientId,
        client_secret: clientSecret,
      }).toString(),
    });

    if (!tokenRes.ok || !tokenRes.json?.access_token) {
      return NextResponse.json(
        { error: "LinkedIn token exchange failed", details: tokenRes.json },
        { status: 400 }
      );
    }

    const accessToken = String(tokenRes.json.access_token);
    const expiresIn = Number(tokenRes.json.expires_in || 0);
    const tokenExpiresAt = expiresIn ? toIsoFromNowSeconds(expiresIn) : null;

    // Get member identity (OIDC userinfo)
    const meRes = await fetchJson("https://api.linkedin.com/v2/userinfo", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!meRes.ok) {
      return NextResponse.json(
        {
          error: "LinkedIn userinfo failed (check openid/profile scopes)",
          details: meRes.json,
        },
        { status: 400 }
      );
    }

    const sub = meRes.json?.sub ? String(meRes.json.sub) : "";
    const name =
      (meRes.json?.name && String(meRes.json.name)) ||
      `${meRes.json?.given_name || ""} ${meRes.json?.family_name || ""}`.trim();

    if (!sub) {
      return NextResponse.json(
        { error: "LinkedIn userinfo missing sub", details: meRes.json },
        { status: 400 }
      );
    }

    // We store the author URN directly for posting
    const authorUrn = sub.startsWith("urn:li:person:") ? sub : `urn:li:person:${sub}`;

    // Resolve org (single-tenant beta)
    const organisationId = await getSingleTenantOrganisationId();
    if (!organisationId) {
      return NextResponse.json(
        {
          error:
            "No organisation found in database. Create one row in organisations, then try Connect LinkedIn again.",
        },
        { status: 400 }
      );
    }

    // Upsert social_accounts row for linkedin
    const { data: existing, error: existingErr } = await supabaseAdmin
      .from("social_accounts")
      .select("*")
      .eq("organisation_id", organisationId)
      .eq("platform", "linkedin")
      .limit(1)
      .maybeSingle();

    if (existingErr) {
      console.warn("[linkedin/callback] lookup warn", existingErr);
    }

    const payload = {
      page_id: authorUrn,
      page_name: name || "LinkedIn Member",
      connection_type: "linkedin_oauth",
      make_webhook_url: null,
      is_active: true,
      page_access_token: accessToken,
      token_expires_at: tokenExpiresAt,
    };

    if (existing?.id) {
      const { error: updErr } = await supabaseAdmin
        .from("social_accounts")
        .update(payload)
        .eq("id", existing.id);

      if (updErr) {
        return NextResponse.json(
          { error: "Failed to update LinkedIn social account", details: updErr },
          { status: 500 }
        );
      }
    } else {
      const { error: insErr } = await supabaseAdmin.from("social_accounts").insert({
        id: randomUUID(),
        organisation_id: organisationId,
        platform: "linkedin",
        // respect NOT NULL (we already have)
        page_id: authorUrn,
        page_name: name || null,
        connection_type: "linkedin_oauth",
        make_webhook_url: null,
        is_active: true,
        page_access_token: accessToken,
        token_expires_at: tokenExpiresAt,
      });

      if (insErr) {
        return NextResponse.json(
          { error: "Failed to insert LinkedIn social account", details: insErr },
          { status: 500 }
        );
      }
    }

    // Clear state cookie
    const res = NextResponse.redirect(
      `${safeBaseUrl(appUrl)}/dashboard/connect?provider=linkedin&success=1`,
      { status: 302 }
    );
    res.cookies.set("li_oauth_state", "", { path: "/", maxAge: 0 });

    return res;
  } catch (e: any) {
    console.error("[linkedin/callback] crash", e);
    return NextResponse.json(
      { error: e?.message || "LinkedIn callback crashed" },
      { status: 500 }
    );
  }
}
