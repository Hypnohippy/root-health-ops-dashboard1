// app/api/social/scheduled/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

export const runtime = "nodejs";

/**
 * GET /api/social/scheduled?range=future&includeQuickBlast=0
 *
 * - range=future (default): shows posts scheduled_for >= now OR not posted yet
 * - includeQuickBlast=0 (default): hides meta.source === "quick_blast"
 *
 * Returns: { success: true, items: ScheduledRow[] }
 */
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);

    const range = String(url.searchParams.get("range") || "future").toLowerCase();
    const includeQuickBlast = String(url.searchParams.get("includeQuickBlast") || "0") === "1";

    // Single-tenant: take the first org
    const { data: orgs, error: orgErr } = await supabaseAdmin
      .from("organisations")
      .select("id")
      .limit(1);

    if (orgErr || !orgs || orgs.length === 0) {
      return NextResponse.json({ success: false, error: "No organisation found." }, { status: 200 });
    }

    const organisationId = String(orgs[0].id);
    const nowIso = new Date().toISOString();

    let q = supabaseAdmin
      .from("scheduled_posts")
      .select(
        "id, organisation_id, message, platforms, image_url, scheduled_for, posted_at, status, meta, error_info, created_at, updated_at"
      )
      .eq("organisation_id", organisationId);

    // Hide quick blast rows by default
    if (!includeQuickBlast) {
      // jsonb filter: meta->>'source' != 'quick_blast' OR meta->>'source' is null
      q = q.or("meta->>source.is.null,meta->>source.neq.quick_blast");
    }

    // Range filtering
    if (range === "future") {
      // show anything not posted yet, plus future scheduled items
      q = q.or(`posted_at.is.null,scheduled_for.gte.${nowIso}`);
    } else if (range === "past") {
      q = q.lt("scheduled_for", nowIso);
    } // else "all" -> no extra filter

    const { data, error } = await q.order("scheduled_for", { ascending: true }).limit(80);

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 200 });
    }

    return NextResponse.json({ success: true, items: data || [] }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || "Failed to load scheduled posts." }, { status: 200 });
  }
}
