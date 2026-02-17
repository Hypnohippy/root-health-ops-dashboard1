import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

const SINGLE_ORG_ID = (process.env.SINGLE_ORG_ID || "").trim();

async function getOrganisationIdFallback(): Promise<string | null> {
  if (SINGLE_ORG_ID) return SINGLE_ORG_ID;

  const { data, error } = await supabaseAdmin
    .from("organisations")
    .select("id, created_at")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data?.id) return null;
  return String(data.id);
}

function norm(v: any) {
  return String(v ?? "").trim();
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const suggestion = body?.suggestion;

    const organisationId = await getOrganisationIdFallback();
    if (!organisationId) {
      return NextResponse.json({ success: false, error: "No organisation found." }, { status: 200 });
    }

    const platform = norm(suggestion?.platform) || null;
    const pattern_type = norm(suggestion?.pattern_type);
    const format = norm(suggestion?.format);
    const hook_style = norm(suggestion?.hook_style) || null;
    const cta_style = norm(suggestion?.cta_style) || null;
    const notes = norm(suggestion?.notes) || null;
    const performance_score =
      suggestion?.performance_score != null ? Number(suggestion.performance_score) : null;
    const source_post_id = norm(suggestion?.source_post_id) || null;

    if (!pattern_type || !format) {
      return NextResponse.json(
        { success: false, error: "Missing pattern_type or format." },
        { status: 200 }
      );
    }

    const now = new Date().toISOString();

    const { error } = await supabaseAdmin.from("growth_patterns").insert({
      organisation_id: organisationId,
      source_post_id,
      platform,
      pattern_type,
      format,
      hook_style,
      cta_style,
      notes,
      performance_score,
      suggested: true,
      saved_by_user: true,
      created_at: now,
      updated_at: now,
    } as any);

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 200 });
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || "Save failed" }, { status: 200 });
  }
}
