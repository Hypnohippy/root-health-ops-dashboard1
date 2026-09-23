import { NextRequest, NextResponse } from "next/server";
import { createOAuthState } from "@/lib/oauthState";
import { accessErrorResponse } from "@/lib/tenantAuth";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const clientId = (process.env.TIKTOK_CLIENT_KEY || "").trim();
    const redirectUri = (process.env.TIKTOK_REDIRECT_URI || "").trim();
    if (!clientId || !redirectUri) return NextResponse.json({ error: "Missing tiktok client configuration." }, { status: 503 });
    const state = await createOAuthState("tiktok", req.nextUrl.searchParams.get("organisationId"));
    const authUrl = new URL("https://www.tiktok.com/v2/auth/authorize/");
    authUrl.searchParams.set("client_key", clientId);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("scope", "user.info.basic,video.upload,video.publish");
    authUrl.searchParams.set("state", state);

    return NextResponse.redirect(authUrl);
  } catch (error) {
    return accessErrorResponse(error) || NextResponse.json({ error: "Unable to start OAuth." }, { status: 500 });
  }
}
