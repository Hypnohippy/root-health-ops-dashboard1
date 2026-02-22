// app/api/social/scheduled/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

export const runtime = "nodejs";

/**
 * GET /api/social/scheduled?range=future&includeQuickBlast=0&organisationId=...
 *
 * range:
 * - future (default): upcoming + not-posted + recently posted (last 24h) so results don't "disappear"
 * - past: older than now
 * - all: everything (capped)
 *
 * includeQuickBlast:
 * - 0 default: hides meta.source === "quick_blast"
 */
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);

    const range = String(url.searchParams.get("range") || "future").toLowerCase();
    const includeQuickBlast = String(url.searchParams.get("includeQuickBlast") || "0") === "1";

    // ✅ Prefer explicit orgId from client (prevents "ghost" org mismatches)
    let organisationId = String(url.searchParams.get("organisationId") || "").trim();

    if (!organisationId) {
      // fallback: forced env or latest org
      const forced =
        (process.env.SINGLE_ORG_ID || "").trim() ||
        (process.env.NEXT_PUBLIC_SINGLE_ORG_ID || "").trim();

      if (forced) {
        organisationId = forced;
      } else {
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
    }

    const nowIso = new Date().toISOString();
    const last24hIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    let q = supabaseAdmin
      .from("scheduled_posts")
      .select(
        "id, organisation_id, message, platforms, image_url, scheduled_for, posted_at, status, meta, error_info, created_at, updated_at"
      )
      .eq("organisation_id", organisationId);

    if (!includeQuickBlast) {
      q = q.or("meta->>source.is.null,meta->>source.neq.quick_blast");
    }

    if (range === "future") {
      q = q.or(`posted_at.is.null,scheduled_for.gte.${nowIso},posted_at.gte.${last24hIso}`);
    } else if (range === "past") {
      q = q.lt("scheduled_for", nowIso);
    }

    const { data, error } = await q.order("scheduled_for", { ascending: true }).limit(120);

    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 200 });

    return NextResponse.json({ success: true, organisationId, items: data || [] }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message || "Failed to load scheduled posts." },
      { status: 200 }
    );
  }
}
