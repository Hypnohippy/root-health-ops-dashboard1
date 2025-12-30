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

    // 2) Insert into scheduled_posts ONLY (no plan checks, no limits – keep it simple)
    const { data, error } = await supabaseAdmin
      .from("scheduled_posts")
      .insert({
        organisation_id: organisationId,
        message,
        platforms,
        image_url: imageUrl || null,
        scheduled_for: date.toISOString(),
        status: "scheduled",
      })
      .select()
      .single();

    if (error || !data) {
      console.error("[schedule] insert error", error);
      return NextResponse.json(
        {
          success: false,
          error: `Could not save your scheduled post (DB: ${
            (error as any)?.message ||
            JSON.stringify(error) ||
            "unknown error"
          }).`,
        },
        { status: 200 }
      );
    }

    // 3) Success
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
