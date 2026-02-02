import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../../lib/supabaseAdmin";

export const runtime = "nodejs";

function safeBaseUrl(req: NextRequest) {
  const env = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
  return env || req.nextUrl.origin;
}

function randomState() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function getSingleTenantOrganisationId() {
  const { data, error } = await supabaseAdmin
    .from("organisations")
    .select("id")
    .limit(1);

  if (error || !data || data.length === 0) return null;
  return String(data[0].id);
}

export async function GET(req: NextRequest) {
  try {
    const clientKey = process.env.TIKTOK_CLIENT_KEY;
    if (!clientKey) {
      return NextResponse.json(
        { success: false, error: "Missing TIKTOK_CLIENT_KEY in env." },
        { status: 500 }
      );
    }

    const base = safeBaseUrl(req);
    const redirectUri = `${base}/api/oauth/tiktok/callback`;

    const organisationId = await getSingleTenantOrganisationId();
    if (!organisationId) {
      return NextResponse.json(
        { success: false, error: "No organisation found." },
        { status: 400 }
      );
    }

    const state = randomState();

    const packedState = Buffer.from(
      JSON.stringify({ s: state, org: organisationId })
    ).toString("base64url");

    const scope = ["user.info.basic"].join(",");

    const authorizeUrl =
      `https://www.tiktok.com/v2/auth/authorize/` +
      `?client_key=${encodeURIComponent(clientKey)}` +
      `&scope=${encodeURIComponent(scope)}` +
      `&response_type=code` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&state=${encodeURIComponent(packedState)}`;

    return NextResponse.redirect(authorizeUrl);
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message || "TikTok start failed" },
      { status: 500 }
    );
  }
}
