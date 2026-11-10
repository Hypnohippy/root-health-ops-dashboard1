import { NextRequest, NextResponse } from "next/server";
import { createOAuthState } from "@/lib/oauthState";
import { accessErrorResponse } from "@/lib/tenantAuth";

export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  try {
    const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID?.trim();
    const redirectUri = process.env.GOOGLE_CALENDAR_REDIRECT_URI?.trim();
    if (!clientId || !redirectUri || !process.env.GOOGLE_CALENDAR_CLIENT_SECRET?.trim() || !process.env.GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY?.trim()) {
      return NextResponse.json({ error: "Google Calendar is not configured." }, { status: 503 });
    }
    const state = await createOAuthState("google-calendar", request.nextUrl.searchParams.get("organisationId"));
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "openid https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/calendar.events.owned");
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("prompt", "consent");
    url.searchParams.set("state", state);
    return NextResponse.redirect(url);
  } catch (error) {
    return accessErrorResponse(error) || NextResponse.json({ error: "Unable to start Google Calendar connection." }, { status: 500 });
  }
}
