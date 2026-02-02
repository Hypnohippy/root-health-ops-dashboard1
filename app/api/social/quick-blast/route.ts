// app/api/social/quick-blast/route.ts
import { NextRequest, NextResponse } from "next/server";

const IG_ACCESS_TOKEN = process.env.IG_ACCESS_TOKEN;
const IG_USER_ID = process.env.IG_USER_ID;

// NOTE: We are intentionally focusing on Instagram here.
// Other platforms can remain handled by your other direct routes.
type Platform = "instagram";

async function igCreateContainer(args: {
  caption: string;
  imageUrl?: string | null;
  videoUrl?: string | null;
}) {
  if (!IG_ACCESS_TOKEN || !IG_USER_ID) {
    return {
      ok: false,
      status: 400,
      error:
        "Instagram not configured (missing IG_USER_ID or IG_ACCESS_TOKEN).",
    };
  }

  const hasVideo = !!(args.videoUrl && args.videoUrl.trim());
  const hasImage = !!(args.imageUrl && args.imageUrl.trim());

  if (!hasVideo && !hasImage) {
    return {
      ok: false,
      status: 400,
      error: "Instagram requires an image or a video URL for this post.",
    };
  }

  const url = new URL(`https://graph.facebook.com/v24.0/${IG_USER_ID}/media`);
  url.searchParams.set("access_token", IG_ACCESS_TOKEN);
  url.searchParams.set("caption", args.caption);

  if (hasVideo) {
    // ✅ Video must be REELS now (Meta deprecated VIDEO for feed publishing)
    url.searchParams.set("media_type", "REELS");
    url.searchParams.set("video_url", args.videoUrl!.trim());
  } else {
    url.searchParams.set("image_url", args.imageUrl!.trim());
  }

  const res = await fetch(url.toString(), { method: "POST" });
  const json = await res.json().catch(() => null);

  if (!res.ok) {
    const friendly =
      json?.error?.error_user_msg ||
      json?.error?.message ||
      "Instagram container creation failed.";
    return { ok: false, status: res.status, error: friendly, details: json };
  }

  const creationId = json?.id;
  if (!creationId) {
    return {
      ok: false,
      status: 500,
      error: "Instagram did not return a creation id.",
      details: json,
    };
  }

  return { ok: true, status: 200, creationId, details: json };
}

async function igWaitUntilReady(creationId: string) {
  if (!IG_ACCESS_TOKEN) {
    return {
      ok: false,
      status: 400,
      error: "Instagram not configured (missing IG_ACCESS_TOKEN).",
    };
  }

  // For video, IG needs time to process.
  // We poll a few times (up to ~60s) to avoid “Media Not Found / Not Ready” issues.
  const maxAttempts = 12;
  const delayMs = 5000;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const url = new URL(`https://graph.facebook.com/v24.0/${creationId}`);
    url.searchParams.set("fields", "status_code");
    url.searchParams.set("access_token", IG_ACCESS_TOKEN);

    const res = await fetch(url.toString(), { method: "GET" });
    const json = await res.json().catch(() => null);

    if (!res.ok) {
      const friendly =
        json?.error?.error_user_msg ||
        json?.error?.message ||
        "Instagram status check failed.";
      return { ok: false, status: res.status, error: friendly, details: json };
    }

    const statusCode = String(json?.status_code || "").toUpperCase();

    // Common codes: FINISHED, IN_PROGRESS, ERROR
    if (statusCode === "FINISHED") {
      return { ok: true, status: 200, statusCode, details: json };
    }

    if (statusCode === "ERROR") {
      return {
        ok: false,
        status: 400,
        error: "Instagram reported processing ERROR for this media.",
        details: json,
      };
    }

    // IN_PROGRESS (or blank) -> wait and retry
    await new Promise((r) => setTimeout(r, delayMs));
  }

  return {
    ok: false,
    status: 408,
    error:
      "Instagram is still processing the video. Wait ~1 minute and try again.",
  };
}

