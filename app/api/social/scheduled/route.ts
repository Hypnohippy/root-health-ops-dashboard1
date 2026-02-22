// app/api/social/scheduled/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

export const runtime = "nodejs";

/**
 * GET /api/social/scheduled?range=future&includeQuickBlast=0&organisationId=xxx
 *
 * range:
 * - future (default): upcoming + not-posted + recently posted (last 24h) so results don't "disappear"
 * - past: older than now
 * - all: everything (capped)
 *
 * includeQuickBlast:
 * - 0 default: hides meta.source === "quick_blast"
 *
 * organisationId:
 * - if provided, we use it (THIS FIXES "items not showing")
 * - if missing, we fall back to latest org (legacy behavior)
 */
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);

    const range = String(url.searchParams.get("range") || "future").toLowerCase();
    const includeQuickBlast = String(url.searchParams.get("includeQuickBlast") || "0") === "1";

    // ✅ Prefer explicit orgId (matches how scheduling routes write)
    let organisationId = String(url.searchParams.get("organisationId") || "").trim();

    // Legacy fallback: latest org (only if orgId not provided)
    if (!organisationId) {
      const { data: org, error: orgErr } = await supabaseAdmin
        .from("organisations")
        .select("id, created_at")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (orgErr || !org?.id) {
        return NextResponse.json({ success: false, error: "No organisation found." }, { status: 200 });
      }

      organisationId = String(org.id);
    }

    const nowIso = new Date().toISOString();
    const last24hIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    let q = supabaseAdmin
      .from("scheduled_posts")
      .select(
        "id, organisation_id, message, platforms, image_url, scheduled_for, posted_at, status, meta, error_info, created_at, updated_at"
      )
      .eq("organisation_id", organisationId);

    // Hide quick blast rows by default
    if (!includeQuickBlast) {
      // keep rows where meta.source is null OR source != quick_blast
      q = q.or("meta->>source.is.null,meta->>source.neq.quick_blast");
    }

    // Range filtering
    if (range === "future") {
      // Show:
      // - anything not posted yet
      // - anything scheduled in the future
      // - anything posted in last 24h (so it doesn't “disappear” after it runs)
      q = q.or(`posted_at.is.null,scheduled_for.gte.${nowIso},posted_at.gte.${last24hIso}`);
    } else if (range === "past") {
      q = q.lt("scheduled_for", nowIso);
    } // "all" => no extra filter

    const { data, error } = await q.order("scheduled_for", { ascending: true }).limit(120);

    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 200 });

    return NextResponse.json({ success: true, items: data || [], organisationId }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message || "Failed to load scheduled posts." },
      { status: 200 }
    );
  }
}
