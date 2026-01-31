// app/api/social/schedule/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

function safeString(v: any, max = 200) {
  const s = typeof v === "string" ? v.trim() : "";
  if (!s) return null;
  return s.slice(0, max);
}

function getClientIp(req: NextRequest) {
  // Best-effort only (behind proxies/CDN may vary)
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  const real = req.headers.get("x-real-ip");
  return real ? real.trim() : null;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));

    const message: string | undefined = body.message;
    const platforms: string[] | undefined = body.platforms;
    const imageUrl: string | undefined = body.imageUrl;
    const scheduledAt: string | undefined = body.scheduledAt;
    const organisationId: string | undefined = body.organisationId;

    // Optional series / sequence fields
    const sequenceId: string | undefined = body.sequenceId || body.sequence_id;

    // Existing meta (can include series info etc.)
    const metaIn: any = body.meta;

    // NEW: optional submitter payload coming from client
    // NOTE: we sanitize + stamp captured_at server-side
    const submitterIn: any = body.submitter;

    // 1) Basic validation
    if (!message || typeof message !== "string" || !message.trim()) {
      return NextResponse.json(
        { success: false, error: "Message is required." },
        { status: 200 }
      );
    }

    if (!platforms || !Array.isArray(platforms) || platforms.length === 0) {
      return NextResponse.json(
        { success: false, error: "At least one platform is required." },
        { status: 200 }
      );
    }

    if (!scheduledAt) {
      return NextResponse.json(
        { success: false, error: "A scheduledAt date is required." },
        { status: 200 }
      );
    }

    const date = new Date(scheduledAt);
    if (isNaN(date.getTime())) {
      return NextResponse.json(
        { success: false, error: "Scheduled date/time is invalid." },
        { status: 200 }
      );
    }

    if (!organisationId) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Missing organisation context while scheduling. Please contact support if this persists.",
        },
        { status: 200 }
      );
    }

    // 2) Build safe submitter stamp (stored inside meta)
    const nowIso = new Date().toISOString();
    const submitter = {
      id: safeString(submitterIn?.id, 120),
      name: safeString(submitterIn?.name, 120),
      email: safeString(submitterIn?.email, 180),
      source: safeString(submitterIn?.source, 40) || "schedule",
      captured_at: nowIso,
      user_agent: safeString(req.headers.get("user-agent") || "", 260),
      ip: safeString(getClientIp(req) || "", 80),
    };

    // Merge meta safely (never overwrite other fields)
    const nextMeta =
      metaIn && typeof metaIn === "object"
        ? { ...(metaIn || {}), submitter }
        : { submitter };

    // 3) Insert into scheduled_posts
    const insertPayload: Record<string, any> = {
      organisation_id: organisationId,
      message: message.trim(),
      platforms,
      image_url: imageUrl || null,
      scheduled_for: date.toISOString(),

      // keep your existing status usage
      status: "scheduled",

      // meta now includes submitter
      meta: nextMeta,
    };

    // Only set if provided
    if (sequenceId && typeof sequenceId === "string" && sequenceId.trim()) {
      insertPayload.sequence_id = sequenceId.trim();
    }

    // If meta includes series info, store it neatly too (unchanged)
    if (metaIn && typeof metaIn === "object") {
      if (typeof metaIn.part === "number") insertPayload.series_part = metaIn.part;
      if (typeof metaIn.total === "number") insertPayload.series_total = metaIn.total;
    }

    const { data, error } = await supabaseAdmin
      .from("scheduled_posts")
      .insert(insertPayload)
      .select()
      .single();

    if (error || !data) {
      console.error("[schedule] insert error", error);
      return NextResponse.json(
        {
          success: false,
          error: `Could not save your scheduled post (DB: ${
            (error as any)?.message || JSON.stringify(error) || "unknown error"
          }).`,
        },
        { status: 200 }
      );
    }

    // 4) Success
    return NextResponse.json(
      {
        success: true,
        scheduled: true,
        item: data,
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("[schedule] unexpected error", err);
    return NextResponse.json(
      {
        success: false,
        error: "Internal server error in /api/social/schedule.",
      },
      { status: 200 }
    );
  }
}
