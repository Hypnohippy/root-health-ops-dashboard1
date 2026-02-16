// app/api/oauth/linkedin/start/route.ts
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";

export const runtime = "nodejs";

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || "").trim();
const LINKEDIN_CLIENT_ID = (process.env.LINKEDIN_CLIENT_ID || "").trim();

// ✅ Safe server-only org pin (prevents “saved to wrong org”)
const SINGLE_ORG_ID = (process.env.SINGLE_ORG_ID || "").trim();

function baseUrl(req: NextRequest) {
  return APP_URL ? APP_URL.replace(/\/$/, "") : req.nextUrl.origin;
}

export async function GET(req: NextRequest) {
  const back = new URL(`${baseUrl(req)}/dashboard/connect`);
  back.searchParams.set("provider", "linkedin");

  if (!LINKEDIN_CLIENT_ID) {
    back.searchParams.set("error", "linkedin_missing_client_id");
    return NextResponse.redirect(back.toString(), { status: 302 });
  }

  if (!SINGLE_ORG_ID) {
    back.searchParams.set("error", "missing_single_org_id");
    back.searchParams.set(
      "error_description",
      "Set SINGLE_ORG_ID in Vercel env to your active organisation id."
    );
    return NextResponse.redirect(back.toString(), { status: 302 });
  }

  const redirectUri = `${baseUrl(req)}/api/oauth/linkedin/callback`;

  const stateObj = {
    provider: "linkedin",
    organisationId: SINGLE_ORG_ID,
    nonce: randomUUID(),
    t: Date.now(),
  };
  const state = Buffer.from(JSON.stringify(stateObj)).toString("base64url");

  const authUrl = new URL("https://www.linkedin.com/oauth/v2/authorization");
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("client_id", LINKEDIN_CLIENT_ID);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("scope", ["openid", "profile", "email", "w_member_social"].join(" "));
  authUrl.searchParams.set("state", state);

  return NextResponse.redirect(authUrl.toString(), { status: 302 });
}
