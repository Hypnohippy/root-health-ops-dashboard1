// app/api/social/quick-blast/route.ts
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
  return /\.(mp4|mov|m4v|webm)(\?.*)?$/i.test(u);
}

// -------------------- FACEBOOK (direct) --------------------
async function postToFacebook(args: {
  pageId: string;
  pageAccessToken: string;
  message: string;
  imageUrl?: string;
}) {
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

// -------------------- LINKEDIN (your internal direct route) --------------------
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
      text: args.message,
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

// -------------------- INSTAGRAM (direct via IG Graph API) --------------------
// Requires imageUrl or videoUrl (IG does NOT accept pure text posts)
async function postToInstagram(args: {
  igUserId: string;
  accessToken: string;
  caption: string;
  imageUrl?: string;
  videoUrl?: string;
}) {
  const igUserId = args.igUserId.trim();

  const hasImage = !!args.imageUrl?.trim();
  const hasVideo = !!args.videoUrl?.trim();

  if (!hasImage && !hasVideo) {
    return {
      ok: false,
      status: 400,
      json: {
        error:
          "Instagram requires an imageUrl or videoUrl (Instagram does not support text-only posts).",
      },
    };
  }

  if (hasImage && args.imageUrl && !isLikelyImageUrl(args.imageUrl)) {
    return {
      ok: false,
      status: 400,
      json: { error: "Instagram imageUrl must be a direct https image link." },
    };
  }

  if (hasVideo && args.videoUrl && !isLikelyVideoUrl(args.videoUrl)) {
    return {
      ok: false,
      status: 400,
      json: { error: "Instagram videoUrl must be a direct https video link (.mp4 etc)." },
    };
  }

  // 1) Create media container
  const createBody = new URLSearchParams();
  createBody.set("access_token", args.accessToken);
  createBody.set("caption", args.caption);

  if (hasImage && args.imageUrl) {
    createBody.set("image_url", args.imageUrl.trim());
  } else if (hasVideo && args.videoUrl) {
    // For videos, many IG setups need REELS. If your account supports plain VIDEO, this still often works.
    createBody.set("video_url", args.videoUrl.trim());
    createBody.set("media_type", "REELS");
  }

  const createRes = await fetch(
    `https://graph.facebook.com/v24.0/${encodeURIComponent(igUserId)}/media`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: createBody,
      cache: "no-store",
    }
  );

  const createJson: any = await createRes.json().catch(() => null);

  if (!createRes.ok || !createJson?.id) {
    return {
      ok: false,
      status: createRes.status,
      json: createJson || { error: "Instagram media container create failed." },
    };
  }

  const creationId = String(createJson.id);

  // 2) Publish container
  const publishBody = new URLSearchParams();
  publishBody.set("access_token", args.accessToken);
  publishBody.set("creation_id", creationId);

  const publishRes = await fetch(
    `https://graph.facebook.com/v24.0/${encodeURIComponent(
      igUserId
    )}/media_publish`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: publishBody,
      cache: "no-store",
    }
  );

  const publishJson: any = await publishRes.json().catch(() => null);

  if (!publishRes.ok) {
    return {
      ok: false,
      status: publishRes.status,
      json: publishJson || { error: "Instagram publish failed." },
    };
  }

  return {
    ok: true,
    status: publishRes.status,
    json: { ...publishJson, creationId },
  };
}

// -------------------- THREADS (direct best-effort) --------------------
// NOTE: This uses the same “create then publish” pattern used by Meta.
// If your Threads setup expects a slightly different param name, the error_info will show it clearly.
async function postToThreads(args: {
  threadsUserId: string;
  accessToken: string;
  text: string;
  imageUrl?: string;
  videoUrl?: string;
}) {
  const userId = args.threadsUserId.trim();

  const createBody = new URLSearchParams();
  createBody.set("access_token", args.accessToken);
  createBody.set("text", args.text);

  if (args.imageUrl?.trim()) createBody.set("image_url", args.imageUrl.trim());
  if (args.videoUrl?.trim()) createBody.set("video_url", args.videoUrl.trim());

  const createRes = await fetch(
    `https://graph.facebook.com/v24.0/${encodeURIComponent(userId)}/threads`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: createBody,
      cache: "no-store",
    }
  );

  const createJson: any = await createRes.json().catch(() => null);

  if (!createRes.ok || !createJson?.id) {
    return {
      ok: false,
      status: createRes.status,
      json: createJson || { error: "Threads create failed." },
    };
  }

  const creationId = String(createJson.id);

  const publishBody = new URLSearchParams();
  publishBody.set("access_token", args.accessToken);
  publishBody.set("creation_id", creationId);

  const publishRes = await fetch(
    `https://graph.facebook.com/v24.0/${encodeURIComponent(
      userId
    )}/threads_publish`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: publishBody,
      cache: "no-store",
    }
  );

  const publishJson: any = await publishRes.json().catch(() => null);

  if (!publishRes.ok) {
    return {
      ok: false,
      status: publishRes.status,
      json: publishJson || { error: "Threads publish failed." },
    };
  }

  return {
    ok: true,
    status: publishRes.status,
    json: { ...publishJson, creationId },
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
      // FACEBOOK
      if (p === "facebook") {
        const row = await loadSocialAccount(organisationId, "facebook");

        if (!row?.page_id) {
          results.push({
            platform: "facebook",
            ok: false,
            error: "Facebook not connected (missing page_id).",
          });
          continue;
        }
        if (!row?.page_access_token) {
          results.push({
            platform: "facebook",
            ok: false,
            error: "Facebook connected but missing page_access_token.",
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

      // LINKEDIN
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

      // INSTAGRAM
      if (p === "instagram") {
        const row = await loadSocialAccount(organisationId, "instagram");

        if (!row?.page_id || !row.page_id.trim()) {
          results.push({
            platform: "instagram",
            ok: false,
            status: 401,
            error: "Instagram is not connected (missing IG page_id). Reconnect Instagram.",
          });
          continue;
        }
        if (!row?.page_access_token || !row.page_access_token.trim()) {
          results.push({
            platform: "instagram",
            ok: false,
            status: 401,
            error: "Instagram is not connected (missing access token). Reconnect Instagram.",
          });
          continue;
        }

        const ig = await postToInstagram({
          igUserId: row.page_id,
          accessToken: row.page_access_token,
          caption: message,
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
          postedId: ig.json?.id || null,
          mode: imageUrl ? "image" : videoUrl ? "video" : "unknown",
        });
        continue;
      }

      // THREADS
      if (p === "threads") {
        const row = await loadSocialAccount(organisationId, "threads");

        if (!row?.page_id || !row.page_id.trim()) {
          results.push({
            platform: "threads",
            ok: false,
            status: 401,
            error: "Threads is not connected (missing threads user id). Reconnect Threads.",
          });
          continue;
        }
        if (!row?.page_access_token || !row.page_access_token.trim()) {
          results.push({
            platform: "threads",
            ok: false,
            status: 401,
            error: "Threads is not connected (missing access token). Reconnect Threads.",
          });
          continue;
        }

        const th = await postToThreads({
          threadsUserId: row.page_id,
          accessToken: row.page_access_token,
          text: message,
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
          postedId: th.json?.id || null,
          mode: imageUrl ? "image" : videoUrl ? "video" : "text",
        });
        continue;
      }

      results.push({
        platform: p,
        ok: false,
        skipped: true,
        reason: "Not implemented here yet.",
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
