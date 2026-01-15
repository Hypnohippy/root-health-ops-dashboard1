import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const url = new URL(req.url);

  const appId = process.env.FACEBOOK_APP_ID;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;

  if (!appId || !appUrl) {
    return NextResponse.json(
      { error: "Missing FACEBOOK_APP_ID or NEXT_PUBLIC_APP_URL" },
      { status: 500 }
    );
  }

  const organisationId = url.searchParams.get("organisationId") || "";
  if (!organisationId) {
    return NextResponse.json({ error: "Missing organisationId" }, { status: 400 });
  }

  const redirectUri = `${appUrl.replace(/\/$/, "")}/api/oauth/facebook/callback`;

  // Common Page permissions (your app may require review/approval for these)
  const scope = [
    "pages_show_list",
    "pages_read_engagement",
    "pages_manage_posts",
  ].join(",");

  const statePayload = {
    organisationId,
    nonce: crypto.randomUUID(),
    t: Date.now(),
  };

  const state = Buffer.from(JSON.stringify(statePayload)).toString("base64url");

  const authUrl = new URL("https://www.facebook.com/v19.0/dialog/oauth");
  authUrl.searchParams.set("client_id", appId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", scope);

  return NextResponse.redirect(authUrl.toString());
}
