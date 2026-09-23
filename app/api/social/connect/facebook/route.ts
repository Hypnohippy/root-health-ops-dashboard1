import { createOAuthState } from "@/lib/oauthState";
import { accessErrorResponse } from "@/lib/tenantAuth";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

function getMetaAppId() {
  return (
    process.env.FACEBOOK_APP_ID ||
    process.env.META_APP_ID ||
    process.env.SOCIAL_API_CLIENT_ID ||
    ""
  ).trim();
}

export async function GET(req: NextRequest) {
  try {
  const origin = req.nextUrl.origin;
  const appId = getMetaAppId();

  if (!appId) {
    return NextResponse.redirect(
      `${origin}/dashboard/connect?error=facebook_missing_app_id`
    );
  }

  const redirectUri = `${origin}/api/social/callback/facebook`;

  const authUrl = new URL("https://www.facebook.com/v24.0/dialog/oauth");
  authUrl.searchParams.set("client_id", appId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set(
    "scope",
    [
      "pages_show_list",
      "pages_manage_posts",
      "business_management",
      "instagram_basic",
      "instagram_content_publish",
    ].join(",")
  );
  authUrl.searchParams.set("state", await createOAuthState("facebook", req.nextUrl.searchParams.get("organisationId")));

  return NextResponse.redirect(authUrl.toString());
  } catch (error) {
    return accessErrorResponse(error) || NextResponse.json({ error: "Unable to start OAuth." }, { status: 500 });
  }
}
