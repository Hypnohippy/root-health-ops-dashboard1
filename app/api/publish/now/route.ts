// app/api/publish/now/route.ts
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
  is_active: boolean | null;
  page_access_token: string | null;
};

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function isHttps(url: string) {
  return /^https:\/\/.+/i.test((url || "").trim());
}

function isLikelyImageUrl(url: string) {
  const u = (url || "").trim();
  if (!u) return false;
  if (!isHttps(u)) return false;
  return /\.(jpg|jpeg|png|webp|gif)(\?.*)?$/i.test(u);
}

function isLikelyVideoUrl(url: string) {
  const u = (url || "").trim();
  if (!u) return false;
  if (!isHttps(u)) return false;
  const low = u.toLowerCase();
  return (
    /\.(mp4|mov|webm)(\?.*)?$/i.test(low) ||
    low.includes(".mp4") ||
    low.includes(".mov") ||
    low.includes(".webm")
  );
}

function originFromReq(req: NextRequest) {
  return req.nextUrl.origin;
}

function norm(v: any) {
  return String(v ?? "").trim();
}

function toPlatformList(raw: any[]): ProviderId[] {
  return (Array.isArray(raw) ? raw : [])
    .map((p: any) => String(p || "").toLowerCase().trim())
    .filter(Boolean) as ProviderId[];
}

function trimThreadsText(text: string) {
  const t = String(text || "").trim();
  if (t.length <= 500) return { text: t, trimmed: false };
  return { text: t.slice(0, 497).trimEnd() + "…", trimmed: true };
}

// ✅ LinkedIn hardening
const LINKEDIN_TEXT_LIMIT = 3000;

// LinkedIn media usually needs an uploaded asset URN, not a random URL.
// We’ll treat only URNs as “safe media” for LinkedIn.
function isLinkedInAssetRef(v: string) {
  const s = (v || "").trim();
  if (!s) return false;
  return /^urn:li:/i.test(s);
}

function trimLinkedInText(text: string) {
  const t = String(text || "").trim();
  if (t.length <= LINKEDIN_TEXT_LIMIT) return { text: t, trimmed: false };
  return { text: t.slice(0, LINKEDIN_TEXT_LIMIT - 1).trimEnd() + "…", trimmed: true };
}

async function loadSocialAccount(
  organisationId: string,
  platform: ProviderId
): Promise<SocialAccountRow | null> {
  const { data, error } = await supabaseAdmin
    .from("social_accounts")
    .select(
      "id, organisation_id, platform, page_id, page_name, is_active, page_access_token"
    )
    .eq("organisation_id", organisationId)
    .eq("platform", platform)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[publish/now] social_accounts load error", error);
    return null;
  }
  return (data as any) ?? null;
}

/** ---------------- FACEBOOK ---------------- */

async function postToFacebookText(args: {
  pageId: string;
  pageAccessToken: string;
  message: string;
}) {
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

async function postToFacebookPhoto(args: {
  pageId: string;
  pageAccessToken: string;
  message: string;
  imageUrl: string;
}) {
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
      mode: "image" as const,
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
  return { ok: res.ok, status: res.status, json, mode: "image" as const };
}

async function postToFacebookVideo(args: {
  pageId: string;
  pageAccessToken: string;
  message: string;
  videoUrl: string;
}) {
  const videoUrl = args.videoUrl.trim();
  if (!isLikelyVideoUrl(videoUrl)) {
    return {
      ok: false,
      status: 400,
      json: {
        error: {
          message:
            "Facebook videoUrl must be a direct https video file link (.mp4/.mov/.webm).",
        },
      },
      mode: "video" as const,
    };
  }

  const url = `https://graph.facebook.com/v24.0/${encodeURIComponent(
    args.pageId
  )}/videos`;
  const body = new URLSearchParams();
  body.set("file_url", videoUrl);
  body.set("description", args.message);
  body.set("access_token", args.pageAccessToken);

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });

  const json: any = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, json, mode: "video" as const };
}

/** ---------------- THREADS ---------------- */

