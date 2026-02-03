import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";

export const runtime = "nodejs";

/**
 * SINGLE-TENANT / ENTERPRISE BETA MODE
 * -----------------------------------
 * Your product currently does not use Supabase Auth sessions.
 * So we cannot reliably know "which user" is calling.
 *
 * Therefore this endpoint returns the first organisation it finds
 * (or a specific org if NEXT_PUBLIC_SINGLE_ORG_ID is set),
 * and returns connected social accounts for that organisation.
 *
 * Later, when you add real per-subscriber auth, we will switch this
 * endpoint to use the logged-in user's organisationId.
 */

async function getOrganisationId(): Promise<string | null> {
  // Optional: force a specific org in Vercel env for safety
  const forced = (process.env.NEXT_PUBLIC_SINGLE_ORG_ID || "").trim();
  if (forced) return forced;

  const { data, error } = await supabaseAdmin
    .from("organisations")
    .select("id")
    .order("created_at", { ascending: true })
    .limit(1);

  if (error || !data || data.length === 0) return null;
  return String(data[0].id);
}

export async function GET(_req: NextRequest) {
  try {
    const organisationId = await getOrganisationId();
    if (!organisationId) {
      return NextResponse.json(
        { success: false, error: "No organisation found." },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("social_accounts")
      .select("platform,page_id,page_name,is_active,token_expires_at,updated_at")
      .eq("organisation_id", organisationId)
      .order("updated_at", { ascending: false });

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      organisationId,
      socialAccounts: data || [],
    });
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message || "Failed to load social accounts" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const platform = String(body?.platform || "").trim().toLowerCase();

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

    // Soft disconnect: set is_active false and blank token
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
