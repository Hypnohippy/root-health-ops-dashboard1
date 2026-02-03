// app/api/social/quick-blast/route.ts
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * ✅ IMPORTANT:
 * - This GET is ONLY for easy browser testing (so you can see what code is live).
 * - Posting still happens via POST (from your dashboard UI).
 */
export async function GET() {
  return NextResponse.json({
    ok: true,
    route: "app/api/social/quick-blast/route.ts",
    version: "2026-02-03-debug-get-v1",
    note: "If you can see this in the browser, the new Quick Blast file is deployed.",
  });
}

const IG_ACCESS_TOKEN = process.env.IG_ACCESS_TOKEN;
const IG_USER_ID = process.env.IG_USER_ID;

// NOTE: Instagram publish helpers (kept from your current file)
async function igCreateContainer(args: {
  caption: string;
  imageUrl?: string | null;
  videoUrl?: string | null;
}) {
  if (!IG_ACCESS_TOKEN || !IG_USER_ID) {
    return {
      ok: false,
      status: 400,
      error: "Instagram not configured (missing IG_USER_ID or IG_ACCESS_TOKEN).",
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

    await new Promise((r) => setTimeout(r, delayMs));
  }

  return {
    ok: false,
    status: 408,
    error: "Instagram is still processing the video. Wait ~1 minute and try again.",
  };
}

async function igPublish(creationId: string) {
  if (!IG_ACCESS_TOKEN || !IG_USER_ID) {
    return {
      ok: false,
      status: 400,
      error: "Instagram not configured (missing IG_USER_ID or IG_ACCESS_TOKEN).",
    };
  }

  const url = new URL(`https://graph.facebook.com/v24.0/${IG_USER_ID}/media_publish`);
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

  return { ok: true, status: 200, postedId: json?.id || null, details: json };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));

    const message: string = String(body?.message ?? "");
    const imageUrl: string = String(body?.imageUrl ?? "");
    const videoUrl: string = String(body?.videoUrl ?? "");

    const platformsRaw: any[] = Array.isArray(body?.platforms) ? body.platforms : [];
    const platforms = platformsRaw
      .map((p) => String(p || "").toLowerCase().trim())
      .filter(Boolean);

    if (!message.trim()) {
      return NextResponse.json(
        { success: false, error: "Message is required." },
        { status: 200 }
      );
    }

    if (platforms.length === 0) {
      return NextResponse.json(
        { success: false, error: "No platforms selected." },
        { status: 200 }
      );
    }

    const results: any[] = [];

    // ✅ Key change vs your old file:
    // We do NOT block everything if Instagram isn't selected.
    // We return per-platform results so the UI stays sane.
    for (const p of platforms) {
      if (p === "instagram") {
        const created = await igCreateContainer({
          caption: message,
          imageUrl: imageUrl || null,
          videoUrl: videoUrl || null,
        });

        if (!created.ok) {
          results.push({
            platform: "instagram",
            ok: false,
            status: created.status,
            mode: videoUrl ? "video" : imageUrl ? "image" : "text",
            error: created.error,
            details: created.details,
          });
          continue;
        }

        const creationId = created.creationId as string;

        const isVideo = !!(videoUrl && videoUrl.trim());
        if (isVideo) {
          const ready = await igWaitUntilReady(creationId);
          if (!ready.ok) {
            results.push({
              platform: "instagram",
              ok: false,
              status: ready.status,
              mode: "video",
              error: ready.error,
              details: ready.details,
            });
            continue;
          }
        }

        const published = await igPublish(creationId);
        if (!published.ok) {
          results.push({
            platform: "instagram",
            ok: false,
            status: published.status,
            mode: isVideo ? "video" : imageUrl ? "image" : "text",
            error: published.error,
            details: published.details,
          });
          continue;
        }

        results.push({
          platform: "instagram",
          ok: true,
          status: 200,
          postedId: published.postedId,
          mode: isVideo ? "video" : imageUrl ? "image" : "text",
          details: published.details,
        });

        continue;
      }

      // For now, we don't claim to post to other platforms from THIS route.
      // (Your project has other platform routes already.)
      results.push({
        platform: p,
        ok: false,
        skipped: true,
        status: 200,
        error: `Quick Blast route currently only publishes to Instagram. ${p} is skipped here.`,
      });
    }

    const attempted = results.length;
    const ok = results.filter((r) => r.ok).length;
    const failed = results.filter((r) => !r.ok && !r.skipped).length;
    const skipped = results.filter((r) => r.skipped).length;

    return NextResponse.json(
      {
        success: ok > 0 && failed === 0,
        results,
        summary: { attempted, ok, failed, skipped },
        userMessage:
          ok > 0
            ? "Posted to Instagram ✅ (others skipped here)."
            : "No posts sent from this route. (Instagram may be missing/expired.)",
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
