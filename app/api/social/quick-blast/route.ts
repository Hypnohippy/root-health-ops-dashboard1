// app/api/social/quick-blast/route.ts
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * ✅ Browser test helper
 * Open /api/social/quick-blast in the browser to confirm the file deployed.
 */
export async function GET() {
  return NextResponse.json({
    ok: true,
    route: "app/api/social/quick-blast/route.ts",
    version: "2026-02-03-ig-ready-wait-v3-typed-no-supabase-import",
    note: "Fixes TS build error (details field), waits for FINISHED, retries publish if not ready.",
  });
}

type Platform = "instagram" | "facebook" | "threads" | "linkedin" | "tiktok";

type IgFailure = {
  ok: false;
  status: number;
  error: string;
  details: any | null;
};

type IgSuccess = {
  ok: true;
  status: number;
  postedId: string | null;
  details: any | null;
};

type IgPublishResult = IgFailure | IgSuccess;

/**
 * IMPORTANT:
 * This route is currently Instagram-only for publishing.
 * Other platforms are returned as "skipped" so Quick Blast UI can show what happened.
 *
 * Instagram credentials are taken from ENV for now:
 * - IG_ACCESS_TOKEN
 * - IG_USER_ID
 *
 * (Later we can switch this to per-org tokens from Supabase once your auth/session flow is stable.)
 */
