import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

export const runtime = "nodejs";

type ProviderId =
  | "facebook"
  | "instagram"
  | "tiktok"
  | "linkedin"
  | "google"
  | "email"
  | "whatsapp"
  | "threads";

type SocialAccountRow = {
  id: string;
  organisation_id: string;
  platform: ProviderId;
  page_id: string | null;
  page_name: string | null;
  connection_type: string | null;
  make_webhook_url: string | null;
  is_active: boolean | null;
  page_access_token: string | null;
  token_expires_at: string | null;
};

function safeBaseUrl(appUrl: string) {
  return (appUrl || "").replace(/\/$/, "");
}

function baseUrl(req: NextRequest) {
  const env = process.env.NEXT_PUBLIC_APP_URL || "";
  if (env) return safeBaseUrl(env);
  return req.nextUrl.origin;
}

async function getSingleTenantOrganisationId() {
  const { data, error } = await supabaseAdmin
    .from("organisations")
    .select("id")
    .limit(1);

  if (error) {
    console.error("[quick-blast] organisations error", error);
    return null;
  }
  if (!data || data.length === 0) return null;
  return data[0].id as string;
}

async function resolveOrganisationId(req: NextRequest, bodyOrgId?: string) {
  try {
    const orgFromQuery = req.nextUrl.searchParams.get("organisationId");
    if (orgFromQuery && orgFromQuery.trim()) return orgFromQuery.trim();
  } catch {}
  if (bodyOrgId && String(bodyOrgId).trim()) return String(bodyOrgId).trim();
  return await getSingleTenantOrganisationId();
}

async function loadSocialAccount(
  organisationId: string,
  platform: ProviderId
): Promise<SocialAccountRow | null> {
  const { data, error } = await supabaseAdmin
    .from("social_accounts")
    .select(
      "id, organisation_id, platform, page_id, page_name, connection_type, make_webhook_url, is_active, page_access_token, token_expires_at"
    )
    .eq("organisation_id", organisationId)
    .eq("platform", platform)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[quick-blast] social_accounts load error", error);
    return null;
  }
  return (data as any) ?? null;
}

function isLikelyImageUrl(url: string) {
  const u = (url || "").trim();
  if (!u) return false;
  if (!/^https:\/\/.+/i.test(u)) return false;
  return /\.(jpg|jpeg|png|webp|gif)(\?.*)?$/i.test(u);
}

function isLikelyVideoUrl(url: string) {
  const u = (url || "").trim();
  if (!u) return false;
  if (!/^https:\/\/.+/i.test(u)) return false;
  return /\.(mp4|mov|m4v)(\?.*)?$/i.test(u);
}

async function postToFacebook(args: {
  pageId: string;
  pageAccessToken: string;
  message: string;
  imageUrl?: string;
}) {
  // Photo post
  if (args.imageUrl && args.imageUrl.trim()) {
    const imageUrl = args.imageUrl.trim();

    if (!isLikelyImageUrl(imageUrl)) {
      return {
        ok: false,
        status: 400,
        json: {
          error: {
            message:
              "Facebook imageUrl must be a direct https image link (ending .jpg/.png etc).",
          },
        },
        mode: "photo" as const,
      };
    }

    const url = `https://graph.facebook.com/v24.0/${encodeURIComponent(
      args.pageId
    )}/photos`;

    const body = new URLSearchParams();
    body.set("url", imageUrl);
    body.set("caption", args.message);
    body.set("published", "true");
    body.set("access_token", args.pageAccessToken);

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      cache: "no-store",
    });

    const json: any = await res.json().catch(() => null);
    return { ok: res.ok, status: res.status, json, mode: "photo" as const };
  }

  // Text post
  const url = `https://graph.facebook.com/v24.0/${encodeURIComponent(
    args.pageId
  )}/feed`;

  const body = new URLSearchParams();
  body.set("message", args.message);
  body.set("access_token", args.pageAccessToken);

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });

  const json: any = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, json, mode: "text" as const };
}

