import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "";
const FACEBOOK_APP_ID = process.env.FACEBOOK_APP_ID || "";

function baseUrl(req: NextRequest) {
  try {
    return APP_URL ? APP_URL.replace(/\/$/, "") : req.nextUrl.origin;
  } catch {
    return APP_URL ? APP_URL.replace(/\/$/, "") : "";
  }
}

export async function GET(req: NextRequest) {
  if (!FACEBOOK_APP_ID) {
    return NextResponse.json({ error: "Missing FACEBOOK_APP_ID" }, { status: 400 });
  }

  const redirectUri = `${baseUrl(req)}/api/oauth/facebook/callback`;

  // You can add more later, but keep it minimal for now
  const scope = ["pages_show_list", "pages_read_engagement", "pages_manage_posts"].join(",");

  const oauthUrl =
    "https://www.facebook.com/v19.0/dialog/oauth?" +
    new URLSearchParams({
      client_id: FACEBOOK_APP_ID,
      redirect_uri: redirectUri,
      response_type: "code",
      scope,
    }).toString();

  return NextResponse.redirect(oauthUrl, { status: 302 });
}
