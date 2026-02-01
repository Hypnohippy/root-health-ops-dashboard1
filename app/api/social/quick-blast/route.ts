// app/api/social/quick-blast/route.ts
import { NextRequest, NextResponse } from "next/server";

type Platform =
  | "facebook"
  | "instagram"
  | "linkedin"
  | "threads"
  | "tiktok"
  | "reddit"
  | "twitter"
  | "youtube"
  | "google";

type ResultItem = {
  platform: Platform;
  ok: boolean;
  status?: number;
  mode?: "text" | "image" | "video";
  postedId?: string;
  error?: any;
  details?: any;
};

const ALLOWED_PLATFORMS: Platform[] = [
  "facebook",
  "instagram",
  "linkedin",
  "threads",
  "tiktok",
  "reddit",
  "twitter",
  "youtube",
  "google",
];

function pickMode(imageUrl?: string, videoUrl?: string) {
  if (videoUrl && videoUrl.trim()) return "video";
  if (imageUrl && imageUrl.trim()) return "image";
  return "text";
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * -------------------------
 * FACEBOOK (direct)
 * -------------------------
 * Env expected:
 *  - FB_PAGE_ID
 *  - FB_PAGE_ACCESS_TOKEN
 */
async function postFacebook(args: {
  message: string;
  imageUrl?: string;
  videoUrl?: string;
}): Promise<ResultItem> {
  const pageId = process.env.FB_PAGE_ID;
  const token = process.env.FB_PAGE_ACCESS_TOKEN;

  if (!pageId || !token) {
    return {
      platform: "facebook",
      ok: false,
      status: 400,
      error: "Facebook not configured (missing FB_PAGE_ID or FB_PAGE_ACCESS_TOKEN).",
    };
  }

  const mode = pickMode(args.imageUrl, args.videoUrl);

  try {
    // TEXT
    if (mode === "text") {
      const form = new URLSearchParams();
      form.set("message", args.message);
      form.set("access_token", token);

      const res = await fetch(`https://graph.facebook.com/v19.0/${pageId}/feed`, {
        method: "POST",
        body: form,
      });

      const json = await res.json().catch(() => null);
      if (!res.ok) {
        return { platform: "facebook", ok: false, status: res.status, mode, error: json || "Facebook post failed", details: json };
      }

      return { platform: "facebook", ok: true, status: 200, mode, postedId: json?.id, details: json };
    }

    // IMAGE
    if (mode === "image") {
      const imageUrl = (args.imageUrl || "").trim();
      if (!imageUrl) {
        return { platform: "facebook", ok: false, status: 400, mode, error: "Facebook requires imageUrl for image mode." };
      }

      const form = new URLSearchParams();
      form.set("url", imageUrl);
      form.set("caption", args.message);
      form.set("access_token", token);

      const res = await fetch(`https://graph.facebook.com/v19.0/${pageId}/photos`, {
        method: "POST",
        body: form,
      });

      const json = await res.json().catch(() => null);
      if (!res.ok) {
        return { platform: "facebook", ok: false, status: res.status, mode, error: json || "Facebook image post failed", details: json };
      }

      return { platform: "facebook", ok: true, status: 200, mode, postedId: json?.post_id || json?.id, details: json };
    }

    // VIDEO
    const videoUrl = (args.videoUrl || "").trim();
    if (!videoUrl) {
      return { platform: "facebook", ok: false, status: 400, mode, error: "Facebook requires videoUrl for video mode." };
    }

    const form = new URLSearchParams();
    form.set("file_url", videoUrl);
    form.set("description", args.message);
    form.set("access_token", token);

    const res = await fetch(`https://graph.facebook.com/v19.0/${pageId}/videos`, {
      method: "POST",
      body: form,
    });

    const json = await res.json().catch(() => null);
    if (!res.ok) {
      return { platform: "facebook", ok: false, status: res.status, mode, error: json || "Facebook video post failed", details: json };
    }

    return { platform: "facebook", ok: true, status: 200, mode, postedId: json?.id, details: json };
  } catch (e: any) {
    return { platform: "facebook", ok: false, status: 500, mode, error: e?.message || "Facebook crashed" };
  }
}

/**
 * -------------------------
 * LINKEDIN (direct, text-only in this first pass)
 * -------------------------
 * Env expected:
 *  - LINKEDIN_ACCESS_TOKEN
 *  - LINKEDIN_AUTHOR_URN   (e.g. "urn:li:person:xxxx" OR "urn:li:organization:xxxx")
 *
 * NOTE: LinkedIn image/video requires upload registration flow. We can add that next.
 */
async function postLinkedIn(args: {
  message: string;
  imageUrl?: string;
  videoUrl?: string;
}): Promise<ResultItem> {
  const token = process.env.LINKEDIN_ACCESS_TOKEN;
  const author = process.env.LINKEDIN_AUTHOR_URN;

  const mode = pickMode(args.imageUrl, args.videoUrl);

  if (!token || !author) {
    return {
      platform: "linkedin",
      ok: false,
      status: 400,
      mode,
      error: "LinkedIn not configured (missing LINKEDIN_ACCESS_TOKEN or LINKEDIN_AUTHOR_URN).",
    };
  }

  // For now: text only. (We’ll add media upload in the next phase.)
  if (mode !== "text") {
    return {
      platform: "linkedin",
      ok: false,
      status: 400,
      mode,
      error:
        "LinkedIn media upload (image/video) is not enabled yet in direct mode. Use text-only for LinkedIn for now.",
    };
  }

  try {
    const payload = {
      author,
      lifecycleState: "PUBLISHED",
      specificContent: {
        "com.linkedin.ugc.ShareContent": {
          shareCommentary: { text: args.message },
          shareMediaCategory: "NONE",
        },
      },
      visibility: { "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" },
    };

    const res = await fetch("https://api.linkedin.com/v2/ugcPosts", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-Restli-Protocol-Version": "2.0.0",
      },
      body: JSON.stringify(payload),
    });

    const text = await res.text();
    let json: any = null;
    try {
      json = JSON.parse(text);
    } catch {}

    if (!res.ok) {
      return {
        platform: "linkedin",
        ok: false,
        status: res.status,
        mode,
        error: json || { raw: text },
        details: json || { raw: text },
      };
    }

    // LinkedIn returns id in header sometimes; we’ll return whatever we can
    const postedId = res.headers.get("x-restli-id") || json?.id || undefined;

    return { platform: "linkedin", ok: true, status: 200, mode, postedId, details: json || { raw: text } };
  } catch (e: any) {
    return { platform: "linkedin", ok: false, status: 500, mode, error: e?.message || "LinkedIn crashed" };
  }
}

