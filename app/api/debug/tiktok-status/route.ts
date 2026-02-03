import { NextRequest, NextResponse } from "next/server";
import { supabaseService } from "../../../../lib/supabaseService";

export const runtime = "nodejs";

export async function GET(_req: NextRequest) {
  try {
    // single-tenant: take the first org
    const { data: orgs, error: orgErr } = await supabaseService
      .from("organisations")
      .select("id")
      .limit(1);

    if (orgErr) {
      return NextResponse.json(
        { success: false, error: `Org lookup failed: ${orgErr.message}` },
        { status: 500 }
      );
    }

    const organisationId = orgs?.[0]?.id ? String(orgs[0].id) : null;

    if (!organisationId) {
      return NextResponse.json(
        { success: false, error: "No organisation found." },
        { status: 400 }
      );
    }

    const { data: rows, error: rowErr } = await supabaseService
      .from("social_accounts")
      .select("organisation_id, platform, page_id, page_name, is_active, token_expires_at, updated_at")
      .eq("organisation_id", organisationId)
      .eq("platform", "tiktok")
      .limit(1);

    if (rowErr) {
      return NextResponse.json(
        { success: false, error: `TikTok lookup failed: ${rowErr.message}` },
        { status: 500 }
      );
    }

    const row = rows?.[0] || null;

    return NextResponse.json({
      success: true,
      organisationId,
      connected: !!row,
      row,
    });
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message || "Debug failed" },
      { status: 500 }
    );
  }
}
