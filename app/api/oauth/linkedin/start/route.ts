// app/api/oauth/linkedin/start/route.ts
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || "").trim();
const LINKEDIN_CLIENT_ID = (process.env.LINKEDIN_CLIENT_ID || "").trim();

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

export async function GET(req: NextRequest) {
  const back = new URL(`${baseUrl(req)}/dashboard/connect`);
  back.searchParams.set("provider", "linkedin");

  try {
    if (!LINKEDIN_CLIENT_ID) {
      back.searchParams.set("error", "linkedin_missing_client_id");
      back.searchParams.set("error_description", "Missing LINKEDIN_CLIENT_ID in Vercel env.");
      return NextResponse.redirect(back.toString(), { status: 302 });
    }

    // If UI passes organisationId, keep it in state (optional)
    const organisationId = norm(req.nextUrl.searchParams.get("organisationId") || "");

    const redirectUri = `${baseUrl(req)}/api/oauth/linkedin/callback`;

    const stateObj = {
      provider: "linkedin",
      organisationId: organisationId || null,
      nonce: crypto.randomUUID(),
      t: Date.now(),
    };

    const state = Buffer.from(JSON.stringify(stateObj)).toString("base64url");

    const authUrl =
      "https://www.linkedin.com/oauth/v2/authorization?" +
      new URLSearchParams({
        response_type: "code",
        client_id: LINKEDIN_CLIENT_ID,
        redirect_uri: redirectUri,
        scope: "openid profile email w_member_social",
        state,
      }).toString();

    return NextResponse.redirect(authUrl, { status: 302 });
  } catch (e: any) {
    back.searchParams.set("error", "linkedin_start_crashed");
    back.searchParams.set("error_description", e?.message || "unknown");
    return NextResponse.redirect(back.toString(), { status: 302 });
  }
}
