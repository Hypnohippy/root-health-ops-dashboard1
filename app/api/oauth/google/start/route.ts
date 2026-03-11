import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const GOOGLE_CLIENT_ID = (process.env.GOOGLE_CLIENT_ID || "").trim();
const GOOGLE_REDIRECT_URI = (process.env.GOOGLE_REDIRECT_URI || "").trim();
const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || "").trim();

function baseUrl(req: NextRequest) {
  try {
    return APP_URL ? APP_URL.replace(/\/$/, "") : req.nextUrl.origin;
  } catch {
    return APP_URL ? APP_URL.replace(/\/$/, "") : "";
  }
}

export async function GET(req: NextRequest) {
  try {

    if (!GOOGLE_CLIENT_ID || !GOOGLE_REDIRECT_URI) {
      return NextResponse.json(
        { error: "Missing GOOGLE_CLIENT_ID or GOOGLE_REDIRECT_URI" },
        { status: 500 }
      );
    }

    const organisationId =
      req.nextUrl.searchParams.get("organisationId") || "";

    const statePayload = {
      organisationId,
      provider: "google",
      createdAt: Date.now()
    };

    const state = Buffer.from(
      JSON.stringify(statePayload)
    ).toString("base64url");

    const params = new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      redirect_uri: GOOGLE_REDIRECT_URI,
      response_type: "code",
      access_type: "offline",
      prompt: "consent",
      scope: [
        "openid",
        "https://www.googleapis.com/auth/userinfo.profile",
        "https://www.googleapis.com/auth/userinfo.email"
      ].join(" "),
      state
    });

    const authUrl =
      `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;

    return NextResponse.redirect(authUrl);

  } catch (error: any) {

    const back = new URL(`${baseUrl(req)}/dashboard/connect`);
    back.searchParams.set("provider", "google");
    back.searchParams.set("error", "google_start_failed");

    return NextResponse.redirect(back.toString(), { status: 302 });
  }
}
