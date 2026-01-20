// app/api/oauth/threads/callback/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

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

async function fetchJson(
  url: string,
  opts?: RequestInit
): Promise<{ ok: boolean; status: number; json: any }> {
  const res = await fetch(url, { cache: "no-store", ...(opts || {}) });
  const json: any = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, json };
}

async function getSingleTenantOrganisationId() {
  const { data, error } = await supabaseAdmin
    .from("organisations")
    .select("id")
    .limit(1);

  if (error) return null;
  if (!data || data.length === 0) return null;
  return data[0].id as string;
}

export async function GET(req: NextRequest) {
  try {
    if (!THREADS_CLIENT_ID || !THREADS_CLIENT_SECRET) {
      const back = new URL(`${baseUrl(req)}/dashboard/connect`);
      back.searchParams.set("provider", "threads");
      back.searchParams.set("error", "missing_threads_env");
      return NextResponse.redirect(back.toString(), { status: 302 });
    }

    const code = req.nextUrl.searchParams.get("code") || "";
    if (!code) {
      const back = new URL(`${baseUrl(req)}/dashboard/connect`);
      back.searchParams.set("provider", "threads");
      back.searchParams.set("error", "missing_code");
      return NextResponse.redirect(back.toString(), { status: 302 });
    }

    const redirectUri = `${baseUrl(req)}/api/oauth/threads/callback`;

    // Exchange code -> access token (Threads)
    // Endpoint documented by Threads OAuth examples. 
    const tokenUrl = "https://graph.threads.net/oauth/access_token";

    const tokenOut = await fetchJson(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: THREADS_CLIENT_ID,
        client_secret: THREADS_CLIENT_SECRET,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
        code,
      }).toString(),
    });

    const accessToken = String(tokenOut.json?.access_token || "");
    if (!tokenOut.ok || !accessToken) {
      const back = new URL(`${baseUrl(req)}/dashboard/connect`);
      back.searchParams.set("provider", "threads");
      back.searchParams.set("error", "token_exchange_failed");
      return NextResponse.redirect(back.toString(), { status: 302 });
    }

    // Get the Threads user identity
    // Threads Graph uses /me to get id/username. :contentReference[oaicite:2]{index=2}
    const meUrl =
      "https://graph.threads.net/v1.0/me?" +
      new URLSearchParams({
        fields: "id,username",
        access_token: accessToken,
      }).toString();

    const meOut = await fetchJson(meUrl);
    const threadsUserId = String(meOut.json?.id || "");
    const username = String(meOut.json?.username || "");

    if (!meOut.ok || !threadsUserId) {
      const back = new URL(`${baseUrl(req)}/dashboard/connect`);
      back.searchParams.set("provider", "threads");
      back.searchParams.set("error", "me_lookup_failed");
      return NextResponse.redirect(back.toString(), { status: 302 });
    }

    // Save to DB
    const organisationId = await getSingleTenantOrganisationId();
    if (!organisationId) {
      const back = new URL(`${baseUrl(req)}/dashboard/connect`);
      back.searchParams.set("provider", "threads");
      back.searchParams.set("error", "no_organisation");
      return NextResponse.redirect(back.toString(), { status: 302 });
    }

    // Upsert-ish (your table uses 1 row per org+platform)
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
          page_name: username || null,
          connection_type: "threads_oauth",
          make_webhook_url: null,
          is_active: true,
          page_access_token: accessToken,
          token_expires_at: null,
        })
        .eq("id", existing[0].id);
    } else {
      await supabaseAdmin.from("social_accounts").insert({
        organisation_id: organisationId,
        platform: "threads",
        page_id: threadsUserId,
        page_name: username || null,
        connection_type: "threads_oauth",
        make_webhook_url: null,
        is_active: true,
        page_access_token: accessToken,
        token_expires_at: null,
      });
    }

    const back = new URL(`${baseUrl(req)}/dashboard/connect`);
    back.searchParams.set("provider", "threads");
    back.searchParams.set("success", "1");
    return NextResponse.redirect(back.toString(), { status: 302 });
  } catch (e: any) {
    const back = new URL(`${baseUrl(req)}/dashboard/connect`);
    back.searchParams.set("provider", "threads");
    back.searchParams.set("error", e?.message || "threads_callback_failed");
    return NextResponse.redirect(back.toString(), { status: 302 });
  }
}
