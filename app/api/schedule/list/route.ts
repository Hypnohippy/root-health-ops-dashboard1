// app/api/schedule/list/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

export const runtime = "nodejs";

async function getSingleTenantOrganisationId() {
  const { data, error } = await supabaseAdmin
    .from("organisations")
    .select("id")
    .limit(1);

  if (error) {
    console.error("[schedule/list] organisations error", error);
    return null;
  }
  if (!data || data.length === 0) return null;
  return data[0].id as string;
}

export async function GET(req: NextRequest) {
  try {
    // Accept org from query, else fall back to single-tenant org
    let organisationId =
      req.nextUrl.searchParams.get("organisationId")?.trim() || "";

    if (!organisationId) {
      const fallback = await getSingleTenantOrganisationId();
      if (fallback) organisationId = fallback;
    }

    if (!organisationId) {
      return NextResponse.json(
        { ok: false, error: "Missing organisationId." },
        { status: 200 }
      );
    }

    // Pull from Supabase scheduled_posts (same table /api/social/schedule writes to)
    const { data, error } = await supabaseAdmin
      .from("scheduled_posts")
      .select(
        "id, organisation_id, message, platforms, image_url, scheduled_for, status, created_at, meta, sequence_id, series_part, series_total, error_info, posted_at"
      )
      .eq("organisation_id", organisationId)
      .order("scheduled_for", { ascending: true })
      .limit(250);

    if (error) {
      console.error("[schedule/list] db error", error);
      return NextResponse.json(
        { ok: false, organisationId, error: "DB error loading scheduled posts." },
        { status: 200 }
      );
    }

    return NextResponse.json(
      { ok: true, organisationId, items: data || [] },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("[schedule/list] fatal", err);
    return NextResponse.json(
      { ok: false, error: err?.message || "Internal error." },
      { status: 200 }
    );
  }
}
