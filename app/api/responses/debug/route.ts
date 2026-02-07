// app/api/responses/debug/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

export const runtime = "nodejs";

function okJson(data: any, status = 200) {
  return NextResponse.json(data, { status });
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const organisationId = String(url.searchParams.get("organisationId") || "").trim();

    if (!organisationId) return okJson({ success: false, error: "Missing organisationId" }, 400);

    const { data: rows, error } = await supabaseAdmin
      .from("inbox_items")
      .select("id, platform, status, kind, external_id, post_id, text, created_at_platform, inserted_at")
      .eq("organisation_id", organisationId)
      .order("inserted_at", { ascending: false })
      .limit(25);

    if (error) return okJson({ success: false, error: error.message }, 500);

    const counts: Record<string, number> = {};
    for (const r of rows || []) counts[String(r.platform || "unknown")] = (counts[String(r.platform || "unknown")] || 0) + 1;

    return okJson({
      success: true,
      organisationId,
      counts,
      sample: rows || [],
      note:
        "If IG shows in sample but UI shows none, the UI is loading a different orgId or list query isn't matching this orgId.",
    });
  } catch (e: any) {
    return okJson({ success: false, error: e?.message || "Debug failed" }, 500);
  }
}
