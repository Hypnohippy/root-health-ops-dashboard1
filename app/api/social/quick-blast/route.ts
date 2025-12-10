// app/api/social/quick-blast/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

const AYRSHARE_API_KEY = process.env.AYRSHARE_API_KEY;

export async function POST(req: NextRequest) {
  if (!AYRSHARE_API_KEY) {
    console.error("Missing AYRSHARE_API_KEY in environment variables");
    return NextResponse.json(
      { success: false, error: "Server misconfiguration: missing social engine key." },
      { status: 200 }
    );
  }

  try {
    const body = await req.json();

    const {
      message,
      channel,
      imageUrl,
      organisationId, // optional for now – we'll start using it for limits & gating
    }: {
      message?: string;
      channel?: string;
      imageUrl?: string;
      organisationId?: string;
    } = body;

    if (!message || typeof message !== "string" || !message.trim()) {
      return NextResponse.json(
        { success: false, error: "Message is required." },
        { status: 200 }
      );
    }

    if (!channel || typeof channel !== "string" || !channel.trim()) {
      return NextResponse.json(
        { success: false, error: "Channel is required." },
        { status: 200 }
      );
    }

    const platform = channel.trim() as string; // "facebook" | "instagram" | "linkedin" | "tiktok" | "reddit"...

    // --- 1) FEATURE GATING BY PLAN (e.g. TikTok requires Pro) ---
    // We only enforce if we know the organisation.
    // Basic idea:
    //  - TikTok: requires pro or enterprise
    //  - Others: allowed on any plan (for now)
    if (organisationId && platform === "tiktok") {
      try {
        const { data: planRow, error: planError } = await supabaseAdmin
          .from("organisation_plans")
          .select("plan, trial_ends_at")
          .eq("organisation_id", organisationId)
          .maybeSingle();

        if (planError) {
          console.error(
            "[quick-blast] Error fetching organisation plan for gating",
            planError
          );
          // If we can't read the plan, allow posting rather than blocking you in beta.
        } else if (planRow) {
          const plan = planRow.plan as string | null;

          const allowedPlans = ["pro", "enterprise"];

          if (!plan || !allowedPlans.includes(plan)) {
            // TikTok not allowed on this plan
            return NextResponse.json(
              {
                success: false,
                error:
                  "TikTok posting is available on Root Health Ops Pro and above. Upgrade your plan to unlock this channel.",
                requiresPlan: "pro",
                channel: platform,
              },
              { status: 200 }
            );
          }
        }
      } catch (gateErr) {
        console.error(
          "[quick-blast] Exception while checking plan-based gating",
          gateErr
        );
        // If gating fails, fall through and continue (so you can still test).
      }
    }

    // --- 2) POSTING LIMIT ENFORCEMENT (monthly caps) ---
    let limitInfo: any = null;

    if (organisationId) {
      try {
        const { data, error } = await supabaseAdmin.rpc(
          "increment_org_post_usage",
          {
            p_organisation_id: organisationId,
          }
        );

        if (error) {
          console.error(
            "[quick-blast] Error calling increment_org_post_usage RPC",
            error
          );
        } else if (Array.isArray(data) && data.length > 0) {
          const result = data[0];
          limitInfo = result;

          if (!result.allowed) {
            // Over limit: do NOT post to Ayrshare
            return NextResponse.json(
              {
                success: false,
                error: `You've reached your ${result.posts_limit} posts/month limit on your current plan. Upgrade to continue posting.`,
                limitInfo: result,
                overLimit: true,
              },
              { status: 200 }
            );
          }
        } else {
          console.warn(
            "[quick-blast] increment_org_post_usage returned empty data for org",
            organisationId
          );
        }
      } catch (rpcErr) {
        console.error(
          "[quick-blast] Exception while calling increment_org_post_usage",
          rpcErr
        );
        // Do not block posting here: better to let posts through than break the app while testing.
      }
    } else {
      console.warn(
        "[quick-blast] No organisationId provided – skipping post limit enforcement for this request."
      );
    }

    // --- 3) BUILD PAYLOAD FOR SOCIAL ENGINE ---
    const payload: Record<string, any> = {
      post: message,
      platforms: [platform],
    };

    if (imageUrl && typeof imageUrl === "string" && imageUrl.trim().length > 0) {
      payload.mediaUrls = [imageUrl.trim()];
    }

    // --- 4) CALL AYRSHARE (SOCIAL ENGINE) ---
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
      console.error("Social engine non-JSON response", res.status);
    }

    const statusFromBody = data && typeof data === "object" ? data.status : null;

    // Extract any structured error info Ayrshare gives us without leaking vendor details
    const firstError = Array.isArray(data?.errors) ? data.errors[0] : null;
    const errorCode = firstError?.code as number | undefined;

    if (!res.ok || statusFromBody === "error") {
      console.error("Social engine error", res.status, data);

      // --- SPECIAL CASES / TRANSLATIONS ---

      // 1) TikTok requires higher plan (defensive: in case plan gating missed it)
      if (platform === "tiktok" && errorCode === 169) {
        return NextResponse.json(
          {
            success: false,
            error:
              "TikTok posting requires a higher Root Health Ops plan. Upgrade to Pro or Enterprise to enable TikTok.",
            requiresPlan: "pro",
            channel: platform,
            limitInfo,
          },
          { status: 200 }
        );
      }

      // 2) Duplicate content check
      if (errorCode === 137) {
        return NextResponse.json(
          {
            success: false,
            error:
              "This looks extremely similar to something you've posted recently. Social networks often block duplicate posts. Try tweaking the wording or adding variety before sending again.",
            duplicateContent: true,
            channel: platform,
            limitInfo,
          },
          { status: 200 }
        );
      }

      // 3) Generic failure (no vendor name, no raw JSON)
      return NextResponse.json(
        {
          success: false,
          error:
            "There was a problem posting to this channel. Please check your social connection or try again in a moment.",
          ayrshareStatusCode: res.status,
          limitInfo,
        },
        { status: 200 }
      );
    }

    // --- 5) SUCCESS ---
    return NextResponse.json(
      {
        success: true,
        ayrshareStatusCode: res.status,
        limitInfo,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error in /api/social/quick-blast:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error. Please try again." },
      { status: 200 }
    );
  }
}