async function postToLinkedIn(args: {
  req: NextRequest;
  message: string;
  organisationId: string;
}) {
  const url = `${baseUrl(args.req)}/api/linkedin/post`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: args.message, // linkedin route expects "text"
      organisationId: args.organisationId,
    }),
    cache: "no-store",
  });

  const json: any = await res.json().catch(() => null);

  return {
    ok: res.ok && !!json?.postedId,
    status: res.status,
    json,
    error:
      json?.error ||
      json?.message ||
      (!res.ok ? `LinkedIn request failed (${res.status})` : null),
  };
}

/**
 * ✅ Instagram direct publish (no Ayrshare, no Make)
 * Uses Instagram Graph content publishing flow: create container → publish. :contentReference[oaicite:0]{index=0}
 */
async function postToInstagram(args: {
  organisationId: string;
  message: string;
  imageUrl?: string;
  videoUrl?: string;
}) {
  const row = await loadSocialAccount(args.organisationId, "instagram");

  if (!row?.page_id) {
    return {
      ok: false,
      status: 401,
      json: {
        error:
          "Instagram is not connected (missing page_id). Reconnect Instagram on Connect page.",
      },
    };
  }
  if (!row?.page_access_token) {
    return {
      ok: false,
      status: 401,
      json: {
        error:
          "Instagram is not connected (missing access token). Reconnect Instagram on Connect page.",
      },
    };
  }

  const igUserId = row.page_id;
  const accessToken = row.page_access_token;

  const hasImage = !!args.imageUrl?.trim();
  const hasVideo = !!args.videoUrl?.trim();

  // NOTE: You can loosen these checks later, but they prevent “mystery failures”.
  if (hasImage && !isLikelyImageUrl(args.imageUrl!)) {
    return {
      ok: false,
      status: 400,
      json: { error: "Instagram imageUrl must be a direct https image link (.jpg/.png/.webp/.gif)." },
    };
  }
  if (hasVideo && !isLikelyVideoUrl(args.videoUrl!)) {
    return {
      ok: false,
      status: 400,
      json: { error: "Instagram videoUrl must be a direct https video link (.mp4/.mov/.m4v)." },
    };
  }

  // 1) Create media container
  const createUrl = `https://graph.facebook.com/v24.0/${encodeURIComponent(
    igUserId
  )}/media`;

  const createBody = new URLSearchParams();
  createBody.set("caption", args.message);
  createBody.set("access_token", accessToken);

  if (hasVideo) {
    createBody.set("video_url", args.videoUrl!.trim());
    // many apps use REELS for video publishing; if your app is set for reels, this helps
    createBody.set("media_type", "REELS");
  } else if (hasImage) {
    createBody.set("image_url", args.imageUrl!.trim());
  } else {
    // Instagram generally requires media; text-only isn’t a standard IG feed publish
    return {
      ok: false,
      status: 400,
      json: { error: "Instagram requires an imageUrl or videoUrl (text-only posts are not supported)." },
    };
  }

  const createRes = await fetch(createUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: createBody,
    cache: "no-store",
  });

  const createJson: any = await createRes.json().catch(() => null);

  if (!createRes.ok || !createJson?.id) {
    return {
      ok: false,
      status: createRes.status,
      json: createJson || { error: "Failed creating Instagram media container." },
    };
  }

  const creationId = String(createJson.id);

  // 2) Publish container
  const publishUrl = `https://graph.facebook.com/v24.0/${encodeURIComponent(
    igUserId
  )}/media_publish`;

  const publishBody = new URLSearchParams();
  publishBody.set("creation_id", creationId);
  publishBody.set("access_token", accessToken);

  const pubRes = await fetch(publishUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: publishBody,
    cache: "no-store",
  });

  const pubJson: any = await pubRes.json().catch(() => null);

  if (!pubRes.ok || !pubJson?.id) {
    return {
      ok: false,
      status: pubRes.status,
      json: pubJson || { error: "Failed publishing Instagram media container." },
    };
  }

  return {
    ok: true,
    status: 200,
    json: {
      postedId: String(pubJson.id),
      creationId,
      mode: hasVideo ? "video" : "image",
    },
  };
}

