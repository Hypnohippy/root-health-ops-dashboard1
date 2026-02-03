// app/api/social/quick-blast/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";

export const runtime = "nodejs";

type Platform = "facebook" | "instagram" | "linkedin" | "threads" | "tiktok";

type SocialAccountRow = {
  platform: Platform;
  organisation_id: string;
  page_id: string | null;
  page_name: string | null;
  page_access_token: string | null;
  token_expires_at: string | null;
  is_active: boolean | null;
};

function safeBaseUrl(req: NextRequest) {
  const env = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
  return env || req.nextUrl.origin;
}

/**
 * Single-tenant beta helper:
 * - If NEXT_PUBLIC_SINGLE_ORG_ID is set, use it.
 * - Otherwise use the first org in the organisations table.
 */
async function getOrganisationId(): Promise<string | null> {
  const forced = (process.env.NEXT_PUBLIC_SINGLE_ORG_ID || "").trim();
  if (forced) return forced;

  const { data, error } = await supabaseAdmin
    .from("organisations")
    .select("id")
    .order("created_at", { ascending: true })
    .limit(1);

  if (error || !data || data.length === 0) return null;
  return String(data[0].id);
}

function normalizePlatforms(raw: any): Platform[] {
  const arr: string[] = Array.isArray(raw) ? raw : [];
  const cleaned = arr
    .map((p) => String(p || "").toLowerCase().trim())
    .filter(Boolean);

  const allowed = new Set<Platform>([
    "facebook",
    "instagram",
    "linkedin",
    "threads",
    "tiktok",
  ]);

  return cleaned.filter((p) => allowed.has(p as Platform)) as Platform[];
}

function modeForPayload(imageUrl: string, videoUrl: string) {
  if (videoUrl && videoUrl.trim()) return "video";
  if (imageUrl && imageUrl.trim()) return "image";
  return "text";
}