async function getThreadsUserId(accessToken: string) {
  const token = (accessToken || "").trim();
  const url = `https://graph.threads.net/v1.0/me?fields=id,username&access_token=${encodeURIComponent(
    token
  )}`;

  const res = await fetch(url, { method: "GET", cache: "no-store" });
  const json: any = await res.json().catch(() => null);

  if (!res.ok || !json?.id) {
    return {
      ok: false as const,
      status: res.status,
      error:
        json?.error?.message ||
        json?.message ||
        "Could not resolve Threads user id (token invalid?)",
      details: json,
    };
  }

  return { ok: true as const, status: 200, threadsUserId: String(json.id) };
}

function isThreadsMediaNotFound(errJson: any) {
  const msg = String(
    errJson?.error?.message ||
      errJson?.message ||
      errJson?.error?.error_user_msg ||
      ""
  )
    .toLowerCase()
    .trim();

  const subcode = errJson?.error?.error_subcode;

  return (
    msg.includes("media not found") ||
    msg.includes("cannot be found") ||
    msg.includes("does not exist") ||
    subcode === 4279009
  );
}

async function createThreadsContainer(args: {
  threadsUserId: string;
  token: string;
  mediaType: "TEXT" | "IMAGE" | "VIDEO";
  text: string;
  imageUrl?: string;
  videoUrl?: string;
}) {
  const createParams = new URLSearchParams();
  createParams.set("media_type", args.mediaType);
  createParams.set("text", args.text);
  if (args.mediaType === "IMAGE" && args.imageUrl)
    createParams.set("image_url", args.imageUrl.trim());
  if (args.mediaType === "VIDEO" && args.videoUrl)
    createParams.set("video_url", args.videoUrl.trim());
  createParams.set("access_token", args.token);

  const createRes = await fetch(
    `https://graph.threads.net/v1.0/${encodeURIComponent(
      args.threadsUserId
    )}/threads?${createParams.toString()}`,
    { method: "POST", cache: "no-store" }
  );

  const createJson: any = await createRes.json().catch(() => null);
  if (!createRes.ok || !createJson?.id) {
    return {
      ok: false as const,
      status: createRes.status,
      json: createJson || { error: "Threads create container failed" },
    };
  }

  return {
    ok: true as const,
    status: createRes.status,
    creationId: String(createJson.id),
    json: createJson,
  };
}

async function publishThreadsContainer(args: {
  threadsUserId: string;
  token: string;
  creationId: string;
}) {
  const publishParams = new URLSearchParams();
  publishParams.set("creation_id", args.creationId);
  publishParams.set("access_token", args.token);

  const pubRes = await fetch(
    `https://graph.threads.net/v1.0/${encodeURIComponent(
      args.threadsUserId
    )}/threads_publish?${publishParams.toString()}`,
    { method: "POST", cache: "no-store" }
  );

  const pubJson: any = await pubRes.json().catch(() => null);
  return { ok: pubRes.ok, status: pubRes.status, json: pubJson };
}

