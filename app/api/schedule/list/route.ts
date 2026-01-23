import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

export const runtime = "nodejs";

function safeJson(v: any) {
  try {
    return JSON.parse(JSON.stringify(v));
  } catch {
    return v;
  }
}

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
  return String((data as any)[0].id);
}

export async function GET(req: NextRequest) {
  try {
    // Optional filters
    const organisationIdFromQuery = req.nextUrl.searchParams.get("organisationId");
    const status = (req.nextUrl.searchParams.get("status") || "").trim(); // optional: scheduled|sent|failed etc
    const limitRaw = req.nextUrl.searchParams.get("limit") || "200";
    const limit = Math.max(1, Math.min(500, Number(limitRaw) || 200));

    const organisationId =
      (organisationIdFromQuery && organisationIdFromQuery.trim()) ||
      (await getSingleTenantOrganisationId());

    if (!organisationId) {
      return NextResponse.json(
        { ok: false, error: "No organisation found." },
        { status: 200 }
      );
    }

    // ✅ IMPORTANT: return ALL statuses by default
    let q = supabaseAdmin
      .from("scheduled_posts")
      .select(
        "id, organisation_id, message, platforms, image_url, scheduled_for, status, created_at, meta, error_info"
      )
      .eq("organisation_id", organisationId)
      .order("scheduled_for", { ascending: false })
      .limit(limit);

    // Optional status filter if you want it later
    if (status) {
      q = q.eq("status", status);
    }

    const { data, error } = await q;

    if (error) {
      console.error("[schedule/list] DB error", error);
      return NextResponse.json(
        { ok: false, error: "DB error loading scheduled posts.", details: safeJson(error) },
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
  } catch (e: any) {
    console.error("[schedule/list] fatal error", e);
    return NextResponse.json(
      { ok: false, error: e?.message || "Internal error." },
      { status: 200 }
    );
  }
}
