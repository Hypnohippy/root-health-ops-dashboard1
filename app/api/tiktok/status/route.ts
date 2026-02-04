// app/api/tiktok/status/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

type TikTokStatusRequest = {
  organisationId?: string;
  organisation_id?: string;
  publishId?: string;
  publish_id?: string;
};

function supabaseService() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      "Missing Supabase env vars. Need NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY."
    );
  }

  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function loadTikTokToken(organisationId: string) {
  const supabase = supabaseService();

  const { data, error } = await supabase
    .from("social_accounts")
    .select("page_access_token, page_id, token_expires_at, is_active")
    .eq("organisation_id", organisationId)
    .eq("platform", "tiktok")
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (error) {
    return { ok: false as const, error: error.message, data: null };
  }

  const token = String((data as any)?.page_access_token || "").trim();
  const openId = String((data as any)?.page_id || "").trim();

  if (!token) {
    return {
      ok: false as const,
      error: "TikTok token missing in social_accounts (page_access_token).",
      data: null,
    };
  }

  return {
    ok: true as const,
    token,
    openId,
    token_expires_at: (data as any)?.token_expires_at || null,
  };
}

async function fetchTikTokStatus(accessToken: string, publishId: string) {
  const res = await fetch(
    "https://open.tiktokapis.com/v2/post/publish/status/fetch/",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ publish_id: publishId }),
      cache: "no-store",
    }
  );

  const json: any = await res.json().catch(() => null);

  return { ok: res.ok, status: res.status, json };
}

// Optional: makes browsers happy if they preflight
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST,OPTIONS,GET",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}

// Browser check helper
export async function GET() {
  return NextResponse.json({
    ok: true,
    route: "app/api/tiktok/status/route.ts",
    message: "Route is live. Use POST with { organisationId, publishId }.",
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as TikTokStatusRequest;

    const organisationId = String(
      body.organisationId || body.organisation_id || ""
    ).trim();

    const publishId = String(body.publishId || body.publish_id || "").trim();

    if (!organisationId) {
      return NextResponse.json(
        { ok: false, error: "Missing organisationId" },
        { status: 200 }
      );
    }

    if (!publishId) {
      return NextResponse.json(
        { ok: false, error: "Missing publishId" },
        { status: 200 }
      );
    }

    const acct = await loadTikTokToken(organisationId);
    if (!acct.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: acct.error,
          userMessage: "TikTok isn’t connected for this organisation.",
        },
        { status: 200 }
      );
    }

    const statusRes = await fetchTikTokStatus(acct.token, publishId);

    return NextResponse.json(
      {
        ok: true,
        organisationId,
        publishId,
        tiktokOk: statusRes.ok,
        status: statusRes.status,
        details: statusRes.json,
      },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "TikTok status route crashed." },
      { status: 200 }
    );
  }
}