async function postToThreads(args: {
  accessToken: string;
  message: string;
  imageUrl?: string;
  videoUrl?: string;
}) {
  const token = (args.accessToken || "").trim();
  if (!token) {
    return {
      ok: false,
      status: 401,
      json: { error: "Threads is not connected (missing access token)." },
    };
  }

  const who = await getThreadsUserId(token);
  if (!who.ok) {
    return {
      ok: false,
      status: who.status,
      json: { error: who.error, details: who.details },
    };
  }

  const threadsUserId = who.threadsUserId;

  const hasVideo = !!(args.videoUrl && args.videoUrl.trim());
  const hasImage = !!(args.imageUrl && args.imageUrl.trim()) && !hasVideo;

  if (hasVideo && !isLikelyVideoUrl(args.videoUrl!)) {
    return {
      ok: false,
      status: 400,
      json: {
        error:
          "Threads videoUrl must be a direct https video file link (.mp4/.mov/.webm).",
      },
    };
  }

  if (hasImage && !isLikelyImageUrl(args.imageUrl!)) {
    return {
      ok: false,
      status: 400,
      json: {
        error:
          "Threads imageUrl must be a direct https image link (.jpg/.png/.webp/.gif).",
      },
    };
  }

  const trimmed = trimThreadsText(args.message);
  const text = trimmed.text;

  const mediaType: "TEXT" | "IMAGE" | "VIDEO" = hasVideo
    ? "VIDEO"
    : hasImage
    ? "IMAGE"
    : "TEXT";

  const created = await createThreadsContainer({
    threadsUserId,
    token,
    mediaType,
    text,
    imageUrl: hasImage ? args.imageUrl : undefined,
    videoUrl: hasVideo ? args.videoUrl : undefined,
  });

  if (!created.ok) {
    return { ok: false, status: created.status, json: created.json };
  }

  const creationId = created.creationId;

  if (mediaType === "VIDEO") await sleep(9000);
  else if (mediaType === "IMAGE") await sleep(2500);
  else await sleep(800);

  const retryDelaysMs =
    mediaType === "VIDEO"
      ? [0, 4000, 7000, 10000, 14000, 20000]
      : mediaType === "IMAGE"
      ? [0, 1500, 2500, 4000, 6000]
      : [0, 800, 1200, 2000];

  for (let attempt = 0; attempt < retryDelaysMs.length; attempt++) {
    const delay = retryDelaysMs[attempt];
    if (delay) await sleep(delay);

    const pub = await publishThreadsContainer({
      threadsUserId,
      token,
      creationId,
    });

    if (pub.ok && pub.json?.id) {
      return {
        ok: true,
        status: pub.status,
        json: {
          postedId: pub.json.id,
          containerId: creationId,
          threadsUserId,
          textTrimmed: trimmed.trimmed,
          media: mediaType.toLowerCase(),
        },
      };
    }

    if (!isThreadsMediaNotFound(pub.json) || attempt === retryDelaysMs.length - 1) {
      if (mediaType === "VIDEO" && isThreadsMediaNotFound(pub.json)) {
        const createdText = await createThreadsContainer({
          threadsUserId,
          token,
          mediaType: "TEXT",
          text,
        });

        if (createdText.ok) {
          await sleep(1200);
          const pubText = await publishThreadsContainer({
            threadsUserId,
            token,
            creationId: createdText.creationId,
          });

          if (pubText.ok && pubText.json?.id) {
            return {
              ok: true,
              status: pubText.status,
              json: {
                postedId: pubText.json.id,
                containerId: createdText.creationId,
                threadsUserId,
                textTrimmed: trimmed.trimmed,
                media: "text",
                note:
                  "Threads video publish was not ready in time (Media Not Found). Posted caption as TEXT-only.",
              },
            };
          }
        }
      }

      return {
        ok: false,
        status: pub.status,
        json: pub.json || { error: "Threads publish failed" },
      };
    }
  }

  return {
    ok: false,
    status: 400,
    json: { error: "Threads publish failed after retries." },
  };
}

/** ---------------- INSTAGRAM ---------------- */

async function postToInstagramImage(args: {
  igUserId: string;
  accessToken: string;
  caption: string;
  imageUrl: string;
}) {
  const token = (args.accessToken || "").trim();
  const igUserId = (args.igUserId || "").trim();
  const imageUrl = (args.imageUrl || "").trim();

  if (!token)
    return { ok: false, status: 401, json: { error: "Instagram missing access token." } };
  if (!igUserId)
    return { ok: false, status: 400, json: { error: "Instagram missing IG User ID." } };
  if (!imageUrl)
    return { ok: false, status: 400, json: { error: "Instagram requires an image URL." } };
  if (!isLikelyImageUrl(imageUrl))
    return {
      ok: false,
      status: 400,
      json: {
        error:
          "Instagram imageUrl must be a direct https image link ending .jpg/.png/.webp/.gif",
      },
    };

  const createBody = new URLSearchParams();
  createBody.set("image_url", imageUrl);
  createBody.set("caption", args.caption || "");
  createBody.set("access_token", token);

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
      json: createJson || { error: "Instagram create container failed" },
    };
  }

  const creationId = String(createJson.id);

  const waitsMs = [2000, 2000, 3000, 5000, 8000, 8000];
  for (let i = 0; i < waitsMs.length; i++) {
    const statusRes = await fetch(
      `https://graph.facebook.com/v24.0/${encodeURIComponent(
        creationId
      )}?fields=status_code&access_token=${encodeURIComponent(token)}`,
      { method: "GET", cache: "no-store" }
    );
    const statusJson: any = await statusRes.json().catch(() => null);

    const statusCode = String(statusJson?.status_code || "").toUpperCase();
    if (statusRes.ok && statusCode === "FINISHED") break;

    if (!statusRes.ok && statusJson?.error) {
      return { ok: false, status: statusRes.status, json: statusJson };
    }

    await sleep(waitsMs[i]);
  }

  for (let attempt = 1; attempt <= 4; attempt++) {
    const publishBody = new URLSearchParams();
    publishBody.set("creation_id", creationId);
    publishBody.set("access_token", token);

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

    if (publishRes.ok && publishJson?.id) {
      return {
        ok: true,
        status: publishRes.status,
        json: {
          postedId: publishJson.id,
          containerId: creationId,
          media_type: "IMAGE",
        },
      };
    }

    const subcode = publishJson?.error?.error_subcode;
    if (subcode === 2207027 || publishJson?.error?.code === 9007) {
      await sleep(1500 * attempt);
      continue;
    }

    return {
      ok: false,
      status: publishRes.status,
      json: publishJson || { error: "Instagram publish failed" },
    };
  }

  return {
    ok: false,
    status: 400,
    json: {
      error:
        "Instagram is still processing this media. Please try again in a moment.",
      containerId: creationId,
    },
  };
}