const IG_ACCESS_TOKEN = process.env.IG_ACCESS_TOKEN || "";
const IG_USER_ID = process.env.IG_USER_ID || "";

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
      details: null,
    };
  }

  const hasVideo = !!(args.videoUrl && args.videoUrl.trim());
  const hasImage = !!(args.imageUrl && args.imageUrl.trim());

  if (!hasVideo && !hasImage) {
    return {
      ok: false,
      status: 400,
      error: "Instagram requires an image or a video URL for this post.",
      details: null,
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
    return { ok: false, status: res.status, error: String(friendly), details: json };
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

  return { ok: true, status: 200, creationId: String(creationId), details: json };
}

/**
 * ✅ Wait until container is ready (FINISHED)
 * Do this for BOTH images and videos to reduce “not ready” errors.
 */
async function igWaitUntilReady(args: { creationId: string; isVideo: boolean }) {
  if (!IG_ACCESS_TOKEN) {
    return { ok: false, status: 400, error: "Instagram not configured (missing IG_ACCESS_TOKEN).", details: null };
  }

  const maxAttempts = args.isVideo ? 12 : 10;
  const delayMs = args.isVideo ? 5000 : 2500;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const url = new URL(`https://graph.facebook.com/v24.0/${args.creationId}`);
    url.searchParams.set("fields", "status_code");
    url.searchParams.set("access_token", IG_ACCESS_TOKEN);

    const res = await fetch(url.toString(), { method: "GET", cache: "no-store" });
    const json = await res.json().catch(() => null);

    if (!res.ok) {
      const friendly =
        json?.error?.error_user_msg ||
        json?.error?.message ||
        "Instagram status check failed.";
      return { ok: false, status: res.status, error: String(friendly), details: json };
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
    error: "Instagram is still processing the media. Wait a moment and try again.",
    details: null,
  };
}

async function igPublishOnce(args: { creationId: string }): Promise<IgPublishResult> {
  if (!IG_ACCESS_TOKEN || !IG_USER_ID) {
    return {
      ok: false,
      status: 400,
      error: "Instagram not configured (missing IG_USER_ID or IG_ACCESS_TOKEN).",
      details: null,
    };
  }

  const url = new URL(`https://graph.facebook.com/v24.0/${IG_USER_ID}/media_publish`);
  url.searchParams.set("creation_id", args.creationId);
  url.searchParams.set("access_token", IG_ACCESS_TOKEN);

  const res = await fetch(url.toString(), { method: "POST" });
  const json = await res.json().catch(() => null);

  if (!res.ok) {
    const friendly =
      json?.error?.error_user_msg ||
      json?.error?.message ||
      "Instagram publish failed.";
    return { ok: false, status: res.status, error: String(friendly), details: json };
  }

  return { ok: true, status: 200, postedId: json?.id ? String(json.id) : null, details: json };
}

/**
 * ✅ Retry publish if IG says "not ready"
 * Fixes your: code 9007 / subcode 2207027 ("Media ID is not available")
 */
async function igPublishWithRetry(args: { creationId: string; isVideo: boolean }): Promise<IgPublishResult> {
  const maxPublishAttempts = 6;
  const delayMs = args.isVideo ? 5000 : 2500;

  for (let i = 1; i <= maxPublishAttempts; i++) {
    const out = await igPublishOnce({ creationId: args.creationId });
    if (out.ok) return out;

    const msg = String(out?.error || "").toLowerCase();
    const detailsMsg = String((out as any)?.details?.error?.message || "").toLowerCase();
    const userMsg = String((out as any)?.details?.error?.error_user_msg || "").toLowerCase();

    const notReady =
      msg.includes("not ready") ||
      userMsg.includes("not ready") ||
      detailsMsg.includes("media id is not available") ||
      detailsMsg.includes("not available");

    if (!notReady) return out;

    await new Promise((r) => setTimeout(r, delayMs));
  }

  // ✅ CRITICAL: Always include details so TS never fails the build
  return {
    ok: false,
    status: 400,
    error: "The media is still not ready to publish. Wait 10–30 seconds and try again.",
    details: null,
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({} as any));

    const message: string = String(body?.message ?? "");
    const imageUrl: string = String(body?.imageUrl ?? "");
    const videoUrl: string = String(body?.videoUrl ?? "");

    const platformsRaw: any[] = Array.isArray(body?.platforms) ? body.platforms : [];
    const platforms = platformsRaw
      .map((p) => String(p || "").toLowerCase().trim())
      .filter(Boolean) as Platform[];

    if (!message.trim()) {
      return NextResponse.json({ success: false, error: "Message is required." }, { status: 200 });
    }

    if (platforms.length === 0) {
      return NextResponse.json({ success: false, error: "No platforms selected." }, { status: 200 });
    }

    const results: any[] = [];

    for (const p of platforms) {
      if (p !== "instagram") {
        results.push({
          platform: p,
          ok: false,
          skipped: true,
          status: 200,
          error: `Quick Blast route currently publishes to Instagram only. ${p} skipped.`,
        });
        continue;
      }

      const created = await igCreateContainer({
        caption: message,
        imageUrl: imageUrl || null,
        videoUrl: videoUrl || null,
      });

      if (!(created as any).ok) {
        results.push({
          platform: "instagram",
          ok: false,
          status: (created as any).status,
          mode: videoUrl ? "video" : imageUrl ? "image" : "text",
          error: (created as any).error,
          details: (created as any).details ?? null,
        });
        continue;
      }

      const creationId = String((created as any).creationId || "");
      const isVideo = !!(videoUrl && videoUrl.trim());

      // ✅ Wait until FINISHED for both image and video
      const ready = await igWaitUntilReady({ creationId, isVideo });
      if (!ready.ok) {
        results.push({
          platform: "instagram",
          ok: false,
          status: ready.status,
          mode: isVideo ? "video" : imageUrl ? "image" : "text",
          error: ready.error,
          details: ready.details ?? null,
        });
        continue;
      }

      // ✅ Publish with retry if not ready
      const published = await igPublishWithRetry({ creationId, isVideo });

      if (!published.ok) {
        results.push({
          platform: "instagram",
          ok: false,
          status: published.status,
          mode: isVideo ? "video" : imageUrl ? "image" : "text",
          error: published.error,
          details: published.details ?? null,
        });
        continue;
      }

      results.push({
        platform: "instagram",
        ok: true,
        status: 200,
        postedId: published.postedId,
        mode: isVideo ? "video" : imageUrl ? "image" : "text",
        details: published.details ?? null,
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
        userMessage: ok > 0 ? "Instagram sent ✅ (others skipped)." : "No posts sent from this route.",
      },
      { status: 200 }
    );
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message || "Quick Blast crashed." }, { status: 200 });
  }
}
