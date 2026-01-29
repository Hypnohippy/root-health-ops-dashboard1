// app/api/billing/plan/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

async function resolveOrganisationId(explicit?: string | null) {
  const id = (explicit || "").trim();
  if (id) return id;

  // Dev-friendly fallback: most recent organisation
  const { data, error } = await supabaseAdmin
    .from("organisations")
    .select("id")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data?.id) throw new Error("No organisation found.");
  return String(data.id);
}

export async function GET(req: NextRequest) {
  try {
    const organisationId = await resolveOrganisationId(
      req.nextUrl.searchParams.get("organisationId")
    );

    const { data, error } = await supabaseAdmin
      .from("organisation_plans")
      .select("plan_key,status,current_period_end")
      .eq("organisation_id", organisationId)
      .maybeSingle();

    // If no record yet, default to solo (soft gating)
    if (error && !String(error.message || "").toLowerCase().includes("0 rows")) {
      return NextResponse.json(
        { ok: false, error: error.message, organisationId },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        organisationId,
        plan: data?.plan_key || "solo",
        status: data?.status || "active",
        current_period_end: data?.current_period_end || null,
        source: data ? "db" : "default",
      },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Failed to load plan" },
      { status: 500 }
    );
  }
}
