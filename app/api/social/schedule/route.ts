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

    // IMPORTANT CHANGE:
    // organisationId is now OPTIONAL.
    // If present -> enforce plan & limits and store content_items.
    // If missing -> skip those and just schedule via Ayrshare so you can keep testing.

    // ---- 2) Optional plan gating (e.g. TikTok requires Pro) ----
    let plan: string | null = null;

    if (organisationId) {
      try {
        const { data: planRow, error: planErr } = await supabaseAdmin
          .from("organisation_plans")
          .select("plan")
          .eq("organisation_id", organisationId)
          .maybeSingle();

        if (planErr) {
          console.error("[schedule] plan lookup error", planErr);
        }
        plan = planRow?.plan || "basic";
      } catch (e) {
        console.error("[schedule] plan lookup exception", e);
      }
    }

    const tiktokRequested = platforms.includes("tiktok");

    if (organisationId && tiktokRequested && plan === "basic") {
      return NextResponse.json(
        {
          success: false,
          error: "TikTok scheduling requires the Pro plan or higher.",
          requiresPlan: "pro",
        },
        { status: 200 }
      );
    }

    // ---- 3) Optional posting limit enforcement ----
    let limitInfo: any = null;

    if (organisationId) {
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
        } else if (error) {
          console.error("[schedule] RPC error", error);
        }
      } catch (e) {
        console.error("[schedule] RPC exception", e);
        // Don't block posting while testing if limits check fails
      }
    }

    // ---- 4) Build Ayrshare scheduling payload ----
    const payload: Record<string, any> = {
      post: message,
      platforms,
      scheduleDate: scheduledAt, // ISO string
    };

    if (imageUrl && typeof imageUrl === "string" && imageUrl.trim()) {
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

    let data: any = null;
    try {
      data = await res.json();
    } catch (e) {
      console.error("[schedule] Ayrshare non-JSON response", res.status);
    }

   if (!res.ok || data?.status === "error") {
  console.error("[schedule] Ayrshare error", res.status, data);
  const firstError = Array.isArray(data?.errors) ? data.errors[0] : null;
  const message =
    firstError?.message ||
    data?.message ||
    "Unable to schedule this post. Please check your channel connections or try again.";

  return NextResponse.json(
    {
      success: false,
      error: message,
      // TEMP: surface some extra info to help us debug; we can hide this later.
      debug: {
        statusCode: res.status,
        code: firstError?.code,
      },
    },
    { status: 200 }
  );
}


    // ---- 6) Optional Supabase insert (only if we know the org) ----
    let insertRow: any = null;

    if (organisationId) {
      try {
        const { data: row, error: insertErr } = await supabaseAdmin
          .from("content_items")
          .insert({
            organisation_id: organisationId,
            text: message,
            platforms,
            scheduled_for: scheduledAt,
            image_url: imageUrl || null,
            status: "scheduled",
            ayrshare_ref: data?.id || null,
          })
          .select()
          .single();

        if (insertErr) {
          console.error("[schedule] Failed to insert content item", insertErr);
        } else {
          insertRow = row;
        }
      } catch (e) {
        console.error("[schedule] Exception inserting content item", e);
      }
    } else {
      console.warn(
        "[schedule] No organisationId provided – skipping content_items insert."
      );
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
