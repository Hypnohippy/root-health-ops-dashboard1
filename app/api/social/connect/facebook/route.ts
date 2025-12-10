// app/api/social/connect/facebook/route.ts
import { NextResponse } from "next/server";

/**
 * START FACEBOOK OAUTH FLOW
 *
 * This route sends the user to your social posting provider’s OAuth page.
 *
 * For now it uses placeholder URLs. We will swap these for your provider
 * (Ayrshare, or another) once chosen.
 */

export async function GET() {
  // TODO: Replace with real OAuth provider later
  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/social/callback/facebook`;

  // Fake external authorization endpoint (placeholder)
  const authUrl = new URL("https://example-social-provider.com/oauth/authorize");
  authUrl.searchParams.set("client_id", process.env.SOCIAL_API_CLIENT_ID || "");
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", "facebook");
  authUrl.searchParams.set("state", "facebook-oauth");

  return NextResponse.redirect(authUrl.toString());
}
