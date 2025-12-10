// app/api/social/schedule/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const {
      message,
      platforms,
      imageUrl,
      scheduledAt,
      organisationId,
    } = body as {
      message?: string;
      platforms?: string[];
      imageUrl?: string;
      scheduledAt?: string;
      organisationId?: string;
    };

    // ---- 1) Basic validation ----
    if (!message || typeof message !== "string" || !message.trim()) {
      return NextResponse.json(
        { success: false, error: "Message is required." },
        { status: 200 }
      );
    }

    if (!Array.isArray(platforms) || platforms.length === 0) {
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

    // ---- 2) Plan & limit checks ----
    let limitInfo: any = null;

    try {
      // Plan gating
      const { data: planRow, error: planErr } = await supabaseAdmin
        .from("organisation_plans")
        .select("plan")
        .eq("organisation_id", organisationId)
        .maybeSingle();

      if (planErr) {
        console.error("[schedule] plan lookup error", planErr);
      }

      const plan = planRow?.plan || "basic";
      const tiktokRequested = platforms.includes("tiktok");

      if (tiktokRequested && plan === "basic") {
        return NextResponse.json(
          {
            success: false,
            error:
              "TikTok scheduling requires the Pro plan or higher. Upgrade to unlock this channel.",
            requiresPlan: "pro",
          },
          { status: 200 }
        );
      }

      // Posting limit
      const { data, error } = await supabaseAdmin.rpc(
        "increment_org_post_usage",
        {
          p_organisation_id: organisationId,
        }
      );

      if (!error && Array.isArray(data) && data.length > 0) {
        limitInfo = data[0];
        if (!limitInfo.allowed) {
          return NextResponse.json(
            {
              success: false,
              error: `You've reached your ${limitInfo.posts_limit} posts/month limit. Upgrade to schedule more content.`,
              overLimit: true,
              limitInfo,
            },
            { status: 200 }
          );
        }
      } else if (error) {
        console.error("[schedule] RPC error", error);
      }
    } catch (e) {
      console.error("[schedule] exception during limits/plan", e);
    }

    // ---- 3) Store scheduled post locally ----
    const { data: row, error: insertErr } = await supabaseAdmin
      .from("content_items")
      .insert({
        organisation_id: organisationId,
        text: message,
        platforms,
        scheduled_for: date.toISOString(),
        image_url: imageUrl || null,
        status: "scheduled",
      })
      .select()
      .single();

    if (insertErr || !row) {
      console.error("[schedule] Failed to insert content item", insertErr);
      return NextResponse.json(
        {
          success: false,
          error:
            "Could not save your scheduled post. Please try again or contact support.",
        },
        { status: 200 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        scheduled: true,
        item: row,
        limitInfo,
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("[schedule] error", err);
    return NextResponse.json(
      { success: false, error: "Internal server error." },
      { status: 200 }
    );
  }
}
