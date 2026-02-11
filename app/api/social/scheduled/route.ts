// app/api/social/scheduled/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

export const runtime = "nodejs";

/**
 * GET /api/social/scheduled
 *
 * Query params:
 * - range=future|all   (default future)
 * - includeQuickBlast=1 (default 0)
 *
 * Purpose:
 * - Scheduled pipeline should show FUTURE items only (and not Quick Blast by default).
 * - Quick Blast writes to scheduled_posts for audit + dispatching, but is "send now", not "pipeline".
 */
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);

    const range = String(url.searchParams.get("range") || "future").trim(); // future | all
    const includeQuickBlast = String(url.searchParams.get("includeQuickBlast") || "0").trim() === "1";

    // NOTE: If you later go multi-tenant w/ user auth, you’ll pass orgId and filter.
    // For now, single-tenant: pick the first org.
    const { data: orgs, error: orgErr } = await supabaseAdmin
      .from("organisations")
      .select("id")
      .limit(1);

    if (orgErr || !orgs || orgs.length === 0) {
      return NextResponse.json(
        { success: false, error: "No organisation found." },
        { status: 200 }
      );
    }

    const organisationId = String(orgs[0].id);

    let q = supabaseAdmin
      .from("scheduled_posts")
      .select(
        "id, organisation_id, message, platforms, image_url, scheduled_for, posted_at, status, meta, error_info, created_at, updated_at"
      )
      .eq("organisation_id", organisationId)
      .order("scheduled_for", { ascending: false })
      .limit(200);

    // Default: scheduled pipeline should show FUTURE only
    if (range === "future") {
      q = q.gte("scheduled_for", new Date().toISOString());
      // Optional: only show things that are actually in a “pipeline” state
      q = q.in("status", ["scheduled", "pending", "queued"]);
    }

    // Hide Quick Blast by default
    if (!includeQuickBlast) {
      // Works if meta is jsonb (it is)
      // Filters rows where meta->>'source' != 'quick_blast' OR meta->>'source' is null
      q = q.or(`meta->>source.is.null,meta->>source.neq.quick_blast`);
    }

    const { data, error } = await q;

    if (error) {
      console.error("[scheduled] load error", error);
      return NextResponse.json(
        { success: false, error: "Failed loading scheduled posts.", details: error.message },
        { status: 200 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        organisationId,
        range,
        includeQuickBlast,
        items: data || [],
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("[scheduled] fatal", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Scheduled API crashed." },
      { status: 200 }
    );
  }
}