/**
 * -------------------------
 * INSTAGRAM (direct via Graph API)
 * -------------------------
 * Env expected:
 *  - IG_USER_ID
 *  - IG_ACCESS_TOKEN
 *
 * Supports:
 *  - imageUrl => IMAGE
 *  - videoUrl => REELS
 */
async function postInstagram(args: {
  message: string;
  imageUrl?: string;
  videoUrl?: string;
}): Promise<ResultItem> {
  const igUserId = process.env.IG_USER_ID;
  const token = process.env.IG_ACCESS_TOKEN;

  const mode = pickMode(args.imageUrl, args.videoUrl);

  if (!igUserId || !token) {
    return {
      platform: "instagram",
      ok: false,
      status: 400,
      mode,
      error: "Instagram not configured (missing IG_USER_ID or IG_ACCESS_TOKEN).",
    };
  }

  try {
    // create container
    const createParams = new URLSearchParams();
    createParams.set("caption", args.message);
    createParams.set("access_token", token);

    if (mode === "image") {
      const imageUrl = (args.imageUrl || "").trim();
      if (!imageUrl) {
        return { platform: "instagram", ok: false, status: 400, mode, error: "Instagram requires imageUrl." };
      }
      createParams.set("image_url", imageUrl);
    } else if (mode === "video") {
      const videoUrl = (args.videoUrl || "").trim();
      if (!videoUrl) {
        return { platform: "instagram", ok: false, status: 400, mode, error: "Instagram requires videoUrl." };
      }
      createParams.set("video_url", videoUrl);
      // ✅ Reels
      createParams.set("media_type", "REELS");
    } else {
      return { platform: "instagram", ok: false, status: 400, mode, error: "Instagram requires an image or video URL." };
    }

    const createRes = await fetch(`https://graph.facebook.com/v19.0/${igUserId}/media`, {
      method: "POST",
      body: createParams,
    });

    const createJson = await createRes.json().catch(() => null);
    if (!createRes.ok) {
      return { platform: "instagram", ok: false, status: createRes.status, mode, error: createJson || "IG create failed", details: createJson };
    }

    const creationId = createJson?.id;
    if (!creationId) {
      return { platform: "instagram", ok: false, status: 500, mode, error: "Instagram did not return a creation id.", details: createJson };
    }

    // wait until ready (video especially)
    // We poll status up to ~45s total
    for (let i = 0; i < 15; i++) {
      await sleep(3000);

      const statusRes = await fetch(
        `https://graph.facebook.com/v19.0/${creationId}?fields=status_code&access_token=${encodeURIComponent(token)}`
      );
      const statusJson = await statusRes.json().catch(() => null);

      const code = String(statusJson?.status_code || "");
      if (code === "FINISHED") break;
      if (code === "ERROR") {
        return {
          platform: "instagram",
          ok: false,
          status: 400,
          mode,
          error: "Instagram media processing error.",
          details: statusJson,
        };
      }
    }

    // publish
    const pubParams = new URLSearchParams();
    pubParams.set("creation_id", creationId);
    pubParams.set("access_token", token);

    const pubRes = await fetch(`https://graph.facebook.com/v19.0/${igUserId}/media_publish`, {
      method: "POST",
      body: pubParams,
    });

    const pubJson = await pubRes.json().catch(() => null);
    if (!pubRes.ok) {
      return { platform: "instagram", ok: false, status: pubRes.status, mode, error: pubJson || "IG publish failed", details: pubJson };
    }

    return {
      platform: "instagram",
      ok: true,
      status: 200,
      mode,
      postedId: pubJson?.id,
      details: { creationId, ...pubJson },
    };
  } catch (e: any) {
    return { platform: "instagram", ok: false, status: 500, mode, error: e?.message || "Instagram crashed" };
  }
}

