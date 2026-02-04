// app/api/facebook/reels/route.ts
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * Posts a Facebook Reel to a Page using a public video URL.
 *
 * Expected body:
 * {
 *   pageId: string,
 *   pageAccessToken: string,
 *   videoUrl: string,        // MUST be https and publicly fetchable
 *   description?: string
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({} as any));

    const pageId = String(body?.pageId || "").trim();
    const pageAccessToken = String(body?.pageAccessToken || "").trim();
    const videoUrl = String(body?.videoUrl || "").trim();
    const description = String(body?.description || "").trim();

    if (!pageId || !pageAccessToken) {
      return NextResponse.json(
        {
          ok: false,
          error: "Missing pageId or pageAccessToken",
          userMessage: "Facebook isn’t connected yet (missing Page ID/token).",
        },
        { status: 200 }
      );
    }

    if (!videoUrl || !/^https:\/\/.+/i.test(videoUrl)) {
      return NextResponse.json(
        {
          ok: false,
          error: "Missing/invalid videoUrl (must be https public URL)",
          userMessage: "Upload an MP4 first so we have a public video URL.",
        },
        { status: 200 }
      );
    }

    // Try the Reels endpoint first.
    // If the app/page permissions don’t allow it (or endpoint differs), we fallback to normal Page video.
    const reelsUrl = `https://graph.facebook.com/v24.0/${encodeURIComponent(pageId)}/video_reels`;

    const reelsBody = new URLSearchParams();
    reelsBody.set("access_token", pageAccessToken);
    reelsBody.set("video_url", videoUrl);
    if (description) reelsBody.set("description", description);

    const reelsRes = await fetch(reelsUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: reelsBody,
      cache: "no-store",
    });

    const reelsJson: any = await reelsRes.json().catch(() => null);

    if (reelsRes.ok && (reelsJson?.id || reelsJson?.post_id)) {
      return NextResponse.json(
        {
          ok: true,
          mode: "reel",
          postedId: String(reelsJson?.post_id || reelsJson?.id),
          details: reelsJson,
        },
        { status: 200 }
      );
    }

    // Fallback: normal Page video post (still works even if “Reels” publishing is blocked)
    const videoUrlEndpoint = `https://graph.facebook.com/v24.0/${encodeURIComponent(pageId)}/videos`;

    const vidBody = new URLSearchParams();
    vidBody.set("access_token", pageAccessToken);
    vidBody.set("file_url", videoUrl);
    if (description) vidBody.set("description", description);
    vidBody.set("published", "true");

    const vidRes = await fetch(videoUrlEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: vidBody,
      cache: "no-store",
    });

    const vidJson: any = await vidRes.json().catch(() => null);

    if (!vidRes.ok) {
      const msg =
        vidJson?.error?.message ||
        reelsJson?.error?.message ||
        "Facebook video publish failed.";
      return NextResponse.json(
        {
          ok: false,
          error: msg,
          userMessage:
            "Facebook wouldn’t accept this video URL. This is usually a URL fetch / permissions / processing issue.",
          details: { reelsAttempt: reelsJson, videoAttempt: vidJson },
          status: vidRes.status,
        },
        { status: 200 }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        mode: "video_fallback",
        postedId: String(vidJson?.id || ""),
        note:
          "Reels endpoint did not succeed, so we posted as a normal Page video instead.",
        details: { reelsAttempt: reelsJson, videoAttempt: vidJson },
      },
      { status: 200 }
    );
  } catch (err: any) {
    return NextResponse.json(
      {
        ok: false,
        error: err?.message || "Facebook reels route crashed.",
      },
      { status: 200 }
    );
  }
}
