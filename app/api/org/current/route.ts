// app/api/org/current/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

export const runtime = "nodejs";

/**
 * GET /api/org/current
 * Returns the current org id for single-tenant beta.
 *
 * Priority:
 * 1) env SINGLE_ORG_ID
 * 2) env NEXT_PUBLIC_SINGLE_ORG_ID
 * 3) newest org from organisations table
 */
export async function GET(_req: NextRequest) {
  try {
    const forced =
      (process.env.SINGLE_ORG_ID || "").trim() ||
      (process.env.NEXT_PUBLIC_SINGLE_ORG_ID || "").trim();

    if (forced) {
      return NextResponse.json({ success: true, organisationId: forced, mode: "forced_env" }, { status: 200 });
    }

    const { data, error } = await supabaseAdmin
      .from("organisations")
      .select("id, created_at")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 200 });
    }

    if (!data?.id) {
      return NextResponse.json({ success: false, error: "No organisation found." }, { status: 200 });
    }

    return NextResponse.json(
      { success: true, organisationId: String(data.id), mode: "latest_org" },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message || "Failed to load organisation." },
      { status: 200 }
    );
  }
}