/**
 * -------------------------
 * THREADS (direct via Graph API)
 * -------------------------
 * Env expected:
 *  - THREADS_USER_ID
 *  - THREADS_ACCESS_TOKEN
 *
 * Supports:
 *  - text
 *  - imageUrl
 *  - videoUrl
 *
 * NOTE: Threads media publish can be “create container → wait → publish”
 */
async function postThreads(args: {
  message: string;
  imageUrl?: string;
  videoUrl?: string;
}): Promise<ResultItem> {
  const userId = process.env.THREADS_USER_ID;
  const token = process.env.THREADS_ACCESS_TOKEN;

  const mode = pickMode(args.imageUrl, args.videoUrl);

  if (!userId || !token) {
    return {
      platform: "threads",
      ok: false,
      status: 400,
      mode,
      error: "Threads not configured (missing THREADS_USER_ID or THREADS_ACCESS_TOKEN).",
    };
  }

  try {
    // Create container
    const createParams = new URLSearchParams();
    createParams.set("access_token", token);

    if (mode === "text") {
      createParams.set("media_type", "TEXT");
      createParams.set("text", args.message);
    } else if (mode === "image") {
      const imageUrl = (args.imageUrl || "").trim();
      if (!imageUrl) return { platform: "threads", ok: false, status: 400, mode, error: "Threads requires imageUrl." };
      createParams.set("media_type", "IMAGE");
      createParams.set("image_url", imageUrl);
      createParams.set("text", args.message);
    } else {
      const videoUrl = (args.videoUrl || "").trim();
      if (!videoUrl) return { platform: "threads", ok: false, status: 400, mode, error: "Threads requires videoUrl." };
      createParams.set("media_type", "VIDEO");
      createParams.set("video_url", videoUrl);
      createParams.set("text", args.message);
    }

    const createRes = await fetch(`https://graph.facebook.com/v19.0/${userId}/threads`, {
      method: "POST",
      body: createParams,
    });

    const createJson = await createRes.json().catch(() => null);
    if (!createRes.ok) {
      return { platform: "threads", ok: false, status: createRes.status, mode, error: createJson || "Threads create failed", details: createJson };
    }

    const containerId = createJson?.id;
    if (!containerId) {
      return { platform: "threads", ok: false, status: 500, mode, error: "Threads did not return a container id.", details: createJson };
    }

    // Wait until container is ready (prevents “Media Not Found” on publish)
    // Poll up to ~45s
    for (let i = 0; i < 15; i++) {
      await sleep(3000);
      const st = await fetch(
        `https://graph.facebook.com/v19.0/${containerId}?fields=status&access_token=${encodeURIComponent(token)}`
      );
      const stJson = await st.json().catch(() => null);
      const status = String(stJson?.status || "").toUpperCase();

      if (status === "FINISHED" || status === "READY") break;
      if (status === "ERROR" || status === "FAILED") {
        return { platform: "threads", ok: false, status: 400, mode, error: "Threads media processing failed.", details: stJson };
      }
    }

    // Publish container
    const pubParams = new URLSearchParams();
    pubParams.set("creation_id", containerId);
    pubParams.set("access_token", token);

    const pubRes = await fetch(`https://graph.facebook.com/v19.0/${userId}/threads_publish`, {
      method: "POST",
      body: pubParams,
    });

    const pubJson = await pubRes.json().catch(() => null);
    if (!pubRes.ok) {
      return { platform: "threads", ok: false, status: pubRes.status, mode, error: pubJson || "Threads publish failed", details: pubJson };
    }

    return {
      platform: "threads",
      ok: true,
      status: 200,
      mode,
      postedId: pubJson?.id,
      details: { containerId, ...pubJson },
    };
  } catch (e: any) {
    return { platform: "threads", ok: false, status: 500, mode, error: e?.message || "Threads crashed" };
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const message: string = (body?.message ?? "").toString();
    const platformsRaw: any[] = Array.isArray(body?.platforms) ? body.platforms : [];
    const imageUrl: string = (body?.imageUrl ?? "").toString();
    const videoUrl: string = (body?.videoUrl ?? "").toString();

    if (!message.trim()) {
      return NextResponse.json({ success: false, error: "Message is required." }, { status: 200 });
    }

    const platforms: Platform[] = platformsRaw
      .map((p) => String(p || "").toLowerCase().trim())
      .filter(Boolean) as Platform[];

    if (platforms.length === 0) {
      return NextResponse.json({ success: false, error: "Choose at least one platform." }, { status: 200 });
    }

    const invalid = platforms.filter((p) => !ALLOWED_PLATFORMS.includes(p));
    if (invalid.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: `Unsupported platform(s): ${invalid.join(", ")}`,
          allowed: ALLOWED_PLATFORMS,
        },
        { status: 200 }
      );
    }

    const results: ResultItem[] = [];

    for (const p of platforms) {
      if (p === "facebook") {
        results.push(await postFacebook({ message, imageUrl, videoUrl }));
        continue;
      }
      if (p === "linkedin") {
        results.push(await postLinkedIn({ message, imageUrl, videoUrl }));
        continue;
      }
      if (p === "instagram") {
        results.push(await postInstagram({ message, imageUrl, videoUrl }));
        continue;
      }
      if (p === "threads") {
        results.push(await postThreads({ message, imageUrl, videoUrl }));
        continue;
      }

      // Everything else is intentionally not implemented yet
      results.push({
        platform: p,
        ok: false,
        status: 501,
        error: "Direct posting for this platform is not implemented yet.",
      });
    }

    const attempted = results.length;
    const ok = results.filter((r) => r.ok).length;
    const failed = attempted - ok;

    return NextResponse.json(
      {
        success: failed === 0,
        results,
        summary: { attempted, ok, failed, skipped: 0 },
        userMessage:
          failed === 0
            ? "Sent."
            : ok > 0
            ? "Some posts didn’t send. See per-channel details."
            : "Quick Blast did not succeed on any channel. Check platform configuration.",
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
