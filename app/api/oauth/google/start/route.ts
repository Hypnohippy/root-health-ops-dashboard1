import { NextRequest, NextResponse } from "next/server";
import { createOAuthState } from "@/lib/oauthState";
import { accessErrorResponse } from "@/lib/tenantAuth";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const clientId = (process.env.GOOGLE_CLIENT_ID || "").trim();
    const redirectUri = (process.env.GOOGLE_REDIRECT_URI || "").trim();
    if (!clientId || !redirectUri) return NextResponse.json({ error: "Missing google client configuration." }, { status: 503 });
    const state = await createOAuthState("google", req.nextUrl.searchParams.get("organisationId"));
    const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authUrl.searchParams.set("client_id", clientId);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("scope", "openid https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email");
    authUrl.searchParams.set("state", state);
    authUrl.searchParams.set("access_type", "offline");
    authUrl.searchParams.set("prompt", "consent");
    return NextResponse.redirect(authUrl);
  } catch (error) {
    return accessErrorResponse(error) || NextResponse.json({ error: "Unable to start OAuth." }, { status: 500 });
  }
}
