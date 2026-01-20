// app/api/oauth/linkedin/callback/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "";
const LINKEDIN_CLIENT_ID = process.env.LINKEDIN_CLIENT_ID || "";
const LINKEDIN_CLIENT_SECRET = process.env.LINKEDIN_CLIENT_SECRET || "";

function baseUrl(req: NextRequest) {
  try {
    return APP_URL ? APP_URL.replace(/\/$/, "") : req.nextUrl.origin;
  } catch {
    return APP_URL ? APP_URL.replace(/\/$/, "") : "";
  }
}

async function getSingleTenantOrganisationId() {
  const { data, error } = await supabaseAdmin
    .from("organisations")
    .select("id")
    .limit(1);

  if (error) {
    console.error("[linkedin-callback] organisations error", error);
    return null;
  }
  if (!data || data.length === 0) return null;
  return data[0].id as string;
}

async function upsertLinkedInAccount(args: {
  organisationId: string;
  memberId: string;
  displayName: string;
  accessToken: string;
  expiresAtISO: string | null;
}) {
  const { organisationId, memberId, displayName, accessToken, expiresAtISO } = args;

  // Check if exists
  const { data: existing, error: findErr } = await supabaseAdmin
    .from("social_accounts")
    .select("id")
    .eq("organisation_id", organisationId)
    .eq("platform", "linkedin")
    .limit(1)
    .maybeSingle();

  if (findErr) {
    console.error("[linkedin-callback] existing lookup error", findErr);
  }

  if (existing?.id) {
    const { error: updErr } = await supabaseAdmin
      .from("social_accounts")
      .update({
        page_id: memberId,
        page_name: displayName,
        connection_type: "linkedin_oauth",
        is_active: true,
        page_access_token: accessToken,
        token_expires_at: expiresAtISO,
      })
      .eq("id", existing.id);

    if (updErr) {
      console.error("[linkedin-callback] update error", updErr);
      throw new Error("Failed to update LinkedIn social account");
    }
    return;
  }

  // Insert
  const { error: insErr } = await supabaseAdmin.from("social_accounts").insert({
    organisation_id: organisationId,
    platform: "linkedin",
    page_id: memberId || "pending_member_id",
    page_name: displayName,
    connection_type: "linkedin_oauth",
    is_active: true,
    page_access_token: accessToken,
    token_expires_at: expiresAtISO,
  });

  if (insErr) {
    console.error("[linkedin-callback] insert error", insErr);
    throw new Error("Failed to create LinkedIn social account");
  }
}

export async function GET(req: NextRequest) {
  try {
    if (!LINKEDIN_CLIENT_ID || !LINKEDIN_CLIENT_SECRET) {
      return NextResponse.json(
        { error: "Missing LINKEDIN_CLIENT_ID or LINKEDIN_CLIENT_SECRET" },
        { status: 500 }
      );
    }

    const code = req.nextUrl.searchParams.get("code") || "";
    const state = req.nextUrl.searchParams.get("state") || "";

    if (!code) {
      return NextResponse.json({ error: "Missing code" }, { status: 400 });
    }

    // Minimal CSRF check (cookie must match state)
    const cookieState = req.cookies.get("oauth_state_linkedin")?.value || "";
    if (!cookieState || !state || cookieState !== state) {
      return NextResponse.json(
        { error: "Invalid state (CSRF check failed). Please try Connect again." },
        { status: 400 }
      );
    }

    const redirectUri = `${baseUrl(req)}/api/oauth/linkedin/callback`;

    // Exchange code -> access token
    const tokenRes = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        client_id: LINKEDIN_CLIENT_ID,
        client_secret: LINKEDIN_CLIENT_SECRET,
      }),
      cache: "no-store",
    });

    const tokenJson: any = await tokenRes.json().catch(() => null);

    if (!tokenRes.ok || !tokenJson?.access_token) {
      return NextResponse.json(
        { error: "LinkedIn token exchange failed", details: tokenJson },
        { status: 400 }
      );
    }

    const accessToken = String(tokenJson.access_token);
    const expiresInSec = Number(tokenJson.expires_in || 0);
    const expiresAtISO =
      expiresInSec > 0 ? new Date(Date.now() + expiresInSec * 1000).toISOString() : null;

    // Get member id + name for display
    const meRes = await fetch("https://api.linkedin.com/v2/me", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "X-Restli-Protocol-Version": "2.0.0",
      },
      cache: "no-store",
    });

    const meJson: any = await meRes.json().catch(() => null);

    if (!meRes.ok || !meJson?.id) {
      return NextResponse.json(
        { error: "LinkedIn /me failed", details: meJson },
        { status: 400 }
      );
    }

    const memberId = String(meJson.id);
    const first = meJson?.localizedFirstName || "";
    const last = meJson?.localizedLastName || "";
    const displayName = `LinkedIn: ${String(`${first} ${last}`).trim() || memberId}`;

    const organisationId = await getSingleTenantOrganisationId();
    if (!organisationId) {
      return NextResponse.json(
        { error: "No organisation found in database" },
        { status: 400 }
      );
    }

    await upsertLinkedInAccount({
      organisationId,
      memberId,
      displayName,
      accessToken,
      expiresAtISO,
    });

    // Clear state cookie
    const res = NextResponse.redirect(`${baseUrl(req)}/dashboard/connect?provider=linkedin&success=1`, {
      status: 302,
    });
    res.cookies.set("oauth_state_linkedin", "", {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });

    return res;
  } catch (e: any) {
    console.error("[linkedin-callback] crashed", e);
    return NextResponse.json(
      { error: e?.message || "LinkedIn callback crashed" },
      { status: 500 }
    );
  }
}
