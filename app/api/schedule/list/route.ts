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

async function resolveOrganisationId(req: NextRequest) {
  try {
    const orgFromQuery = req.nextUrl.searchParams.get("organisationId");
    if (orgFromQuery && orgFromQuery.trim()) return orgFromQuery.trim();
  } catch {}
  return await getSingleTenantOrganisationId();
}

export async function GET(req: NextRequest) {
  try {
    const organisationId = await resolveOrganisationId(req);

    if (!organisationId) {
      return NextResponse.json(
        { ok: false, error: "No organisation found." },
        { status: 200 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("scheduled_posts")
      .select(
        "id, organisation_id, message, platforms, image_url, scheduled_for, status, created_at, meta, sequence_id, series_part, series_total, error_info, posted_at"
      )
      .eq("organisation_id", organisationId)
      .order("scheduled_for", { ascending: true })
      .limit(250);

    if (error) {
      console.error("[schedule/list] DB error", error);
      return NextResponse.json(
        { ok: false, error: error.message || "DB error" },
        { status: 200 }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        organisationId,
        items: Array.isArray(data) ? data : [],
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("[schedule/list] unexpected", err);
    return NextResponse.json(
      { ok: false, error: err?.message || "Internal error" },
      { status: 200 }
    );
  }
}
