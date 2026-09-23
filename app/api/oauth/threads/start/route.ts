import { NextRequest, NextResponse } from "next/server";
import { createOAuthState } from "@/lib/oauthState";
import { accessErrorResponse } from "@/lib/tenantAuth";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const origin = (process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin).replace(/\/$/, "");
    const clientId = (process.env.THREADS_CLIENT_ID || "").trim();
    const redirectUri = origin + "/api/oauth/threads/callback";
    if (!clientId) return NextResponse.json({ error: "Missing threads client configuration." }, { status: 503 });
    const state = await createOAuthState("threads", req.nextUrl.searchParams.get("organisationId"));
    const authUrl = new URL("https://threads.net/oauth/authorize");
    authUrl.searchParams.set("client_id", clientId);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("scope", "threads_basic,threads_content_publish");
    authUrl.searchParams.set("state", state);

    return NextResponse.redirect(authUrl);
  } catch (error) {
    return accessErrorResponse(error) || NextResponse.json({ error: "Unable to start OAuth." }, { status: 500 });
  }
}