async function igPublish(creationId: string) {
  if (!IG_ACCESS_TOKEN || !IG_USER_ID) {
    return {
      ok: false,
      status: 400,
      error:
        "Instagram not configured (missing IG_USER_ID or IG_ACCESS_TOKEN).",
    };
  }

  const url = new URL(
    `https://graph.facebook.com/v24.0/${IG_USER_ID}/media_publish`
  );
  url.searchParams.set("creation_id", creationId);
  url.searchParams.set("access_token", IG_ACCESS_TOKEN);

  const res = await fetch(url.toString(), { method: "POST" });
  const json = await res.json().catch(() => null);

  if (!res.ok) {
    const friendly =
      json?.error?.error_user_msg ||
      json?.error?.message ||
      "Instagram publish failed.";
    return { ok: false, status: res.status, error: friendly, details: json };
  }

  return {
    ok: true,
    status: 200,
    postedId: json?.id || null,
    details: json,
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));

    const message: string = String(body?.message ?? "");
    const platformsRaw: any[] = Array.isArray(body?.platforms)
      ? body.platforms
      : [];

    // ✅ Your UI already uses these names:
    const imageUrl: string = String(body?.imageUrl ?? "");
    const videoUrl: string = String(body?.videoUrl ?? "");

    const platforms = platformsRaw
      .map((p) => String(p || "").toLowerCase().trim())
      .filter(Boolean);

    if (!message.trim()) {
      return NextResponse.json(
        { success: false, error: "Message is required." },
        { status: 200 }
      );
    }

    // We only act on Instagram in this phase.
    const wantsInstagram = platforms.includes("instagram");

    if (!wantsInstagram) {
      return NextResponse.json(
        {
          success: false,
          error:
            "This Quick Blast route is currently configured for Instagram only (for video). Select Instagram and try again.",
        },
        { status: 200 }
      );
    }

    // 1) Create container
    const created = await igCreateContainer({
      caption: message,
      imageUrl: imageUrl || null,
      videoUrl: videoUrl || null,
    });

    if (!created.ok) {
      return NextResponse.json(
        {
          success: false,
          results: [
            {
              platform: "instagram",
              ok: false,
              status: created.status,
              mode: videoUrl ? "video" : imageUrl ? "image" : "text",
              error: created.error,
              details: created.details,
            },
          ],
          summary: { attempted: 1, ok: 0, failed: 1, skipped: 0 },
          userMessage:
            "Instagram didn’t accept the media. Check the error details.",
        },
        { status: 200 }
      );
    }

    const creationId = created.creationId as string;

    // 2) If video, wait until ready (images usually publish immediately)
    const isVideo = !!(videoUrl && videoUrl.trim());
    if (isVideo) {
      const ready = await igWaitUntilReady(creationId);
      if (!ready.ok) {
        return NextResponse.json(
          {
            success: false,
            results: [
              {
                platform: "instagram",
                ok: false,
                status: ready.status,
                mode: "video",
                error: ready.error,
                details: ready.details,
              },
            ],
            summary: { attempted: 1, ok: 0, failed: 1, skipped: 0 },
            userMessage:
              "Instagram is still processing the video (or returned an error).",
          },
          { status: 200 }
        );
      }
    }

    // 3) Publish
    const published = await igPublish(creationId);
    if (!published.ok) {
      return NextResponse.json(
        {
          success: false,
          results: [
            {
              platform: "instagram",
              ok: false,
              status: published.status,
              mode: isVideo ? "video" : imageUrl ? "image" : "text",
              error: published.error,
              details: published.details,
            },
          ],
          summary: { attempted: 1, ok: 0, failed: 1, skipped: 0 },
          userMessage: "Instagram publish failed. See details.",
        },
        { status: 200 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        results: [
          {
            platform: "instagram",
            ok: true,
            postedId: published.postedId,
            mode: isVideo ? "video" : imageUrl ? "image" : "text",
            details: published.details,
          },
        ],
        summary: { attempted: 1, ok: 1, failed: 0, skipped: 0 },
        userMessage: "Instagram sent ✅",
      },
      { status: 200 }
    );
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || "Quick Blast crashed." },
      { status: 200 }
    );
  }
}
