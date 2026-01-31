import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

export const runtime = "nodejs";

/**
 * POST /api/publish/now?organisationId=...
 * Body: { id: string, platforms?: string[] }
 *
 * - Requires the scheduled post to be status=queued
 * - Publishes via your existing /api/social/quick-blast
 * - Updates scheduled_posts.status to posted/failed
 */
export async function POST(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const organisationId = String(url.searchParams.get("organisationId") || "").trim();

    if (!organisationId) {
      return NextResponse.json({ success: false, error: "Missing organisationId" }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const id = String(body?.id || "").trim();

    // Optional platform override from checkbox UI
    const platformsOverride = Array.isArray(body?.platforms)
      ? (body.platforms as any[]).map((x) => String(x)).filter(Boolean)
      : null;

    if (!id) {
      return NextResponse.json({ success: false, error: "Missing id" }, { status: 400 });
    }

    // Load scheduled post
    const { data: rows, error: readErr } = await supabaseAdmin
      .from("scheduled_posts")
      .select("id, organisation_id, message, platforms, image_url, status, meta")
      .eq("id", id)
      .eq("organisation_id", organisationId)
      .limit(1);

    if (readErr) {
      console.error("[publish/now] read error", readErr);
      return NextResponse.json({ success: false, error: "Failed to read scheduled post" }, { status: 500 });
    }

    const row: any = Array.isArray(rows) ? rows[0] : null;
    if (!row?.id) {
      return NextResponse.json({ success: false, error: "Post not found for this organisation" }, { status: 404 });
    }

    const status = String(row.status || "").toLowerCase().trim();
    if (status !== "queued") {
      return NextResponse.json(
        { success: false, error: `Post must be queued before posting now (current: ${status || "scheduled"})` },
        { status: 400 }
      );
    }

    const platformsToUse =
      platformsOverride && platformsOverride.length > 0
        ? platformsOverride
        : Array.isArray(row.platforms)
        ? row.platforms
        : [];

    if (!platformsToUse || platformsToUse.length === 0) {
      return NextResponse.json({ success: false, error: "No platforms selected to publish." }, { status: 400 });
    }

    // Call your existing quick-blast route
    const origin = req.nextUrl.origin;

    const qbRes = await fetch(`${origin}/api/social/quick-blast`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: row.message || "",
        imageUrl: row.image_url || "",
        platforms: platformsToUse,
        organisationId, // harmless if ignored
        source: "approvals_post_now",
        scheduledPostId: row.id,
      }),
    });

    const qbJson: any = await qbRes.json().catch(() => null);
    const ok = !!qbJson?.success;

    const nextStatus = ok ? "posted" : "failed";

    const nextMeta = {
      ...(row.meta || {}),
      post_now: {
        at: new Date().toISOString(),
        ok,
        platforms: platformsToUse,
        response: qbJson || null,
      },
    };

    const { error: updErr } = await supabaseAdmin
      .from("scheduled_posts")
      .update({
        status: nextStatus,
        meta: nextMeta,
        posted_at: ok ? new Date().toISOString() : null,
      } as any)
      .eq("id", row.id)
      .eq("organisation_id", organisationId);

    if (updErr) {
      console.error("[publish/now] update error", updErr);
      return NextResponse.json(
        { success: false, error: "Published, but failed to update scheduled_posts status." },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { success: true, id: row.id, status: nextStatus, publish: qbJson || null },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("[publish/now] unexpected", err);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
