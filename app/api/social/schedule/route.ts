// app/api/social/schedule/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const message: string | undefined = body.message;
    const platforms: string[] | undefined = body.platforms;
    const imageUrl: string | undefined = body.imageUrl;
    const scheduledAt: string | undefined = body.scheduledAt;
    const organisationId: string | undefined = body.organisationId;

    // NEW: optional series / sequence fields
    const sequenceId: string | undefined = body.sequenceId || body.sequence_id;
    const metaIncoming: any = body.meta;

    // ✅ NEW: optional poster identity (safe even without auth for now)
    const poster = body.poster && typeof body.poster === "object" ? body.poster : null;
    const posterName = typeof body?.posterName === "string" ? body.posterName.trim() : "";
    const posterEmail = typeof body?.posterEmail === "string" ? body.posterEmail.trim() : "";
    const posterUserId = typeof body?.posterUserId === "string" ? body.posterUserId.trim() : "";

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

    // 2) Build meta safely
    const meta: any =
      metaIncoming && typeof metaIncoming === "object" ? { ...metaIncoming } : {};

    // ✅ Always attach created_by if provided
    const createdByFromBody =
      poster && typeof poster === "object"
        ? {
            user_id: typeof poster.user_id === "string" ? poster.user_id.trim() : undefined,
            name: typeof poster.name === "string" ? poster.name.trim() : undefined,
            email: typeof poster.email === "string" ? poster.email.trim() : undefined,
            source: typeof poster.source === "string" ? poster.source : undefined,
          }
        : null;

    const created_by = {
      user_id: posterUserId || createdByFromBody?.user_id || undefined,
      name: posterName || createdByFromBody?.name || undefined,
      email: posterEmail || createdByFromBody?.email || undefined,
      source: createdByFromBody?.source || (meta?.source ? String(meta.source) : "schedule"),
    };

    // Only set if we have *something*
    if (created_by.user_id || created_by.name || created_by.email) {
      meta.created_by = created_by;
    }

    // 3) Insert into scheduled_posts
    const insertPayload: Record<string, any> = {
      organisation_id: organisationId,
      message: message.trim(),
      platforms,
      image_url: imageUrl || null,
      scheduled_for: date.toISOString(),
      status: "scheduled",
      meta,
    };

    if (sequenceId && typeof sequenceId === "string" && sequenceId.trim()) {
      insertPayload.sequence_id = sequenceId.trim();
    }

    if (meta && typeof meta === "object") {
      if (typeof meta.part === "number") insertPayload.series_part = meta.part;
      if (typeof meta.total === "number") insertPayload.series_total = meta.total;
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
