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
      organisationId, // optional for now – future-proofing
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

    // For now, limit enforcement is *best-effort*:
    // - If we know the organisation, we enforce.
    // - If we don't, we log and continue without blocking your testing.
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
        // We intentionally do NOT block posting here
      }
    } else {
      console.warn(
        "[quick-blast] No organisationId provided – skipping post limit enforcement for this request."
      );
    }

    // At this point, either:
    // - No organisationId (no limit enforcement), OR
    // - Limit check passed (allowed = true)
    const platform = channel.trim(); // "facebook" | "instagram" | "linkedin" | "tiktok" | "reddit"...

    const payload: Record<string, any> = {
      post: message,
      platforms: [platform],
    };

    if (imageUrl && typeof imageUrl === "string" && imageUrl.trim().length > 0) {
      payload.mediaUrls = [imageUrl.trim()];
    }

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
      console.error("Ayrshare non-JSON response", res.status);
    }

    const statusFromBody = data && typeof data === "object" ? data.status : null;

    if (!res.ok || statusFromBody === "error") {
      console.error("Ayrshare error", res.status, data);
      return NextResponse.json(
        {
          success: false,
          error:
            (data && (data.error || data.message)) ||
            `There was a problem posting to this channel. Please check your social connection or try again.`,
          ayrshareStatusCode: res.status,
          // Do NOT leak vendor details in UI; this is mainly for logs / debugging
          // ayrshareRaw: data,
          limitInfo,
        },
        { status: 200 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        ayrshareStatusCode: res.status,
        // ayrshareRaw: data, // keep this out of UI responses if you like
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