async function postToInstagramVideo(args: {
  igUserId: string;
  accessToken: string;
  caption: string;
  videoUrl: string;
}) {
  const token = (args.accessToken || "").trim();
  const igUserId = (args.igUserId || "").trim();
  const videoUrl = (args.videoUrl || "").trim();

  if (!token)
    return { ok: false, status: 401, json: { error: "Instagram missing access token." } };
  if (!igUserId)
    return { ok: false, status: 400, json: { error: "Instagram missing IG User ID." } };
  if (!videoUrl)
    return { ok: false, status: 400, json: { error: "Instagram requires a video URL for video posts." } };
  if (!isLikelyVideoUrl(videoUrl))
    return {
      ok: false,
      status: 400,
      json: {
        error:
          "Instagram videoUrl must be a direct https video file link ending .mp4/.mov/.webm",
      },
    };

  const createBody = new URLSearchParams();
  createBody.set("media_type", "REELS");
  createBody.set("video_url", videoUrl);
  createBody.set("caption", args.caption || "");
  createBody.set("access_token", token);

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
      json: createJson || { error: "Instagram create video container failed" },
    };
  }

  const creationId = String(createJson.id);

  const waitsMs = [2500, 3000, 4000, 6000, 8000, 10000, 12000];
  for (let i = 0; i < waitsMs.length; i++) {
    const statusRes = await fetch(
      `https://graph.facebook.com/v24.0/${encodeURIComponent(
        creationId
      )}?fields=status_code&access_token=${encodeURIComponent(token)}`,
      { method: "GET", cache: "no-store" }
    );
    const statusJson: any = await statusRes.json().catch(() => null);
    const statusCode = String(statusJson?.status_code || "").toUpperCase();

    if (statusRes.ok && statusCode === "FINISHED") break;

    if (!statusRes.ok && statusJson?.error) {
      return { ok: false, status: statusRes.status, json: statusJson };
    }

    await sleep(waitsMs[i]);
  }

  for (let attempt = 1; attempt <= 5; attempt++) {
    const publishBody = new URLSearchParams();
    publishBody.set("creation_id", creationId);
    publishBody.set("access_token", token);

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

    if (publishRes.ok && publishJson?.id) {
      return {
        ok: true,
        status: publishRes.status,
        json: {
          postedId: publishJson.id,
          containerId: creationId,
          media_type: "REELS",
        },
      };
    }

    const subcode = publishJson?.error?.error_subcode;
    const code = publishJson?.error?.code;
    if (subcode === 2207027 || code === 9007) {
      await sleep(1600 * attempt);
      continue;
    }

    return {
      ok: false,
      status: publishRes.status,
      json: publishJson || { error: "Instagram video publish failed" },
    };
  }

  return {
    ok: false,
    status: 400,
    json: {
      error: "Instagram is still processing the video. Try again in a moment.",
      containerId: creationId,
    },
  };
}

/** ---------------- INTERNAL HELPERS (LINKEDIN / TIKTOK) ---------------- */