/* ---------------------------
   Instagram via stored token
---------------------------- */
async function igCreateContainer(args: {
  igUserId: string;
  accessToken: string;
  caption: string;
  imageUrl?: string | null;
  videoUrl?: string | null;
}) {
  const hasVideo = !!(args.videoUrl && args.videoUrl.trim());
  const hasImage = !!(args.imageUrl && args.imageUrl.trim());

  if (!hasVideo && !hasImage) {
    return {
      ok: false,
      status: 400,
      error: "Instagram requires an image or a video URL for this post.",
    };
  }

  const url = new URL(
    `https://graph.facebook.com/v24.0/${args.igUserId}/media`
  );
  url.searchParams.set("access_token", args.accessToken);
  url.searchParams.set("caption", args.caption);

  if (hasVideo) {
    // ✅ Video must be REELS for publishing
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

async function igWaitUntilReady(args: {
  creationId: string;
  accessToken: string;
}) {
  const maxAttempts = 12;
  const delayMs = 5000;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const url = new URL(`https://graph.facebook.com/v24.0/${args.creationId}`);
    url.searchParams.set("fields", "status_code");
    url.searchParams.set("access_token", args.accessToken);

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
    error:
      "Instagram is still processing the video. Wait ~1 minute and try again.",
  };
}

async function igPublish(args: {
  igUserId: string;
  accessToken: string;
  creationId: string;
}) {
  const url = new URL(
    `https://graph.facebook.com/v24.0/${args.igUserId}/media_publish`
  );
  url.searchParams.set("creation_id", args.creationId);
  url.searchParams.set("access_token", args.accessToken);

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

/* ---------------------------
   Facebook Page posting
   (text, image, video)
---------------------------- */
async function fbPost(args: {
  pageId: string;
  accessToken: string;
  message: string;
  imageUrl: string;
  videoUrl: string;
}) {
  const hasVideo = !!(args.videoUrl && args.videoUrl.trim());
  const hasImage = !!(args.imageUrl && args.imageUrl.trim());

  // Video
  if (hasVideo) {
    const url = new URL(
      `https://graph.facebook.com/v24.0/${args.pageId}/videos`
    );
    url.searchParams.set("access_token", args.accessToken);
    url.searchParams.set("description", args.message);
    url.searchParams.set("file_url", args.videoUrl.trim());

    const res = await fetch(url.toString(), { method: "POST" });
    const json = await res.json().catch(() => null);

    if (!res.ok) {
      const friendly =
        json?.error?.error_user_msg ||
        json?.error?.message ||
        "Facebook video post failed.";
      return { ok: false, status: res.status, error: friendly, details: json };
    }

    return { ok: true, status: 200, postedId: json?.id || null, details: json };
  }

  // Image
  if (hasImage) {
    const url = new URL(
      `https://graph.facebook.com/v24.0/${args.pageId}/photos`
    );
    url.searchParams.set("access_token", args.accessToken);
    url.searchParams.set("caption", args.message);
    url.searchParams.set("url", args.imageUrl.trim());

    const res = await fetch(url.toString(), { method: "POST" });
    const json = await res.json().catch(() => null);

    if (!res.ok) {
      const friendly =
        json?.error?.error_user_msg ||
        json?.error?.message ||
        "Facebook image post failed.";
      return { ok: false, status: res.status, error: friendly, details: json };
    }

    return { ok: true, status: 200, postedId: json?.post_id || json?.id || null, details: json };
  }

  // Text-only
  const url = new URL(`https://graph.facebook.com/v24.0/${args.pageId}/feed`);
  url.searchParams.set("access_token", args.accessToken);
  url.searchParams.set("message", args.message);

  const res = await fetch(url.toString(), { method: "POST" });
  const json = await res.json().catch(() => null);

  if (!res.ok) {
    const friendly =
      json?.error?.error_user_msg ||
      json?.error?.message ||
      "Facebook text post failed.";
    return { ok: false, status: res.status, error: friendly, details: json };
  }

  return { ok: true, status: 200, postedId: json?.id || null, details: json };
}

/* ---------------------------
   LinkedIn + Threads:
   call your existing server routes
---------------------------- */
async function callInternalRoute(req: NextRequest, path: string, body: any) {
  const base = safeBaseUrl(req);
  const url = new URL(path, base);

  const res = await fetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {}),
    cache: "no-store",
  });

  const json = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, json };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));

    const message: string = String(body?.message ?? "");
    const imageUrl: string = String(body?.imageUrl ?? "");
    const videoUrl: string = String(body?.videoUrl ?? "");
    const platforms = normalizePlatforms(body?.platforms);

    if (!message.trim()) {
      return NextResponse.json(
        { success: false, error: "Message is required." },
        { status: 200 }
      );
    }

    if (platforms.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "Select at least one platform.",
          userMessage: "Pick at least one channel and try again.",
        },
        { status: 200 }
      );
    }

    const organisationId = await getOrganisationId();
    if (!organisationId) {
      return NextResponse.json(
        {
          success: false,
          error: "No organisation found.",
          userMessage: "Workspace not found. Try refreshing /dashboard.",
        },
        { status: 200 }
      );
    }

    // Load active connections for this org
    const { data, error } = await supabaseAdmin
      .from("social_accounts")
      .select(
        "platform,organisation_id,page_id,page_name,page_access_token,token_expires_at,is_active"
      )
      .eq("organisation_id", organisationId)
      .in("platform", platforms)
      .eq("is_active", true);

    if (error) {
      return NextResponse.json(
        {
          success: false,
          error: error.message,
          userMessage: "Could not load connected channels.",
        },
        { status: 200 }
      );
    }

    const rows: SocialAccountRow[] = (data || []) as any;

    const results: any[] = [];
    let attempted = 0;
    let okCount = 0;
    let failed = 0;
    let skipped = 0;

    const mode = modeForPayload(imageUrl, videoUrl);

    for (const p of platforms) {
      const row = rows.find((r) => r.platform === p);

      if (!row || !row.page_access_token || !row.page_id) {
        results.push({
          platform: p,
          ok: false,
          skipped: true,
          status: 200,
          mode,
          error: "Not connected (missing token or id).",
        });
        skipped++;
        continue;
      }

      attempted++;

      // INSTAGRAM
      if (p === "instagram") {
        const igUserId = String(row.page_id);
        const accessToken = String(row.page_access_token);

        const created = await igCreateContainer({
          igUserId,
          accessToken,
          caption: message,
          imageUrl: imageUrl || null,
          videoUrl: videoUrl || null,
        });

        if (!created.ok) {
          results.push({
            platform: "instagram",
            ok: false,
            status: created.status,
            mode,
            error: created.error,
            details: created.details,
          });
          failed++;
          continue;
        }

        const creationId = String((created as any).creationId || "");

        const isVideo = !!(videoUrl && videoUrl.trim());
        if (isVideo) {
          const ready = await igWaitUntilReady({ creationId, accessToken });
          if (!ready.ok) {
            results.push({
              platform: "instagram",
              ok: false,
              status: ready.status,
              mode: "video",
              error: ready.error,
              details: ready.details,
            });
            failed++;
            continue;
          }
        }

        const published = await igPublish({
          igUserId,
          accessToken,
          creationId,
        });

        if (!published.ok) {
          results.push({
            platform: "instagram",
            ok: false,
            status: published.status,
            mode,
            error: published.error,
            details: published.details,
          });
          failed++;
          continue;
        }

        results.push({
          platform: "instagram",
          ok: true,
          status: 200,
          mode,
          postedId: published.postedId,
          details: published.details,
        });
        okCount++;
        continue;
      }

      // FACEBOOK
      if (p === "facebook") {
        const out = await fbPost({
          pageId: String(row.page_id),
          accessToken: String(row.page_access_token),
          message,
          imageUrl,
          videoUrl,
        });

        if (!out.ok) {
          results.push({
            platform: "facebook",
            ok: false,
            status: out.status,
            mode,
            error: out.error,
            details: (out as any).details,
          });
          failed++;
          continue;
        }

        results.push({
          platform: "facebook",
          ok: true,
          status: 200,
          mode,
          postedId: (out as any).postedId || null,
          details: (out as any).details,
        });
        okCount++;
        continue;
      }

      // LINKEDIN (use your existing route)
      if (p === "linkedin") {
        const r = await callInternalRoute(req, "/api/linkedin/post", {
          message,
          imageUrl,
          videoUrl,
        });

        if (!r.ok) {
          results.push({
            platform: "linkedin",
            ok: false,
            status: r.status,
            mode,
            error: r.json?.error || "LinkedIn post failed.",
            details: r.json,
          });
          failed++;
          continue;
        }

        results.push({
          platform: "linkedin",
          ok: true,
          status: 200,
          mode,
          details: r.json,
        });
        okCount++;
        continue;
      }

      // THREADS (use your existing route)
      if (p === "threads") {
        const r = await callInternalRoute(req, "/api/threads/manual-save", {
          message,
          imageUrl,
          videoUrl,
        });

        if (!r.ok) {
          results.push({
            platform: "threads",
            ok: false,
            status: r.status,
            mode,
            error: r.json?.error || "Threads post failed.",
            details: r.json,
          });
          failed++;
          continue;
        }

        results.push({
          platform: "threads",
          ok: true,
          status: 200,
          mode,
          details: r.json,
        });
        okCount++;
        continue;
      }

      // TIKTOK
      // (we do NOT attempt video publishing here yet — this file is for Quick Blast fan-out)
      if (p === "tiktok") {
        results.push({
          platform: "tiktok",
          ok: false,
          skipped: true,
          status: 200,
          mode,
          error:
            "TikTok publishing is not enabled in Quick Blast yet (connection is stored, posting API will be added separately).",
        });
        skipped++;
        continue;
      }
    }

    const success = okCount > 0 && failed === 0;

    return NextResponse.json(
      {
        success,
        organisationId,
        results,
        summary: {
          attempted,
          ok: okCount,
          failed,
          skipped,
        },
        userMessage: success
          ? "Sent ✅"
          : okCount > 0
          ? "Some posts sent, some failed. See details."
          : "Nothing sent. See details.",
      },
      { status: 200 }
    );
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        error: err?.message || "Quick Blast crashed.",
        userMessage: "Something went wrong. Try again in a minute.",
      },
      { status: 200 }
    );
  }
}