/**
 * ✅ Threads direct publish (no Ayrshare, no Make)
 * Threads API flow: create container → publish. :contentReference[oaicite:1]{index=1}
 */
async function postToThreads(args: {
  organisationId: string;
  message: string;
  imageUrl?: string;
  videoUrl?: string;
}) {
  const row = await loadSocialAccount(args.organisationId, "threads");

  if (!row?.page_id) {
    return {
      ok: false,
      status: 401,
      json: {
        error:
          "Threads is not connected (missing page_id). Reconnect Threads on Connect page.",
      },
    };
  }
  if (!row?.page_access_token) {
    return {
      ok: false,
      status: 401,
      json: {
        error:
          "Threads is not connected (missing access token). Reconnect Threads on Connect page.",
      },
    };
  }

  const threadsUserId = row.page_id;
  const accessToken = row.page_access_token;

  const hasImage = !!args.imageUrl?.trim();
  const hasVideo = !!args.videoUrl?.trim();

  if (hasImage && !isLikelyImageUrl(args.imageUrl!)) {
    return {
      ok: false,
      status: 400,
      json: { error: "Threads imageUrl must be a direct https image link (.jpg/.png/.webp/.gif)." },
    };
  }
  if (hasVideo && !isLikelyVideoUrl(args.videoUrl!)) {
    return {
      ok: false,
      status: 400,
      json: { error: "Threads videoUrl must be a direct https video link (.mp4/.mov/.m4v)." },
    };
  }

  // 1) Create container
  const createUrl = `https://graph.threads.net/v1.0/${encodeURIComponent(
    threadsUserId
  )}/threads`;

  const createBody = new URLSearchParams();
  createBody.set("access_token", accessToken);
  createBody.set("text", args.message);

  // If you pass a media url, Threads expects the appropriate field
  if (hasImage) createBody.set("image_url", args.imageUrl!.trim());
  if (hasVideo) createBody.set("video_url", args.videoUrl!.trim());

  const createRes = await fetch(createUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: createBody,
    cache: "no-store",
  });

  const createJson: any = await createRes.json().catch(() => null);

  if (!createRes.ok || !createJson?.id) {
    return {
      ok: false,
      status: createRes.status,
      json: createJson || { error: "Failed creating Threads container." },
    };
  }

  const creationId = String(createJson.id);

  // 2) Publish
  const publishUrl = `https://graph.threads.net/v1.0/${encodeURIComponent(
    threadsUserId
  )}/threads_publish`;

  const publishBody = new URLSearchParams();
  publishBody.set("access_token", accessToken);
  publishBody.set("creation_id", creationId);

  const pubRes = await fetch(publishUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: publishBody,
    cache: "no-store",
  });

  const pubJson: any = await pubRes.json().catch(() => null);

  if (!pubRes.ok || !pubJson?.id) {
    return {
      ok: false,
      status: pubRes.status,
      json: pubJson || { error: "Failed publishing Threads container." },
    };
  }

  return {
    ok: true,
    status: 200,
    json: {
      postedId: String(pubJson.id),
      creationId,
      mode: hasVideo ? "video" : hasImage ? "image" : "text",
    },
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));

    const message = String(body?.message ?? "").trim();
    const imageUrl = String(body?.imageUrl ?? "").trim();
    const videoUrl = String(body?.videoUrl ?? "").trim();

    const platformsRaw = Array.isArray(body?.platforms) ? body.platforms : [];
    const platforms: ProviderId[] = platformsRaw
      .map((p: any) => String(p || "").toLowerCase().trim())
      .filter(Boolean) as ProviderId[];

    if (!message) {
      return NextResponse.json(
        { success: false, error: "Message is required." },
        { status: 400 }
      );
    }

    if (platforms.length === 0) {
      return NextResponse.json(
        { success: false, error: "At least one platform is required." },
        { status: 400 }
      );
    }

    const organisationId = await resolveOrganisationId(req, body?.organisationId);
    if (!organisationId) {
      return NextResponse.json(
        { success: false, error: "No organisation found in database." },
        { status: 400 }
      );
    }

    const results: any[] = [];

    for (const p of platforms) {
      // --- Facebook (direct) ---
      if (p === "facebook") {
        const row = await loadSocialAccount(organisationId, "facebook");

        if (!row?.page_id) {
          results.push({
            platform: "facebook",
            ok: false,
            error:
              "Facebook not connected (missing page_id). Go to Connect and connect Facebook.",
          });
          continue;
        }

        if (!row?.page_access_token) {
          results.push({
            platform: "facebook",
            ok: false,
            error:
              "Facebook connected but missing page_access_token. Reconnect Facebook and pick the Page again.",
          });
          continue;
        }

        const fb = await postToFacebook({
          pageId: row.page_id,
          pageAccessToken: row.page_access_token,
          message,
          imageUrl: imageUrl || undefined,
        });

        if (!fb.ok) {
          results.push({
            platform: "facebook",
            ok: false,
            status: fb.status,
            error: fb.json?.error?.message || "Facebook post failed",
            details: fb.json,
          });
          continue;
        }

        results.push({
          platform: "facebook",
          ok: true,
          postedId: fb.json?.post_id || fb.json?.id || null,
          mode: fb.mode,
        });

        continue;
      }

      // --- LinkedIn (direct route) ---
      if (p === "linkedin") {
        const li = await postToLinkedIn({ req, message, organisationId });

        if (!li.ok) {
          results.push({
            platform: "linkedin",
            ok: false,
            status: li.status,
            error: li.error || "LinkedIn post failed",
            details: li.json,
          });
          continue;
        }

        results.push({
          platform: "linkedin",
          ok: true,
          postedId: li.json?.postedId || null,
          mode: "text",
        });

        continue;
      }

      // --- Instagram (direct Graph publish) ---
      if (p === "instagram") {
        const ig = await postToInstagram({
          organisationId,
          message,
          imageUrl: imageUrl || undefined,
          videoUrl: videoUrl || undefined,
        });

        if (!ig.ok) {
          results.push({
            platform: "instagram",
            ok: false,
            status: ig.status,
            error: ig.json?.error || "Instagram post failed",
            details: ig.json,
          });
          continue;
        }

        results.push({
          platform: "instagram",
          ok: true,
          postedId: ig.json?.postedId || null,
          mode: ig.json?.mode || "media",
        });

        continue;
      }

      // --- Threads (direct Threads API publish) ---
      if (p === "threads") {
        const th = await postToThreads({
          organisationId,
          message,
          imageUrl: imageUrl || undefined,
          videoUrl: videoUrl || undefined,
        });

        if (!th.ok) {
          results.push({
            platform: "threads",
            ok: false,
            status: th.status,
            error: th.json?.error || "Threads post failed",
            details: th.json,
          });
          continue;
        }

        results.push({
          platform: "threads",
          ok: true,
          postedId: th.json?.postedId || null,
          mode: th.json?.mode || "text",
        });

        continue;
      }

      // Leave TikTok/others unchanged
      results.push({
        platform: p,
        ok: false,
        skipped: true,
        reason: "Not implemented here yet (kept unchanged).",
      });
    }

    const okCount = results.filter((r) => r.ok).length;
    const failCount = results.filter((r) => !r.ok && !r.skipped).length;
    const skippedCount = results.filter((r) => r.skipped).length;

    return NextResponse.json(
      {
        success: okCount > 0 && failCount === 0,
        organisationId,
        results,
        summary: {
          attempted: results.length,
          ok: okCount,
          failed: failCount,
          skipped: skippedCount,
        },
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("[quick-blast] unexpected error", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Internal server error" },
      { status: 500 }
    );
  }
}
