// app/api/growth/experiments/list/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

function norm(v: any) {
  return String(v ?? "").trim();
}

async function getLatestOrganisationId(): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from("organisations")
    .select("id, created_at")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data?.id) return null;
  return String(data.id);
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const orgFromQuery = norm(url.searchParams.get("organisationId"));
    const organisationId = orgFromQuery || (await getLatestOrganisationId());

    if (!organisationId) {
      return NextResponse.json(
        { success: false, error: "No organisation found." },
        { status: 400 }
      );
    }

    // Pull experiments + outcomes (for the “facts” + gentle feedback)
    const { data, error } = await supabaseAdmin
      .from("growth_experiments")
      .select(
        `
        id,
        organisation_id,
        title,
        hypothesis,
        platform,
        pattern_type,
        format,
        status,
        started_at,
        completed_at,
        created_at,
        updated_at,
        growth_experiment_outcomes (
          id,
          metric_name,
          metric_value,
          created_at
        )
      `
      )
      .eq("organisation_id", organisationId)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      organisationId,
      items: Array.isArray(data) ? data : [],
    });
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message || "Failed to load experiments." },
      { status: 500 }
    );
  }
}