async function postToLinkedInViaInternal(
  req: NextRequest,
  args: {
    organisationId: string;
    message: string;
    imageUrl?: string;
    videoUrl?: string;
  }
) {
  const origin = originFromReq(req);

  const res = await fetch(`${origin}/api/linkedin/post`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      organisationId: args.organisationId,
      text: args.message,
      imageUrl: args.imageUrl || "",
      videoUrl: args.videoUrl || "",
    }),
    cache: "no-store",
  });

  const json: any = await res.json().catch(() => null);

  const ok = res.ok && !!json?.postedId;
  const error =
    json?.userMessage ||
    json?.error ||
    json?.message ||
    (!res.ok ? `LinkedIn request failed (${res.status})` : null);

  return { ok, status: res.status, json, error };
}

async function postToTikTokViaInternal(
  req: NextRequest,
  args: { organisationId: string; message: string; videoUrl: string }
) {
  const origin = originFromReq(req);

  const res = await fetch(`${origin}/api/tiktok/post`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      organisationId: args.organisationId,
      message: args.message,
      videoUrl: args.videoUrl,
    }),
    cache: "no-store",
  });

  const json: any = await res.json().catch(() => null);
  const ok = res.ok && !!json?.ok;
  const error =
    json?.userMessage ||
    json?.error ||
    (!res.ok ? `TikTok request failed (${res.status})` : null);

  return { ok, status: res.status, json, error };
}

/** ---------------- MAIN ---------------- */

