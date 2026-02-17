// app/api/oauth/tiktok/start/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import crypto from "crypto";

export const runtime = "nodejs";

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || "").trim();

const TIKTOK_CLIENT_KEY = (process.env.TIKTOK_CLIENT_KEY || "").trim();
const TIKTOK_REDIRECT_URI = (process.env.TIKTOK_REDIRECT_URI || "").trim(); // must match TikTok app setting
const OAUTH_STATE_SECRET = (process.env.OAUTH_STATE_SECRET || "dev-secret").trim();

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

async function getOrganisationIdFallback(): Promise<string | null> {
  if (SINGLE_ORG_ID) return SINGLE_ORG_ID;

  const { data, error } = await supabaseAdmin
    .from("organisations")
    .select("id, created_at")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data?.id) return null;
  return String(data.id);
}

function b64urlEncode(str: string) {
  return Buffer.from(str, "utf8").toString("base64url");
}

function signState(payload: any) {
  const body = b64urlEncode(JSON.stringify(payload));
  const sigHex = crypto.createHmac("sha256", OAUTH_STATE_SECRET).update(body).digest("hex");
  const sig = Buffer.from(sigHex, "utf8").toString("base64url");
  return `${body}.${sig}`;
}

export async function GET(req: NextRequest) {
  const back = new URL(`${baseUrl(req)}/dashboard/connect`);
  back.searchParams.set("provider", "tiktok");

  try {
    if (!TIKTOK_CLIENT_KEY || !TIKTOK_REDIRECT_URI) {
      back.searchParams.set("error", "tiktok_missing_env");
      back.searchParams.set(
        "error_description",
        "Missing TIKTOK_CLIENT_KEY or TIKTOK_REDIRECT_URI in env."
      );
      return NextResponse.redirect(back.toString(), { status: 302 });
    }

    const url = new URL(req.url);
    const orgFromQuery = norm(url.searchParams.get("organisationId"));
    const organisationId = orgFromQuery || (await getOrganisationIdFallback());

    if (!organisationId) {
      back.searchParams.set("error", "no_organisation");
      back.searchParams.set("error_description", "No organisationId provided and none found.");
      return NextResponse.redirect(back.toString(), { status: 302 });
    }

    // ✅ Signed state carries org id through the OAuth roundtrip
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

    return NextResponse.redirect(authUrl.toString(), { status: 302 });
  } catch (e: any) {
    back.searchParams.set("error", "tiktok_start_failed");
    back.searchParams.set("error_description", e?.message || "unknown");
    return NextResponse.redirect(back.toString(), { status: 302 });
  }
}
