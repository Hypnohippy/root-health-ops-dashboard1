// app/api/oauth/linkedin/callback/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { randomUUID } from "crypto";

export const runtime = "nodejs";

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
const LINKEDIN_CLIENT_ID = process.env.LINKEDIN_CLIENT_ID || "";
const LINKEDIN_CLIENT_SECRET = process.env.LINKEDIN_CLIENT_SECRET || "";

function baseUrl(req: NextRequest) {
  return APP_URL || req.nextUrl.origin;
}

async function getSingleTenantOrganisationId() {
  const { data, error } = await supabaseAdmin
    .from("organisations")
    .select("id")
    .limit(1);

  if (error) {
    console.error("[linkedin-callback] organisations error", error);
    return null;
  }
  if (!data || data.length === 0) return null;
  return data[0].id as string;
}

async function upsertLinkedInAccount(args: {
  organisationId: string;
  memberId: string;
  memberName: string;
  accessToken: string;
  expiresInSeconds: number | null;
}) {
  const expiresAtIso =
    typeof args.expiresInSeconds === "number" && args.expiresInSeconds > 0
      ? new Date(Date.now() + args.expiresInSeconds * 1000).toISOString()
      : null;

  const { data: existing } = await supabaseAdmin
    .from("social_accounts")
    .select("id")
    .eq("organisation_id", args.organisationId)
    .eq("platform", "linkedin")
    .limit(1);

  if (existing && existing.length > 0) {
    const id = existing[0].id;
    await supabaseAdmin
      .from("social_accounts")
      .update({
        page_id: args.memberId,
        page_name: args.memberName || null,
        connection_type: "linkedin_oauth",
        make_webhook_url: null,
        is_active: true,
        page_access_token: args.accessToken,
        token_expires_at: expiresAtIso,
      })
      .eq("id", id);

    return;
  }

  await supabaseAdmin.from("social_accounts").insert({
    id: randomUUID(),
    organisation_id: args.organisationId,
    platform: "linkedin",
    page_id: args.memberId || "pending_page_id",
    page_name: args.memberName || null,
    connection_type: "linkedin_oauth",
    make_webhook_url: null,
    is_active: true,
    page_access_token: args.accessToken,
    token_expires_at: expiresAtIso,
  });
}

export async function GET(req: NextRequest) {
  try {
    const back = new URL(`${baseUrl(req)}/dashboard/connect`);

    // LinkedIn may return ?error=... instead of ?code=...
    const error = req.nextUrl.searchParams.get("error") || "";
    const errorDescription =
      req.nextUrl.searchParams.get("error_description") || "";

    if (error) {
      back.searchParams.set("provider", "linkedin");
      back.searchParams.set("error", error);
      if (errorDescription) back.searchParams.set("error_description", errorDescription);
      return NextResponse.redirect(back.toString(), { status: 302 });
    }

    const code = req.nextUrl.searchParams.get("code") || "";
    const state = req.nextUrl.searchParams.get("state") || "";

    if (!code) {
      back.searchParams.set("provider", "linkedin");
      back.searchParams.set("error", "missing_code");
      return NextResponse.redirect(back.toString(), { status: 302 });
    }

    // Optional CSRF check if your start route set a cookie
    const cookieState = req.cookies.get("oauth_state_linkedin")?.value || "";
    if (cookieState && state && cookieState !== state) {
      back.searchParams.set("provider", "linkedin");
      back.searchParams.set("error", "state_mismatch");
      return NextResponse.redirect(back.toString(), { status: 302 });
    }

    if (!LINKEDIN_CLIENT_ID || !LINKEDIN_CLIENT_SECRET) {
      back.searchParams.set("provider", "linkedin");
      back.searchParams.set("error", "missing_linkedin_env");
      return NextResponse.redirect(back.toString(), { status: 302 });
    }

    const redirectUri = `${baseUrl(req)}/api/oauth/linkedin/callback`;

    // Exchange code -> access token
    const tokenRes = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        client_id: LINKEDIN_CLIENT_ID,
        client_secret: LINKEDIN_CLIENT_SECRET,
      }),
      cache: "no-store",
    });

    const tokenJson: any = await tokenRes.json().catch(() => null);

    if (!tokenRes.ok || !tokenJson?.access_token) {
      console.error("[linkedin-callback] token exchange failed", tokenJson);
      back.searchParams.set("provider", "linkedin");
      back.searchParams.set("error", "token_exchange_failed");
      return NextResponse.redirect(back.toString(), { status: 302 });
    }

    const accessToken = String(tokenJson.access_token);
    const expiresIn = typeof tokenJson.expires_in === "number" ? tokenJson.expires_in : null;

    // Get member id via OIDC userinfo (works with openid/profile scopes)
    const meRes = await fetch("https://api.linkedin.com/v2/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });

    const meJson: any = await meRes.json().catch(() => null);

    if (!meRes.ok || !meJson?.sub) {
      console.error("[linkedin-callback] userinfo failed", meJson);
      back.searchParams.set("provider", "linkedin");
      back.searchParams.set("error", "userinfo_failed");
      return NextResponse.redirect(back.toString(), { status: 302 });
    }

    const memberId = String(meJson.sub);
    const memberName =
      [meJson.given_name, meJson.family_name].filter(Boolean).join(" ").trim() ||
      String(meJson.name || "");

    const organisationId = await getSingleTenantOrganisationId();
    if (!organisationId) {
      back.searchParams.set("provider", "linkedin");
      back.searchParams.set("error", "no_organisation");
      return NextResponse.redirect(back.toString(), { status: 302 });
    }

    await upsertLinkedInAccount({
      organisationId,
      memberId,
      memberName,
      accessToken,
      expiresInSeconds: expiresIn,
    });

    // Clean redirect back to Connect page
    back.searchParams.set("provider", "linkedin");
    back.searchParams.set("connected", "1");
    return NextResponse.redirect(back.toString(), { status: 302 });
  } catch (e: any) {
    console.error("[linkedin-callback] crashed", e);
    const back = new URL(`${baseUrl(req)}/dashboard/connect`);
    back.searchParams.set("provider", "linkedin");
    back.searchParams.set("error", "callback_crashed");
    return NextResponse.redirect(back.toString(), { status: 302 });
  }
}
