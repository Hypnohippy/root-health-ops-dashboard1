import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";

export const runtime = "nodejs";

function normPlatform(p: any) {
  return String(p || "").trim().toLowerCase();
}

async function getOrganisationId(): Promise<string | null> {
  // Optional: force a specific org via env var (useful in beta)
  const forced =
    (process.env.NEXT_PUBLIC_SINGLE_ORG_ID || "").trim() ||
    (process.env.SINGLE_ORG_ID || "").trim();

  if (forced) return forced;

  // Fallback: MOST RECENT org
  const { data, error } = await supabaseAdmin
    .from("organisations")
    .select("id, created_at")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data?.id) return null;
  return String(data.id);
}

/**
 * GET /api/social-accounts
 * Returns SAFE connection state WITHOUT exposing tokens
 */
export async function GET(_req: NextRequest) {
  try {
    const organisationId = await getOrganisationId();
    if (!organisationId) {
      return NextResponse.json(
        { success: false, error: "No organisation found." },
        { status: 400 }
      );
    }

    // ✅ We select page_access_token ONLY to compute has_token
    // ✅ We do NOT return the token to the client.
    const { data, error } = await supabaseAdmin
      .from("social_accounts")
      .select(
        "platform,page_id,page_name,is_active,token_expires_at,updated_at,created_at,page_access_token"
      )
      .eq("organisation_id", organisationId)
      .order("updated_at", { ascending: false });

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    const safe = (data || []).map((row: any) => {
      const tok = String(row?.page_access_token || "").trim();
      const has_token = !!tok;

      return {
        organisation_id: organisationId,
        platform: String(row?.platform || "").toLowerCase(),
        page_id: row?.page_id ?? null,
        page_name: row?.page_name ?? null,
        is_active: !!row?.is_active,
        token_expires_at: row?.token_expires_at ?? null,
        updated_at: row?.updated_at ?? null,
        created_at: row?.created_at ?? null,

        // ✅ what the UI actually needs
        has_token,
        token_state: has_token ? "HAS_TOKEN" : "NO_TOKEN",
      };
    });

    return NextResponse.json({
      success: true,
      organisationId,
      socialAccounts: safe,
    });
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message || "Failed to load social accounts" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/social-accounts
 * Upserts a social account row (token stored server-side)
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({} as any));

    const platform = normPlatform(body?.platform);
    if (!platform) {
      return NextResponse.json(
        { success: false, error: "Missing platform." },
        { status: 400 }
      );
    }

    const organisationId = await getOrganisationId();
    if (!organisationId) {
      return NextResponse.json(
        { success: false, error: "No organisation found." },
        { status: 400 }
      );
    }

    const page_id = body?.page_id ? String(body.page_id).trim() : null;
    const page_name = body?.page_name ? String(body.page_name).trim() : null;

    // Token stored server-side only
    const page_access_token = body?.page_access_token
      ? String(body.page_access_token).trim()
      : null;

    const token_expires_at =
      body?.token_expires_at === null || body?.token_expires_at === undefined
        ? null
        : String(body.token_expires_at).trim() || null;

    const is_active = body?.is_active === false ? false : true;

    const now = new Date().toISOString();

    // 1) Try update
    const { data: updated, error: uErr } = await supabaseAdmin
      .from("social_accounts")
      .update({
        page_id,
        page_name,
        page_access_token,
        token_expires_at,
        is_active,
        updated_at: now,
      })
      .eq("organisation_id", organisationId)
      .eq("platform", platform)
      .select("platform,page_id,page_name,is_active,token_expires_at,updated_at,created_at,page_access_token")
      .maybeSingle();

    if (!uErr && updated) {
      const tok = String(updated?.page_access_token || "").trim();
      return NextResponse.json({
        success: true,
        organisationId,
        saved: true,
        socialAccount: {
          platform: updated.platform,
          page_id: updated.page_id,
          page_name: updated.page_name,
          is_active: updated.is_active,
          token_expires_at: updated.token_expires_at,
          updated_at: updated.updated_at,
          created_at: updated.created_at,
          has_token: !!tok,
          token_state: tok ? "HAS_TOKEN" : "NO_TOKEN",
        },
        mode: "updated",
      });
    }

    // 2) Insert
    const { data: inserted, error: iErr } = await supabaseAdmin
      .from("social_accounts")
      .insert({
        organisation_id: organisationId,
        platform,
        page_id,
        page_name,
        page_access_token,
        token_expires_at,
        is_active,
        created_at: now,
        updated_at: now,
      })
      .select("platform,page_id,page_name,is_active,token_expires_at,updated_at,created_at,page_access_token")
      .single();

    if (iErr) {
      return NextResponse.json(
        { success: false, error: iErr.message },
        { status: 500 }
      );
    }

    const tok = String(inserted?.page_access_token || "").trim();

    return NextResponse.json({
      success: true,
      organisationId,
      saved: true,
      socialAccount: {
        platform: inserted.platform,
        page_id: inserted.page_id,
        page_name: inserted.page_name,
        is_active: inserted.is_active,
        token_expires_at: inserted.token_expires_at,
        updated_at: inserted.updated_at,
        created_at: inserted.created_at,
        has_token: !!tok,
        token_state: tok ? "HAS_TOKEN" : "NO_TOKEN",
      },
      mode: "inserted",
    });
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message || "Failed to save social account" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/social-accounts
 * Soft disconnect:
 * - is_active=false
 * - clears token + expiry
 */
export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({} as any));
    const platform = normPlatform(body?.platform);

    if (!platform) {
      return NextResponse.json(
        { success: false, error: "Missing platform." },
        { status: 400 }
      );
    }

    const organisationId = await getOrganisationId();
    if (!organisationId) {
      return NextResponse.json(
        { success: false, error: "No organisation found." },
        { status: 400 }
      );
    }

    const { error } = await supabaseAdmin
      .from("social_accounts")
      .update({
        is_active: false,
        page_access_token: null,
        token_expires_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("organisation_id", organisationId)
      .eq("platform", platform);

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message || "Disconnect failed" },
      { status: 500 }
    );
  }
}
