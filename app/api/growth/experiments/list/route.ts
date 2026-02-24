import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

function norm(v: any) {
  return String(v ?? "").trim();
}

function resolveOrgId() {
  const forced =
    (process.env.SINGLE_ORG_ID || "").trim() ||
    (process.env.NEXT_PUBLIC_SINGLE_ORG_ID || "").trim();

  return forced || null;
}

export async function GET() {
  try {
    const organisationId = resolveOrgId();

    if (!organisationId) {
      return NextResponse.json(
        { success: false, error: "Organisation not resolved." },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("growth_experiments")
      .select("*")
      .eq("organisation_id", organisationId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);

    return NextResponse.json({
      success: true,
      organisationId,
      items: data || [],
    });
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message || "Failed to list experiments." },
      { status: 500 }
    );
  }
}
