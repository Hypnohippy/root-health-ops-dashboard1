// app/api/social/callback/google/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { randomUUID } from "crypto";

export const runtime = "nodejs";

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || "").trim();
const GOOGLE_CLIENT_ID = (process.env.GOOGLE_CLIENT_ID || "").trim();
const GOOGLE_CLIENT_SECRET = (process.env.GOOGLE_CLIENT_SECRET || "").trim();
const GOOGLE_REDIRECT_URI = (process.env.GOOGLE_REDIRECT_URI || "").trim();

async function fetchJson(url: string, init?: RequestInit) {
  const res = await fetch(url, { cache: "no-store", ...(init || {}) });
  const json: any = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, json };
}

async function upsertGoogleSocialAccount(args: {
  organisationId: string;
  googleUserId: string;
  name?: string | null;
  accessToken: string;
  tokenExpiresAt?: string | null;
}) {
  const row = {
    organisation_id: args.organisationId,
    platform: "google",
    page_id: String(args.googleUserId),
    page_name: args.name ? String(args.name) : null,
    connection_type: "google_oauth",
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
  throw up.error;
}

export async function GET(req: NextRequest) {
  const back = new URL(`${APP_URL}/dashboard/connect`);
  back.searchParams.set("provider", "google");

  try {
    const code = req.nextUrl.searchParams.get("code") || "";
    const stateRaw = req.nextUrl.searchParams.get("state") || "";
    const state = JSON.parse(Buffer.from(stateRaw, "base64url").toString("utf8"));
    const organisationId = state?.organisationId || "";

    if (!code || !organisationId) {
      back.searchParams.set("error", "missing_code_or_org");
      return NextResponse.redirect(back.toString(), { status: 302 });
    }

    const tokenRes = await fetchJson("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: GOOGLE_REDIRECT_URI,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenRes.ok || !tokenRes.json?.access_token) {
      back.searchParams.set("error", "google_token_exchange_failed");
      return NextResponse.redirect(back.toString(), { status: 302 });
    }

    const accessToken = String(tokenRes.json.access_token);
    const expiresIn = Number(tokenRes.json.expires_in);
    const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    const userInfoRes = await fetchJson("https://www.googleapis.com/oauth2/v3/userinfo", {
      method: "GET",
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!userInfoRes.ok || !userInfoRes.json?.sub) {
      back.searchParams.set("error", "google_userinfo_failed");
      return NextResponse.redirect(back.toString(), { status: 302 });
    }

    const googleUserId = String(userInfoRes.json.sub);
    const name = userInfoRes.json.name || "Google User";

    await upsertGoogleSocialAccount({
      organisationId,
      googleUserId,
      name,
      accessToken,
      tokenExpiresAt,
    });

    back.searchParams.set("connected", "1");
    return NextResponse.redirect(back.toString(), { status: 302 });
  } catch (e: any) {
    back.searchParams.set("error", "google_callback_crashed");
    return NextResponse.redirect(back.toString(), { status: 302 });
  }
}
