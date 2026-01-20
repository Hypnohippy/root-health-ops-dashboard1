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

async function fetchJson(url: string, opts?: RequestInit) {
  const res = await fetch(url, { cache: "no-store", ...(opts || {}) });
  const json: any = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, json };
}

// Single-tenant beta default
async function getSingleTenantOrganisationId() {
  const { data, error } = await supabaseAdmin.from("organisations").select("id").limit(1);
  if (error) {
    console.error("[threads-callback] organisations error", error);
    return null;
  }
  if (!data || data.length === 0) return null;
  return data[0].id as string;
}

export async function GET(req: NextRequest) {
  try {
    if (!THREADS_CLIENT_ID || !THREADS_CLIENT_SECRET) {
      const back = new URL(`${baseUrl(req)}/dashboard/connect`);
      back.searchParams.set("error", "threads_missing_env");
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

    // 1) Exchange code -> access token
    // Threads token exchange happens on graph.threads.net
    const tokenUrl =
      "https://graph.threads.net/oauth/access_token?" +
      new URLSearchParams({
        client_id: THREADS_CLIENT_ID,
        client_secret: THREADS_CLIENT_SECRET,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
        code,
      }).toString();

    const tok = await fetchJson(tokenUrl);

    if (!tok.ok || !tok.json?.access_token) {
      console.error("[threads-callback] token exchange failed", tok.json);
      const back = new URL(`${baseUrl(req)}/dashboard/connect`);
      back.searchParams.set("error", "threads_token_exchange_failed");
      return NextResponse.redirect(back.toString(), { status: 302 });
    }

    const accessToken = String(tok.json.access_token);

    // 2) Fetch threads user id (and username if available)
    const meUrl =
      "https://graph.threads.net/v1.0/me?" +
      new URLSearchParams({
        fields: "id,username",
        access_token: accessToken,
      }).toString();

    const me = await fetchJson(meUrl);

    if (!me.ok || !me.json?.id) {
      console.error("[threads-callback] /me failed", me.json);
      const back = new URL(`${baseUrl(req)}/dashboard/connect`);
      back.searchParams.set("error", "threads_me_failed");
      return NextResponse.redirect(back.toString(), { status: 302 });
    }

    const threadsUserId = String(me.json.id);
    const threadsUsername = me.json?.username ? String(me.json.username) : null;

    const organisationId = await getSingleTenantOrganisationId();
    if (!organisationId) {
      const back = new URL(`${baseUrl(req)}/dashboard/connect`);
      back.searchParams.set("error", "no_org");
      return NextResponse.redirect(back.toString(), { status: 302 });
    }

    // Upsert social_accounts row for threads
    const { data: existing } = await supabaseAdmin
      .from("social_accounts")
      .select("id")
      .eq("organisation_id", organisationId)
      .eq("platform", "threads")
      .limit(1);

    if (existing && existing.length > 0) {
      await supabaseAdmin
        .from("social_accounts")
        .update({
          page_id: threadsUserId,
          page_name: threadsUsername,
          connection_type: "threads_oauth",
          make_webhook_url: null,
          is_active: true,
          page_access_token: accessToken,
          token_expires_at: null,
        })
        .eq("id", existing[0].id);
    } else {
      await supabaseAdmin.from("social_accounts").insert({
        id: randomUUID(),
        organisation_id: organisationId,
        platform: "threads",
        page_id: threadsUserId,
        page_name: threadsUsername,
        connection_type: "threads_oauth",
        make_webhook_url: null,
        is_active: true,
        page_access_token: accessToken,
        token_expires_at: null,
      });
    }

    // Done
    const back = new URL(`${baseUrl(req)}/dashboard/connect`);
    back.searchParams.set("provider", "threads");
    back.searchParams.set("success", "1");
    if (state) back.searchParams.set("state", state);

    return NextResponse.redirect(back.toString(), { status: 302 });
  } catch (e: any) {
    console.error("[threads-callback] crashed", e);
    const back = new URL(`${baseUrl(req)}/dashboard/connect`);
    back.searchParams.set("error", "threads_callback_crashed");
    return NextResponse.redirect(back.toString(), { status: 302 });
  }
}
