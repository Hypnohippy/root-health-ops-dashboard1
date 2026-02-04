// app/api/oauth/tiktok/start/route.ts
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

// TikTok OAuth (v2)
const TIKTOK_CLIENT_KEY = process.env.TIKTOK_CLIENT_KEY || "";
const TIKTOK_CLIENT_SECRET = process.env.TIKTOK_CLIENT_SECRET || "";
const TIKTOK_REDIRECT_URI = process.env.TIKTOK_REDIRECT_URI || ""; // e.g. https://<domain>/api/oauth/tiktok/callback
const OAUTH_STATE_SECRET = process.env.OAUTH_STATE_SECRET || "dev-secret";

// Service client (NO supabaseAdmin import)
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

function b64urlEncode(str: string) {
  return Buffer.from(str, "utf8").toString("base64url");
}

function b64urlDecode(str: string) {
  return Buffer.from(str, "base64url").toString("utf8");
}

function signState(payload: any) {
  const body = b64urlEncode(JSON.stringify(payload));
  const sig = b64urlEncode(
    require("crypto").createHmac("sha256", OAUTH_STATE_SECRET).update(body).digest("hex")
  );
  return `${body}.${sig}`;
}

function verifyState(state: string) {
  const [body, sig] = String(state || "").split(".");
  if (!body || !sig) return null;

  const expected = b64urlEncode(
    require("crypto").createHmac("sha256", OAUTH_STATE_SECRET).update(body).digest("hex")
  );

  if (expected !== sig) return null;
  try {
    return JSON.parse(b64urlDecode(body));
  } catch {
    return null;
  }
}

async function getSingleTenantOrganisationId(service: any): Promise<string | null> {
  const { data, error } = await service.from("organisations").select("id").limit(1);
  if (error || !data || data.length === 0) return null;
  return String(data[0].id);
}

async function getOrganisationIdForUser(service: any, userId: string): Promise<string | null> {
  // Try common membership table names — whichever exists in your DB will work.
  const candidates = ["organisation_members", "organisation_users", "org_members"];

  for (const table of candidates) {
    const { data, error } = await service
      .from(table)
      .select("organisation_id")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();

    if (!error && data?.organisation_id) return String(data.organisation_id);
  }

  return null;
}

export async function GET(req: NextRequest) {
  try {
    if (!TIKTOK_CLIENT_KEY || !TIKTOK_CLIENT_SECRET || !TIKTOK_REDIRECT_URI) {
      return NextResponse.json(
        { success: false, error: "TikTok OAuth not configured (missing env vars)." },
        { status: 500 }
      );
    }

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json(
        { success: false, error: "Supabase service env vars missing (URL or SERVICE_ROLE_KEY)." },
        { status: 500 }
      );
    }

    // Auth client (reads browser cookies properly)
    const supabaseAuth = createRouteHandlerClient({ cookies });
    const { data: userData } = await supabaseAuth.auth.getUser();
    const user = userData?.user || null;

    // If not logged in, redirect to login instead of showing JSON error
    if (!user) {
      const origin = req.nextUrl.origin;
      return NextResponse.redirect(`${origin}/login?next=/dashboard/connect`);
    }

    // Service client for DB queries/upserts
    const service = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    // Resolve org
    const url = new URL(req.url);
    const orgFromQuery = (url.searchParams.get("organisationId") || "").trim();

    let organisationId =
      orgFromQuery ||
      (await getOrganisationIdForUser(service, user.id)) ||
      (await getSingleTenantOrganisationId(service));

    if (!organisationId) {
      return NextResponse.json(
        { success: false, error: "No organisation found for this user (and no single-tenant org fallback)." },
        { status: 400 }
      );
    }

    // Build signed state
    const statePayload = {
      provider: "tiktok",
      organisationId,
      userId: user.id,
      nonce: require("crypto").randomUUID(),
      t: Date.now(),
    };

    const state = signState(statePayload);

    // TikTok scopes (posting)
    // NOTE: exact scopes depend on your TikTok app approval.
    const scope = [
      "user.info.basic",
      "video.upload",
      "video.publish",
    ].join(",");

    const authUrl = new URL("https://www.tiktok.com/v2/auth/authorize/");
    authUrl.searchParams.set("client_key", TIKTOK_CLIENT_KEY);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("scope", scope);
    authUrl.searchParams.set("redirect_uri", TIKTOK_REDIRECT_URI);
    authUrl.searchParams.set("state", state);

    return NextResponse.redirect(authUrl.toString());
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || "TikTok start failed" }, { status: 500 });
  }
}
