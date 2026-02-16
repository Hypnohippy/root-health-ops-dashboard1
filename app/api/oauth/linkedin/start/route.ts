// app/api/oauth/linkedin/start/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { randomUUID } from "crypto";

export const runtime = "nodejs";

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || "").trim();
const LINKEDIN_CLIENT_ID = (process.env.LINKEDIN_CLIENT_ID || "").trim();

function baseUrl(req: NextRequest) {
  return APP_URL ? APP_URL.replace(/\/$/, "") : req.nextUrl.origin;
}

async function getLatestOrganisationId() {
  const { data, error } = await supabaseAdmin
    .from("organisations")
    .select("id, created_at")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return null;
  return data?.id ? String(data.id) : null;
}

export async function GET(req: NextRequest) {
  const back = new URL(`${baseUrl(req)}/dashboard/connect`);
  back.searchParams.set("provider", "linkedin");

  if (!LINKEDIN_CLIENT_ID) {
    back.searchParams.set("error", "linkedin_missing_client_id");
    return NextResponse.redirect(back.toString(), { status: 302 });
  }

  const organisationId = await getLatestOrganisationId();
  if (!organisationId) {
    back.searchParams.set("error", "no_organisation");
    return NextResponse.redirect(back.toString(), { status: 302 });
  }

  const redirectUri = `${baseUrl(req)}/api/oauth/linkedin/callback`;

  // Store orgId in state so callback never “saves to the wrong org”
  const stateObj = {
    provider: "linkedin",
    organisationId,
    nonce: randomUUID(),
    t: Date.now(),
  };
  const state = Buffer.from(JSON.stringify(stateObj)).toString("base64url");

  const authUrl = new URL("https://www.linkedin.com/oauth/v2/authorization");
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("client_id", LINKEDIN_CLIENT_ID);
  authUrl.searchParams.set("redirect_uri", redirectUri);

  // Keep it simple: enough for posting as member and getting basic identity
  authUrl.searchParams.set(
    "scope",
    [
      "openid",
      "profile",
      "email",
      "w_member_social",
    ].join(" ")
  );

  authUrl.searchParams.set("state", state);

  return NextResponse.redirect(authUrl.toString(), { status: 302 });
}
