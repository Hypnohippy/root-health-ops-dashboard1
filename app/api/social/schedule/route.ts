// app/api/social/schedule/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

const AYRSHARE_API_KEY = process.env.AYRSHARE_API_KEY;

export async function POST(req: NextRequest) {
  if (!AYRSHARE_API_KEY) {
    console.error("Missing AYRSHARE_API_KEY");
    return NextResponse.json(
      { success: false, error: "Server missing social engine key." },
      { status: 200 }
    );
  }

  try {
    const body = await req.json();

    const {
      message,
      platforms,
      imageUrl,
      scheduledAt,
      organisationId,
    } = body;

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

    if (!organisationId) {
      return NextResponse.json(
        { success: false, error: "Missing organisationId." },
        { status: 200 }
      );
    }

    // ---- 2) Enforce plan gating (e.g. TikTok requires Pro) ----
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
          error: "TikTok scheduling requires the Pro plan or higher.",
          requiresPlan: "pro",
        },
        { status: 200 }
      );
    }

    // ---- 3) Posting limit enforcement ----
    let limitInfo: any = null;

    try {
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
      }
    } catch (e) {
      console.error("[schedule] RPC error", e);
      // Allow posting rather than blocking the platform while testing
    }

    // ---- 4) Build Ayrshare scheduling payload ----
    const payload: Record<string, any> = {
      post: message,
      platforms,
      scheduleDate: scheduledAt,  // MUST be ISO string
    };

    if (imageUrl && typeof imageUrl === "string") {
      payload.mediaUrls = [imageUrl.trim()];
    }

    // ---- 5) Call Ayrshare ----
    const res = await fetch("https://api.ayrshare.com/api/post", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${AYRSHARE_API_KEY}`,
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json();

    // Handle Ayrshare errors
    if (!res.ok || data?.status === "error") {
      return NextResponse.json(
        {
          success: false,
          error:
            "Unable to schedule this post. Please check your channel connections or try again.",
          details: data,
        },
        { status: 200 }
      );
    }

    // ---- 6) Store record in Supabase ----
    const { data: insertRow, error: insertErr } = await supabaseAdmin
      .from("content_items")
      .insert({
        organisation_id: organisationId,
        text: message,
        platforms,
        scheduled_for: scheduledAt,
        image_url: imageUrl || null,
        status: "scheduled",
        ayrshare_ref: data?.id || null, // optional
      })
      .select()
      .single();

    if (insertErr) {
      console.error("[schedule] Failed to insert content item", insertErr);
    }

    return NextResponse.json(
      {
        success: true,
        scheduled: true,
        item: insertRow,
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
