import { requireOrganisation, accessErrorResponse } from "@/lib/tenantAuth";
// app/api/social/scheduled/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

export const runtime = "nodejs";

/**
 * Turn whatever "platforms" is into a clean string[]
 * Supports:
 *  - ["facebook","instagram"]
 *  - "facebook"
 *  - "facebook,instagram"
 *  - '["facebook","instagram"]'
 *  - null/undefined
 */
function normalisePlatforms(raw: any): string[] {
  if (Array.isArray(raw)) {
    return raw.map((x) => String(x || "").trim()).filter(Boolean);
  }

  const s = String(raw || "").trim();
  if (!s) return [];

  // JSON array inside a string?
  if (s.startsWith("[") && s.endsWith("]")) {
    try {
      const arr = JSON.parse(s);
      if (Array.isArray(arr)) {
        return arr.map((x) => String(x || "").trim()).filter(Boolean);
      }
    } catch {
      // fall through
    }
  }

  // Comma-separated string?
  if (s.includes(",")) {
    return s
      .split(",")
      .map((x) => String(x || "").trim())
      .filter(Boolean);
  }

  return [s];
}

/**
 * GET /api/social/scheduled?range=future|past|all&includeQuickBlast=0|1&organisationId=...
 *
 * range:
 * - future: (not posted AND scheduled_for >= now) OR (posted in last 24h)
 * - past: (posted older than 24h) OR (not posted AND scheduled_for < now)
 * - all: everything
 *
 * includeQuickBlast:
 * - 0 default: hides meta.source === "quick_blast"
 */
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);

    const range = String(url.searchParams.get("range") || "future").toLowerCase();
    const includeQuickBlast = String(url.searchParams.get("includeQuickBlast") || "0") === "1";

    const { organisationId } = await requireOrganisation(url.searchParams.get("organisationId"), false);

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

    // IMPORTANT: group logic properly using PostgREST or(and(...),and(...)) style
    if (range === "future") {
      q = q.or(`and(posted_at.is.null,scheduled_for.gte.${nowIso}),and(posted_at.gte.${last24hIso})`);
    } else if (range === "past") {
      q = q.or(
        `and(posted_at.not.is.null,posted_at.lt.${last24hIso}),and(posted_at.is.null,scheduled_for.lt.${nowIso})`
      );
    } else {
      // all -> no extra filter
    }

    // Order:
    // - future: soonest first
    // - past/all: newest first
    const ascending = range === "future";

    const { data, error } = await q.order("scheduled_for", { ascending, nullsFirst: false }).limit(500);

    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 200 });

    // ✅ Normalize platforms so the UI can always filter correctly
    const cleaned = (data || []).map((row: any) => ({
      ...row,
      platforms: normalisePlatforms(row?.platforms),
    }));

    return NextResponse.json({ success: true, organisationId, items: cleaned }, { status: 200 });
  } catch (e: any) {
    const denied = accessErrorResponse(e);
    if (denied) return denied;
    return NextResponse.json(
      { success: false, error: e?.message || "Failed to load scheduled posts." },
      { status: 200 }
    );
  }
}
