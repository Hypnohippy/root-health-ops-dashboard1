import { NextRequest, NextResponse } from "next/server";
import { createOAuthState } from "@/lib/oauthState";
import { accessErrorResponse } from "@/lib/tenantAuth";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const origin = (process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin).replace(/\/$/, "");
    const clientId = (process.env.FACEBOOK_APP_ID || process.env.META_APP_ID || "").trim();
    const redirectUri = (process.env.META_FACEBOOK_REDIRECT_URI || "").trim() || origin + "/api/oauth/facebook/callback";
    if (!clientId) return NextResponse.json({ error: "Missing facebook client configuration." }, { status: 503 });
    const state = await createOAuthState("facebook", req.nextUrl.searchParams.get("organisationId"));
    const authUrl = new URL("https://www.facebook.com/v24.0/dialog/oauth");
    authUrl.searchParams.set("client_id", clientId);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("scope", "pages_show_list,pages_read_engagement,pages_manage_posts,business_management,instagram_basic,instagram_content_publish");
    authUrl.searchParams.set("state", state);

    return NextResponse.redirect(authUrl);
  } catch (error) {
    return accessErrorResponse(error) || NextResponse.json({ error: "Unable to start OAuth." }, { status: 500 });
  }
}
