// app/api/social/quick-blast/route.ts
import { NextResponse } from "next/server";

type ChannelId =
  | "facebook"
  | "instagram"
  | "linkedin"
  | "tiktok"
  | "google"
  | "email"
  | "whatsapp";

type QuickBlastResult = {
  channel: ChannelId;
  ok: boolean;
  error?: string;
  status?: number;
};

const AYRSHARE_POST_ENDPOINT = "https://api.ayrshare.com/api/post";

/**
 * Map our internal channels → Ayrshare platform IDs.
 * Docs: platforms: 'facebook', 'instagram', 'linkedin', 'tiktok', 'gmb', ... :contentReference[oaicite:0]{index=0}
 */
const channelToPlatform: Partial<Record<ChannelId, string>> = {
  facebook: "facebook",
  instagram: "instagram",
  linkedin: "linkedin",
  tiktok: "tiktok",
  google: "gmb", // Google Business Profile
  // email / whatsapp not handled by Ayrshare – yet
};

/**
 * Reverse map from Ayrshare platform → our ChannelId
 * so we can interpret per-platform results in the response.
 */
const platformToChannel: Record<string, ChannelId> = {
  facebook: "facebook",
  instagram: "instagram",
  linkedin: "linkedin",
  tiktok: "tiktok",
  gmb: "google",
};

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);

    if (!body || typeof body.message !== "string") {
      return NextResponse.json(
        { error: "Invalid request body. Expected { message, channels[] }." },
        { status: 400 }
      );
    }

    const message = body.message.trim();
    const channels: ChannelId[] = Array.isArray(body.channels)
      ? body.channels
      : [];
    const origin: string = body.origin || "quick_blast_dashboard";

    // Optional image URL support – if frontend sends it
    const imageUrl: string | undefined =
      typeof body.imageUrl === "string" && body.imageUrl.trim().length > 0
        ? body.imageUrl.trim()
        : undefined;

    if (!message) {
      return NextResponse.json(
        { error: "Message is required." },
        { status: 400 }
      );
    }

    if (channels.length === 0) {
      return NextResponse.json(
        { error: "Select at least one channel." },
        { status: 400 }
      );
    }

    const apiKey = process.env.AYRSHARE_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        {
          error:
            "AYRSHARE_API_KEY is not configured. Please add it to your Vercel env vars.",
        },
        { status: 500 }
      );
    }

    // Convert selected channels → Ayrshare platforms
    const platforms = channels
      .map((ch) => channelToPlatform[ch])
      .filter((p): p is string => !!p);

    const unsupportedChannels = channels.filter(
      (ch) => !channelToPlatform[ch]
    );

    if (platforms.length === 0 && unsupportedChannels.length > 0) {
      return NextResponse.json(
        {
          error:
            "Selected channels are not supported by the Ayrshare integration yet.",
        },
        { status: 400 }
      );
    }

    const results: QuickBlastResult[] = [];

    // Pre-fill results for unsupported ones so the UI can show “not supported yet”
    for (const ch of unsupportedChannels) {
      results.push({
        channel: ch,
        ok: false,
        error: `Channel "${ch}" is not yet supported by the Ayrshare integration.`,
      });
    }

    if (platforms.length === 0) {
      // Everything selected was unsupported – bail out but still return results
      return NextResponse.json(
        {
          error: "No supported channels were selected.",
          results,
        },
        { status: 400 }
      );
    }

    // Call Ayrshare /post once for all supported platforms
    // Docs: https://www.ayrshare.com/docs/apis/post/post :contentReference[oaicite:1]{index=1}
    let ayrshareRes: Response;
    let ayrshareData: any = null;

    try {
      ayrshareRes = await fetch(AYRSHARE_POST_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`, // API Key auth :contentReference[oaicite:2]{index=2}
        },
        body: JSON.stringify({
          post: message,
          platforms,
          // Optional image/video
          ...(imageUrl ? { mediaUrls: [imageUrl] } : {}),
          // Optional tracking
          refId: origin,
        }),
      });

      try {
        ayrshareData = await ayrshareRes.json();
      } catch {
        // Ayrshare should always return JSON, but guard just in case
        ayrshareData = null;
      }
    } catch (err: any) {
      // Network-level failure – mark all supported channels as failed
      for (const ch of channels) {
        if (!channelToPlatform[ch]) continue;
        results.push({
          channel: ch,
          ok: false,
          error:
            err?.message ||
            "Network error calling Ayrshare /post. Please try again.",
        });
      }

      return NextResponse.json(
        {
          error:
            "Quick Blast failed to reach the posting provider (Ayrshare).",
          results,
        },
        { status: 502 }
      );
    }

    // Ayrshare responded but might have rejected the request
    if (!ayrshareRes.ok) {
      const errorMsg =
        ayrshareData?.error ||
        ayrshareData?.message ||
        `Ayrshare returned status ${ayrshareRes.status}.`;

      for (const ch of channels) {
        if (!channelToPlatform[ch]) continue;
        results.push({
          channel: ch,
          ok: false,
          status: ayrshareRes.status,
          error: errorMsg,
        });
      }

      return NextResponse.json(
        {
          error: "Quick Blast failed for all supported channels.",
          results,
        },
        { status: 502 }
      );
    }

    // Ayrshare OK – try to interpret per-platform statuses
    const postIds = Array.isArray(ayrshareData?.postIds)
      ? ayrshareData.postIds
      : [];

    // Build a quick lookup: platform → success/error
    const perPlatformStatus: Record<
      string,
      { ok: boolean; error?: string }
    > = {};

    if (postIds.length > 0) {
      for (const item of postIds) {
        const platform = item?.platform;
        const status = item?.status;
        if (!platform) continue;

        perPlatformStatus[platform] = {
          ok: status === "success",
          error: status === "success" ? undefined : `Platform status: ${status}`,
        };
      }
    }

    // For each supported channel, derive a result
    for (const ch of channels) {
      const platform = channelToPlatform[ch];
      if (!platform) continue; // already handled as unsupported above

      const platStatus = perPlatformStatus[platform];

      if (!platStatus) {
        // No per-platform info; fall back to overall Ayrshare status
        const overallStatus = ayrshareData?.status;
        const ok = overallStatus === "success" || overallStatus === "pending";
        results.push({
          channel: ch,
          ok,
          error: ok
            ? undefined
            : `No per-platform status from Ayrshare (overall: ${overallStatus}).`,
        });
      } else {
        results.push({
          channel: ch,
          ok: platStatus.ok,
          error: platStatus.error,
        });
      }
    }

    const anySuccess = results.some((r) => r.ok);

    if (!anySuccess) {
      return NextResponse.json(
        {
          error: "Quick Blast did not succeed on any supported channel.",
          results,
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        results,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("[social/quick-blast] Unexpected error", error);
    return NextResponse.json(
      {
        error:
          error?.message ||
          "Unexpected error processing Quick Blast on the server.",
      },
      { status: 500 }
    );
  }
}
