import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { consumeOAuthState } from "@/lib/oauthState";
import { storeGoogleCalendarConnection } from "@/lib/diaryGoogleCalendar.server";

export const runtime = "nodejs";
function diaryUrl(request: NextRequest, organisationId?: string) {
  const base = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "") || request.nextUrl.origin;
  const url = new URL("/dashboard/diary", base);
  if (organisationId) url.searchParams.set("organisationId", organisationId);
  return url;
}

export async function GET(request: NextRequest) {
  let back = diaryUrl(request);
  try {
    const membership = await consumeOAuthState("google-calendar", request.nextUrl.searchParams.get("state"));
    back = diaryUrl(request, membership.organisationId);
    if (request.nextUrl.searchParams.get("error")) {
      back.searchParams.set("calendarError", "consent");
      return NextResponse.redirect(back);
    }
    const code = request.nextUrl.searchParams.get("code");
    const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID?.trim();
    const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET?.trim();
    const redirectUri = process.env.GOOGLE_CALENDAR_REDIRECT_URI?.trim();
    if (!code || !clientId || !clientSecret || !redirectUri) throw new Error("Calendar OAuth configuration is incomplete.");
    const oauth = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
    const { tokens } = await oauth.getToken(code);
    if (!tokens.refresh_token) throw new Error("Google did not return a refresh token. Revoke the previous Calendar grant and reconnect.");
    oauth.setCredentials(tokens);
    const profile = await google.oauth2({ auth: oauth, version: "v2" }).userinfo.get();
    const accountId = profile.data.id?.trim();
    if (!accountId) throw new Error("Google account identity was not returned.");
    await storeGoogleCalendarConnection({ organisationId: membership.organisationId, ownerUserId: membership.userId, accountId, email: profile.data.email || null, refreshToken: tokens.refresh_token });
    back.searchParams.set("calendarConnected", "1");
    return NextResponse.redirect(back);
  } catch {
    back.searchParams.set("calendarError", "connection");
    return NextResponse.redirect(back);
  }
}