export async function POST(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const organisationId = (url.searchParams.get("organisationId") || "").trim();

    if (!organisationId) {
      return NextResponse.json(
        { success: false, error: "Missing organisationId" },
        { status: 400 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const id = norm(body?.id);
    const platforms = toPlatformList(body?.platforms);

    if (!id)
      return NextResponse.json({ success: false, error: "Missing id" }, { status: 400 });
    if (platforms.length === 0)
      return NextResponse.json(
        { success: false, error: "Pick at least one platform" },
        { status: 400 }
      );

    const { data: row, error: readErr } = await supabaseAdmin
      .from("scheduled_posts")
      .select(
        "id, organisation_id, message, platforms, image_url, scheduled_for, status, meta"
      )
      .eq("id", id)
      .eq("organisation_id", organisationId)
      .maybeSingle();

    if (readErr || !row) {
      return NextResponse.json(
        { success: false, error: "Scheduled post not found for this organisation." },
        { status: 404 }
      );
    }

    // Base content
    const rawMessage = String((row as any).message || "").trim();
    const rawImageUrl = String((row as any).image_url || "").trim();
    const meta = (row as any).meta || {};
    const rawVideoUrl = String(meta?.video_url || "").trim();

    // Normalise media URLs for non-LinkedIn platforms
    const imageUrl = rawImageUrl && isLikelyImageUrl(rawImageUrl) ? rawImageUrl : "";
    const videoUrl = rawVideoUrl && isLikelyVideoUrl(rawVideoUrl) ? rawVideoUrl : "";

    // LinkedIn-safe text
    const liTrim = trimLinkedInText(rawMessage);
    const messageForLinkedIn = liTrim.text;

    const results: any[] = [];

    for (const p of platforms) {
      if (p === "facebook") {
        const acct = await loadSocialAccount(organisationId, "facebook");
        if (!acct?.page_id || !acct?.page_access_token) {
          results.push({
            platform: "facebook",
            ok: false,
            status: 401,
            error: "Facebook not connected (missing page_id or access token).",
          });
          continue;
        }

        if (videoUrl) {
          const fbv = await postToFacebookVideo({
            pageId: acct.page_id,
            pageAccessToken: acct.page_access_token,
            message: rawMessage,
            videoUrl,
          });

          if (!fbv.ok) {
            results.push({
              platform: "facebook",
              ok: false,
              status: fbv.status,
              error: fbv.json?.error?.message || "Facebook video post failed",
              details: fbv.json,
            });
          } else {
            results.push({
              platform: "facebook",
              ok: true,
              postedId: fbv.json?.id || fbv.json?.post_id || null,
              mode: "video",
            });
          }
          continue;
        }

        if (imageUrl) {
          const fbi = await postToFacebookPhoto({
            pageId: acct.page_id,
            pageAccessToken: acct.page_access_token,
            message: rawMessage,
            imageUrl,
          });

          if (!fbi.ok) {
            results.push({
              platform: "facebook",
              ok: false,
              status: fbi.status,
              error: fbi.json?.error?.message || "Facebook image post failed",
              details: fbi.json,
            });
          } else {
            results.push({
              platform: "facebook",
              ok: true,
              postedId: fbi.json?.id || fbi.json?.post_id || null,
              mode: "image",
            });
          }
          continue;
        }

        const fbt = await postToFacebookText({
          pageId: acct.page_id,
          pageAccessToken: acct.page_access_token,
          message: rawMessage,
        });

        if (!fbt.ok) {
          results.push({
            platform: "facebook",
            ok: false,
            status: fbt.status,
            error: fbt.json?.error?.message || "Facebook post failed",
            details: fbt.json,
          });
        } else {
          results.push({
            platform: "facebook",
            ok: true,
            postedId: fbt.json?.id || fbt.json?.post_id || null,
            mode: "text",
          });
        }
        continue;
      }

      if (p === "instagram") {
        const acct = await loadSocialAccount(organisationId, "instagram");
        if (!acct?.page_id || !acct?.page_access_token) {
          results.push({
            platform: "instagram",
            ok: false,
            status: 401,
            error: "Instagram not connected (missing IG user id or token).",
          });
          continue;
        }

        if (videoUrl) {
          const igv = await postToInstagramVideo({
            igUserId: acct.page_id,
            accessToken: acct.page_access_token,
            caption: rawMessage,
            videoUrl,
          });

          if (!igv.ok) {
            results.push({
              platform: "instagram",
              ok: false,
              status: igv.status,
              error:
                igv.json?.error ||
                igv.json?.error?.message ||
                "Instagram video post failed",
              details: igv.json,
            });
          } else {
            results.push({
              platform: "instagram",
              ok: true,
              postedId: igv.json?.postedId || null,
              mode: "video",
              details: igv.json,
            });
          }
          continue;
        }

        // Instagram image requires imageUrl
        const ig = await postToInstagramImage({
          igUserId: acct.page_id,
          accessToken: acct.page_access_token,
          caption: rawMessage,
          imageUrl: imageUrl || "",
        });

        if (!ig.ok) {
          results.push({
            platform: "instagram",
            ok: false,
            status: ig.status,
            error:
              ig.json?.error ||
              ig.json?.error?.message ||
              "Instagram post failed",
            details: ig.json,
          });
        } else {
          results.push({
            platform: "instagram",
            ok: true,
            postedId: ig.json?.postedId || null,
            mode: "image",
            details: ig.json,
          });
        }
        continue;
      }

      if (p === "threads") {
        const acct = await loadSocialAccount(organisationId, "threads");
        if (!acct?.page_access_token) {
          results.push({
            platform: "threads",
            ok: false,
            status: 401,
            error: "Threads not connected (missing token).",
          });
          continue;
        }

        const th = await postToThreads({
          accessToken: acct.page_access_token,
          message: rawMessage,
          imageUrl: imageUrl || undefined,
          videoUrl: videoUrl || undefined,
        });

        if (!th.ok) {
          results.push({
            platform: "threads",
            ok: false,
            status: th.status,
            error:
              th.json?.error ||
              th.json?.error?.message ||
              "Threads post failed",
            details: th.json,
          });
        } else {
          results.push({
            platform: "threads",
            ok: true,
            postedId: th.json?.postedId || null,
            mode: th.json?.media || (videoUrl ? "video" : imageUrl ? "image" : "text"),
            details: th.json,
          });
        }
        continue;
      }

      if (p === "linkedin") {
        // ✅ LinkedIn: default to TEXT-only unless media is a LinkedIn URN
        const liImageRef = isLinkedInAssetRef(rawImageUrl) ? rawImageUrl : "";
        const liVideoRef = isLinkedInAssetRef(rawVideoUrl) ? rawVideoUrl : "";

        const usedTextOnlyBecauseMediaNotUrn =
          (!!rawImageUrl && !liImageRef) || (!!rawVideoUrl && !liVideoRef);

        // First attempt
        const li1 = await postToLinkedInViaInternal(req, {
          organisationId,
          message: messageForLinkedIn,
          imageUrl: liImageRef || undefined,
          videoUrl: liVideoRef || undefined,
        });

        if (li1.ok) {
          results.push({
            platform: "linkedin",
            ok: true,
            postedId: li1.json?.postedId || null,
            mode: li1.json?.mode || (liVideoRef ? "video" : liImageRef ? "image" : "text"),
            details: {
              ...li1.json,
              note: [
                liTrim.trimmed ? "Text trimmed to LinkedIn limit." : null,
                usedTextOnlyBecauseMediaNotUrn
                  ? "Media dropped: LinkedIn generally needs uploaded asset URNs (not direct URLs)."
                  : null,
              ].filter(Boolean),
            },
          });
          continue;
        }

        // If LinkedIn failed and we tried media, retry TEXT-only once
        const didTryMedia = !!liImageRef || !!liVideoRef;
        if (didTryMedia) {
          const li2 = await postToLinkedInViaInternal(req, {
            organisationId,
            message: messageForLinkedIn,
            imageUrl: undefined,
            videoUrl: undefined,
          });

          if (li2.ok) {
            results.push({
              platform: "linkedin",
              ok: true,
              postedId: li2.json?.postedId || null,
              mode: "text",
              details: {
                ...li2.json,
                note: [
                  "Initial LinkedIn post failed with media; retried as TEXT-only and succeeded.",
                  liTrim.trimmed ? "Text trimmed to LinkedIn limit." : null,
                ].filter(Boolean),
              },
            });
            continue;
          }

          results.push({
            platform: "linkedin",
            ok: false,
            status: 200,
            error: li2.error || li1.error || "LinkedIn post failed",
            details: { firstAttempt: li1.json, retryTextOnly: li2.json },
          });
          continue;
        }

        // No media attempt, just failed
        results.push({
          platform: "linkedin",
          ok: false,
          status: 200,
          error: li1.error || "LinkedIn post failed",
          details: li1.json,
        });
        continue;
      }

      if (p === "tiktok") {
        if (!videoUrl) {
          results.push({
            platform: "tiktok",
            ok: false,
            status: 400,
            error: "TikTok requires a video (videoUrl). Upload a video then resend.",
          });
          continue;
        }

        const tk = await postToTikTokViaInternal(req, {
          organisationId,
          message: rawMessage,
          videoUrl,
        });

        if (!tk.ok) {
          results.push({
            platform: "tiktok",
            ok: false,
            status: 200,
            error: tk.error || "TikTok post failed",
            details: tk.json,
          });
        } else {
          results.push({
            platform: "tiktok",
            ok: true,
            postedId: tk.json?.postedId || null,
            mode: "video",
            details: tk.json,
          });
        }
        continue;
      }

      results.push({
        platform: p,
        ok: false,
        skipped: true,
        reason: "Not implemented in Post Now yet.",
      });
    }

    const okCount = results.filter((r) => r.ok).length;
    const failCount = results.filter((r) => !r.ok && !r.skipped).length;
    const skippedCount = results.filter((r) => r.skipped).length;

    const success = okCount > 0 && failCount === 0;

    const nowIso = new Date().toISOString();
    const nextMeta = {
      ...((row as any).meta || {}),
      last_publish_attempt_at: nowIso,
      last_publish_summary: {
        ok: okCount,
        failed: failCount,
        skipped: skippedCount,
        attempted: results.length,
      },
      // helpful breadcrumb
      linkedin_text_trimmed: liTrim.trimmed ? true : undefined,
    };

    const updatePayload: any = {
      error_info: {
        results,
        success,
        summary: {
          ok: okCount,
          failed: failCount,
          skipped: skippedCount,
          attempted: results.length,
        },
        organisationId,
      },
      meta: nextMeta,
    };

    if (success) {
      updatePayload.status = "posted";
      updatePayload.posted_at = nowIso;
    } else {
      updatePayload.status = "failed";
    }

    const { error: upErr } = await supabaseAdmin
      .from("scheduled_posts")
      .update(updatePayload)
      .eq("id", id)
      .eq("organisation_id", organisationId);

    if (upErr) {
      console.error("[publish/now] failed to update scheduled_posts", upErr);
      return NextResponse.json(
        {
          success,
          warning:
            "Published attempt ran, but failed to update DB row status/error_info.",
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
    }

    return NextResponse.json(
      {
        success,
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
    console.error("[publish/now] unexpected error", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Internal server error" },
      { status: 500 }
    );
  }
}
