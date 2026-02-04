// app/api/oauth/tiktok/start/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

export const runtime = "nodejs";

const TIKTOK_CLIENT_KEY = process.env.TIKTOK_CLIENT_KEY || "";
const TIKTOK_REDIRECT_URI = process.env.TIKTOK_REDIRECT_URI || ""; // e.g. https://root-health-ops-dashboard1.vercel.app/api/oauth/tiktok/callback
const OAUTH_STATE_SECRET = process.env.OAUTH_STATE_SECRET || "dev-secret";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

function b64urlEncode(str: string) {
  return Buffer.from(str, "utf8").toString("base64url");
}

function signState(payload: any) {
  const body = b64urlEncode(JSON.stringify(payload));
  const sig = Buffer.from(
    crypto.createHmac("sha256", OAUTH_STATE_SECRET).update(body).digest("hex"),
    "utf8"
  ).toString("base64url");
  return `${body}.${sig}`;
}

async function getSingleTenantOrganisationId(service: any): Promise<string | null> {
  const { data, error } = await service.from("organisations").select("id").limit(1);
  if (error || !data || data.length === 0) return null;
  return String(data[0].id);
}

export async function GET(req: NextRequest) {
  try {
    if (!TIKTOK_CLIENT_KEY || !TIKTOK_REDIRECT_URI) {
      return NextResponse.json(
        { success: false, error: "TikTok OAuth not configured (missing TIKTOK_CLIENT_KEY or TIKTOK_REDIRECT_URI)." },
        { status: 500 }
      );
    }

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json(
        { success: false, error: "Supabase env vars missing (NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY)." },
        { status: 500 }
      );
    }

    // Service client (no auth-helpers, no cookies needed)
    const service = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const url = new URL(req.url);
    const orgFromQuery = (url.searchParams.get("organisationId") || "").trim();
    const organisationId = orgFromQuery || (await getSingleTenantOrganisationId(service));

    if (!organisationId) {
      return NextResponse.json(
        { success: false, error: "No organisationId provided and no single-tenant org found." },
        { status: 400 }
      );
    }

    // Signed state carries org id through the OAuth roundtrip
    const state = signState({
      provider: "tiktok",
      organisationId,
      nonce: crypto.randomUUID(),
      t: Date.now(),
    });

    // TikTok scopes — your app must be approved for posting scopes
    const scope = ["user.info.basic", "video.upload", "video.publish"].join(",");

    const authUrl = new URL("https://www.tiktok.com/v2/auth/authorize/");
    authUrl.searchParams.set("client_key", TIKTOK_CLIENT_KEY);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("scope", scope);
    authUrl.searchParams.set("redirect_uri", TIKTOK_REDIRECT_URI);
    authUrl.searchParams.set("state", state);

    return NextResponse.redirect(authUrl.toString());
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message || "TikTok start failed" },
      { status: 500 }
    );
  }
}
