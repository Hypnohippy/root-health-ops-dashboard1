import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../../../lib/supabaseServer";
import { supabaseService } from "../../../../../lib/supabaseService";

export const runtime = "nodejs";

function safeBaseUrl(req: NextRequest) {
  const env = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
  return env || req.nextUrl.origin;
}

function packState(orgId: string) {
  return Buffer.from(JSON.stringify({ org: orgId })).toString("base64url");
}

async function getOrganisationIdForCurrentUser(): Promise<string | null> {
  // 1) Get current user from Supabase auth cookies (server client)
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user?.id) return null;

  const userId = data.user.id;

  // 2) Use service role to find their organisation (bypasses RLS recursion)
  const { data: rows, error: memErr } = await supabaseService
    .from("organisation_members")
    .select("organisation_id")
    .eq("user_id", userId)
    .limit(1);

  if (memErr) return null;
  const orgId = rows?.[0]?.organisation_id ? String(rows[0].organisation_id) : null;
  return orgId;
}

export async function GET(req: NextRequest) {
  try {
    const clientKey = process.env.TIKTOK_CLIENT_KEY;

    if (!clientKey) {
      return NextResponse.json(
        { success: false, error: "Missing TIKTOK_CLIENT_KEY in env." },
        { status: 500 }
      );
    }

    const base = safeBaseUrl(req);
    const redirectUri = `${base}/api/oauth/tiktok/callback`;

    // IMPORTANT: per-user org
    const organisationId = await getOrganisationIdForCurrentUser();
    if (!organisationId) {
      return NextResponse.json(
        {
          success: false,
          error:
            "No organisation found for this user. (User must be logged in and a member of an organisation.)",
        },
        { status: 400 }
      );
    }

    const state = packState(organisationId);
    const scope = ["user.info.basic"].join(",");

    const authorizeUrl =
      `https://www.tiktok.com/v2/auth/authorize/` +
      `?client_key=${encodeURIComponent(clientKey)}` +
      `&scope=${encodeURIComponent(scope)}` +
      `&response_type=code` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&state=${encodeURIComponent(state)}`;

    return NextResponse.redirect(authorizeUrl);
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message || "TikTok start failed" },
      { status: 500 }
    );
  }
}
