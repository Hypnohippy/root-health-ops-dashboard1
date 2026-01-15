import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const url = new URL(req.url);

  const clientId = process.env.LINKEDIN_CLIENT_ID;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;

  if (!clientId || !appUrl) {
    return NextResponse.json(
      { error: "Missing LINKEDIN_CLIENT_ID or NEXT_PUBLIC_APP_URL" },
      { status: 500 }
    );
  }

  const organisationId = url.searchParams.get("organisationId") || "";
  if (!organisationId) {
    return NextResponse.json(
      { error: "Missing organisationId" },
      { status: 400 }
    );
  }

  const redirectUri = `${appUrl.replace(/\/$/, "")}/api/oauth/linkedin/callback`;

  // Minimal scopes for sign-in + posting (LinkedIn may require app approval for posting scopes)
  const scope = [
    "openid",
    "profile",
    "email",
    "w_member_social",
  ].join(" ");

  const statePayload = {
    organisationId,
    nonce: crypto.randomUUID(),
    t: Date.now(),
  };

  const state = Buffer.from(JSON.stringify(statePayload)).toString("base64url");

  const authUrl = new URL("https://www.linkedin.com/oauth/v2/authorization");
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("scope", scope);
  authUrl.searchParams.set("state", state);

  return NextResponse.redirect(authUrl.toString());
}
