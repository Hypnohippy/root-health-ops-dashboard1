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

function originFromReq(req: NextRequest) {
  return req.nextUrl.origin;
}

function norm(v: any) {
  return String(v ?? "").trim();
}

function safeLower(v: any) {
  return String(v || "").toLowerCase().trim();
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

function toPlatformList(raw: any[]): ProviderId[] {
  return (Array.isArray(raw) ? raw : [])
    .map((p: any) => String(p || "").toLowerCase().trim())
    .filter(Boolean) as ProviderId[];
}

/** ---------------- SOCIAL ACCOUNT LOAD ---------------- */

async function loadSocialAccount(
  organisationId: string,
  platform: ProviderId
): Promise<SocialAccountRow | null> {
  const { data, error } = await supabaseAdmin
    .from("social_accounts")
    .select("id, organisation_id, platform, page_id, page_name, is_active, page_access_token")
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
  const url = `https://graph.facebook.com/v24.0/${encodeURIComponent(args.pageId)}/feed`;
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
            "Facebook needs a direct HTTPS image link ending in .jpg/.png/.webp/.gif (not a webpage).",
        },
      },
      mode: "image" as const,
    };
  }

  const url = `https://graph.facebook.com/v24.0/${encodeURIComponent(args.pageId)}/photos`;
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
            "Facebook needs a direct HTTPS video file link ending .mp4/.mov/.webm (not a webpage).",
        },
      },
      mode: "video" as const,
    };
  }

  const url = `https://graph.facebook.com/v24.0/${encodeURIComponent(args.pageId)}/videos`;
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

/** ---------------- INSTAGRAM (simple image posting) ----------------
 * Note: Instagram videos/reels are fussier. We support image posting here.
 */
async function createInstagramMediaContainer(args: {
  igUserId: string;
  accessToken: string;
  caption: string;
  imageUrl: string;
}) {
  const url =
    `https://graph.facebook.com/v24.0/${encodeURIComponent(args.igUserId)}/media?` +
    new URLSearchParams({
      image_url: args.imageUrl,
      caption: args.caption,
      access_token: args.accessToken,
    }).toString();

  const res = await fetch(url, { method: "POST", cache: "no-store" });
  const json: any = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, json };
}

async function publishInstagramMedia(args: {
  igUserId: string;
  accessToken: string;
  creationId: string;
}) {
  const url =
    `https://graph.facebook.com/v24.0/${encodeURIComponent(args.igUserId)}/media_publish?` +
    new URLSearchParams({
      creation_id: args.creationId,
      access_token: args.accessToken,
    }).toString();

  const res = await fetch(url, { method: "POST", cache: "no-store" });
  const json: any = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, json };
}

/** ---------------- THREADS ---------------- */

function trimThreadsText(text: string) {
  const t = String(text || "").trim();
  if (t.length <= 500) return { text: t, trimmed: false };
  return { text: t.slice(0, 497).trimEnd() + "…", trimmed: true };
}

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
  if (args.mediaType === "IMAGE" && args.imageUrl) createParams.set("image_url", args.imageUrl.trim());
  if (args.mediaType === "VIDEO" && args.videoUrl) createParams.set("video_url", args.videoUrl.trim());
  createParams.set("access_token", args.token);

  const createRes = await fetch(
    `https://graph.threads.net/v1.0/${encodeURIComponent(args.threadsUserId)}/threads?${createParams.toString()}`,
    { method: "POST", cache: "no-store" }
  );

  const createJson: any = await createRes.json().catch(() => null);
  if (!createRes.ok || !createJson?.id) {
    return { ok: false as const, status: createRes.status, json: createJson || { error: "Threads create failed" } };
  }

  return { ok: true as const, status: createRes.status, creationId: String(createJson.id), json: createJson };
}

async function publishThreadsContainer(args: { threadsUserId: string; token: string; creationId: string }) {
  const publishParams = new URLSearchParams();
  publishParams.set("creation_id", args.creationId);
  publishParams.set("access_token", args.token);

  const pubRes = await fetch(
    `https://graph.threads.net/v1.0/${encodeURIComponent(args.threadsUserId)}/threads_publish?${publishParams.toString()}`,
    { method: "POST", cache: "no-store" }
  );

  const pubJson: any = await pubRes.json().catch(() => null);
  return { ok: pubRes.ok, status: pubRes.status, json: pubJson };
}

async function postToThreads(args: { accessToken: string; message: string; imageUrl?: string; videoUrl?: string }) {
  const token = (args.accessToken || "").trim();
  if (!token) {
    return {
      ok: false,
      status: 401,
      json: {
        error: "Threads is connected but missing its access token (NO_TOKEN). Reconnect Threads or restore token.",
      },
    };
  }

  const who = await getThreadsUserId(token);
  if (!who.ok) {
    return { ok: false, status: who.status, json: { error: who.error, details: who.details } };
  }

  const threadsUserId = who.threadsUserId;

  const hasVideo = !!(args.videoUrl && args.videoUrl.trim());
  const hasImage = !!(args.imageUrl && args.imageUrl.trim()) && !hasVideo;

  if (hasVideo && !isLikelyVideoUrl(args.videoUrl!)) {
    return { ok: false, status: 400, json: { error: "Threads video needs a direct HTTPS .mp4/.mov/.webm link." } };
  }

  if (hasImage && !isLikelyImageUrl(args.imageUrl!)) {
    return { ok: false, status: 400, json: { error: "Threads image needs a direct HTTPS image link ending .jpg/.png/.webp/.gif." } };
  }

  const trimmed = trimThreadsText(args.message);
  const text = trimmed.text;

  const mediaType: "TEXT" | "IMAGE" | "VIDEO" = hasVideo ? "VIDEO" : hasImage ? "IMAGE" : "TEXT";

  const created = await createThreadsContainer({
    threadsUserId,
    token,
    mediaType,
    text,
    imageUrl: hasImage ? args.imageUrl : undefined,
    videoUrl: hasVideo ? args.videoUrl : undefined,
  });

  if (!created.ok) return { ok: false, status: created.status, json: created.json };

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

    const pub = await publishThreadsContainer({ threadsUserId, token, creationId });

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
      return { ok: false, status: pub.status, json: pub.json || { error: "Threads publish failed" } };
    }
  }

  return { ok: false, status: 400, json: { error: "Threads publish failed after retries." } };
}

/** ---------------- LINKEDIN (uses your internal route) ---------------- */

const LINKEDIN_TEXT_LIMIT = 3000;

function trimLinkedInText(text: string) {
  const t = String(text || "").trim();
  if (t.length <= LINKEDIN_TEXT_LIMIT) return { text: t, trimmed: false };
  return { text: t.slice(0, LINKEDIN_TEXT_LIMIT - 1).trimEnd() + "…", trimmed: true };
}

function isLinkedInAssetRef(v: string) {
  const s = (v || "").trim();
  if (!s) return false;
  return /^urn:li:/i.test(s);
}

function friendlyLinkedInHelp(args: {
  rawError: string;
  droppedMediaBecauseNotUrn: boolean;
  wasTrimmed: boolean;
}) {
  const raw = String(args.rawError || "").trim();
  const msg = raw.toLowerCase();

  let headline = "LinkedIn couldn’t publish this post.";
  let what = raw || "LinkedIn returned an error we couldn’t fully interpret.";
  let doThis: string[] = [
    "Try again with a shorter post.",
    "If you attached an image, try posting as text-only.",
  ];

  if (msg.includes("media") || msg.includes("asset") || msg.includes("image") || msg.includes("video")) {
    headline = "LinkedIn didn’t accept the media (image/video).";
    what =
      "LinkedIn usually won’t accept a normal image URL. It typically needs an uploaded LinkedIn media asset (URN).";
    doThis = [
      "Try text-only for LinkedIn (remove the media for LinkedIn).",
      "If you need an image on LinkedIn: we’ll add the proper LinkedIn upload step (creates an asset URN).",
    ];
  }

  if (msg.includes("too long") || msg.includes("length") || msg.includes("characters")) {
    headline = "LinkedIn said the post text is too long.";
    what = "LinkedIn has stricter text limits than other platforms.";
    doThis = [
      "Shorten the post (cut down the middle first).",
      `Keep it under about ${LINKEDIN_TEXT_LIMIT} characters to be safe.`,
    ];
  }

  if (msg.includes("unauthorized") || msg.includes("permission") || msg.includes("access token") || msg.includes("expired")) {
    headline = "LinkedIn connection issue.";
    what = "LinkedIn rejected the request because the connection may be expired or missing permissions.";
    doThis = ["Reconnect LinkedIn on the Connect page, then retry this post."];
  }

  const notes: string[] = [];
  if (args.droppedMediaBecauseNotUrn) notes.push("We removed the media for LinkedIn because it wasn’t an uploaded LinkedIn asset (URN).");
  if (args.wasTrimmed) notes.push("We shortened the text slightly to fit LinkedIn’s safe limit.");

  return { headline, what, doThis, notes };
}

async function postToLinkedInViaInternal(
  req: NextRequest,
  args: { organisationId: string; message: string; imageUrl?: string; videoUrl?: string }
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

/** ---------------- TIKTOK (uses your internal route) ---------------- */

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
  const error = json?.userMessage || json?.error || (!res.ok ? `TikTok request failed (${res.status})` : null);

  return { ok, status: res.status, json, error };
}

/** ---------------- MAIN ---------------- */

export async function POST(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const organisationId = (url.searchParams.get("organisationId") || "").trim();

    if (!organisationId) {
      return NextResponse.json({ success: false, error: "Missing organisationId" }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const id = norm(body?.id);
    const platforms = toPlatformList(body?.platforms);

    if (!id) return NextResponse.json({ success: false, error: "Missing id" }, { status: 400 });
    if (platforms.length === 0) return NextResponse.json({ success: false, error: "Pick at least one platform" }, { status: 400 });

    const { data: row, error: readErr } = await supabaseAdmin
      .from("scheduled_posts")
      .select("id, organisation_id, message, platforms, image_url, scheduled_for, status, meta")
      .eq("id", id)
      .eq("organisation_id", organisationId)
      .maybeSingle();

    if (readErr || !row) {
      return NextResponse.json({ success: false, error: "Scheduled post not found for this organisation." }, { status: 404 });
    }

    const rawMessage = String((row as any).message || "").trim();
    const rawImageUrl = String((row as any).image_url || "").trim();
    const meta = (row as any).meta || {};
    const rawVideoUrl = String(meta?.video_url || "").trim();

    const imageUrl = rawImageUrl && isLikelyImageUrl(rawImageUrl) ? rawImageUrl : "";
    const videoUrl = rawVideoUrl && isLikelyVideoUrl(rawVideoUrl) ? rawVideoUrl : "";

    const results: any[] = [];

    for (const p of platforms) {
      // THREADS
      if (p === "threads") {
        const acct = await loadSocialAccount(organisationId, "threads");
        const token = acct?.page_access_token || "";
        const r = await postToThreads({ accessToken: token, message: rawMessage, imageUrl, videoUrl });
        results.push({
          platform: "threads",
          ok: !!r.ok,
          status: r.status,
          postedId: r.json?.postedId || null,
          mode: r.json?.media || (videoUrl ? "video" : imageUrl ? "image" : "text"),
          details: r.json,
          userMessage: r.ok
            ? "Posted to Threads."
            : r.json?.error || "Threads couldn’t publish this. Reconnect Threads and try again.",
        });
        continue;
      }

      // FACEBOOK
      if (p === "facebook") {
        const acct = await loadSocialAccount(organisationId, "facebook");
        if (!acct?.page_id || !acct?.page_access_token) {
          results.push({
            platform: "facebook",
            ok: false,
            status: 401,
            error: "Facebook not connected (missing page id or token).",
            userMessage: "Facebook isn’t connected yet. Go to Connect → Facebook → Connect.",
          });
          continue;
        }

        const fb =
          videoUrl
            ? await postToFacebookVideo({ pageId: acct.page_id, pageAccessToken: acct.page_access_token, message: rawMessage, videoUrl })
            : imageUrl
            ? await postToFacebookPhoto({ pageId: acct.page_id, pageAccessToken: acct.page_access_token, message: rawMessage, imageUrl })
            : await postToFacebookText({ pageId: acct.page_id, pageAccessToken: acct.page_access_token, message: rawMessage });

        results.push({
          platform: "facebook",
          ok: fb.ok,
          status: fb.status,
          postedId: fb.json?.id || null,
          mode: fb.mode,
          details: fb.json,
          userMessage: fb.ok ? "Posted to Facebook." : fb.json?.error?.message || "Facebook couldn’t publish this.",
        });
        continue;
      }

      // INSTAGRAM (image only here)
      if (p === "instagram") {
        const acct = await loadSocialAccount(organisationId, "instagram");
        if (!acct?.page_id || !acct?.page_access_token) {
          results.push({
            platform: "instagram",
            ok: false,
            status: 401,
            error: "Instagram not connected (missing id or token).",
            userMessage: "Instagram isn’t connected yet. Go to Connect → Instagram → Connect.",
          });
          continue;
        }

        if (videoUrl) {
          results.push({
            platform: "instagram",
            ok: false,
            status: 200,
            error: "Instagram video posting isn’t enabled in this simplified flow yet.",
            userMessage: "Instagram video/reels needs a slightly different upload flow. For now, post an image or text-only.",
          });
          continue;
        }

        if (!imageUrl) {
          results.push({
            platform: "instagram",
            ok: false,
            status: 200,
            error: "Instagram needs an image URL for this flow.",
            userMessage: "Instagram posting needs an image. Add an image URL and try again.",
          });
          continue;
        }

        const created = await createInstagramMediaContainer({
          igUserId: acct.page_id,
          accessToken: acct.page_access_token,
          caption: rawMessage,
          imageUrl,
        });

        if (!created.ok || !created.json?.id) {
          results.push({
            platform: "instagram",
            ok: false,
            status: created.status,
            error: created.json?.error?.message || "Instagram create media failed",
            details: created.json,
            userMessage: "Instagram couldn’t prepare the post. Try a different image or reconnect Instagram.",
          });
          continue;
        }

        const pub = await publishInstagramMedia({
          igUserId: acct.page_id,
          accessToken: acct.page_access_token,
          creationId: String(created.json.id),
        });

        results.push({
          platform: "instagram",
          ok: pub.ok && !!pub.json?.id,
          status: pub.status,
          postedId: pub.json?.id || null,
          mode: "image",
          details: { created: created.json, published: pub.json },
          userMessage: pub.ok ? "Posted to Instagram." : pub.json?.error?.message || "Instagram couldn’t publish this.",
        });
        continue;
      }

      // LINKEDIN
      if (p === "linkedin") {
        const liTrim = trimLinkedInText(rawMessage);
        const messageForLinkedIn = liTrim.text;

        const liImageRef = isLinkedInAssetRef(rawImageUrl) ? rawImageUrl : "";
        const liVideoRef = isLinkedInAssetRef(rawVideoUrl) ? rawVideoUrl : "";
        const droppedMediaBecauseNotUrn = (!!rawImageUrl && !liImageRef) || (!!rawVideoUrl && !liVideoRef);

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
            details: li1.json,
            userMessage: droppedMediaBecauseNotUrn
              ? "Posted to LinkedIn (text-only — LinkedIn needs uploaded media assets)."
              : "Posted to LinkedIn.",
          });
          continue;
        }

        const didTryMedia = !!liImageRef || !!liVideoRef;
        if (didTryMedia) {
          const li2 = await postToLinkedInViaInternal(req, {
            organisationId,
            message: messageForLinkedIn,
          });

          if (li2.ok) {
            results.push({
              platform: "linkedin",
              ok: true,
              postedId: li2.json?.postedId || null,
              mode: "text",
              details: li2.json,
              userMessage: "LinkedIn didn’t like the media, so we posted it as text-only instead.",
            });
            continue;
          }

          const help = friendlyLinkedInHelp({
            rawError: li2.error || li1.error || "LinkedIn post failed",
            droppedMediaBecauseNotUrn,
            wasTrimmed: liTrim.trimmed,
          });

          results.push({
            platform: "linkedin",
            ok: false,
            status: 200,
            error: `${help.headline} ${help.what}`,
            userHelp: help,
            details: { firstAttempt: li1.json, retryTextOnly: li2.json },
          });
          continue;
        }

        const help = friendlyLinkedInHelp({
          rawError: li1.error || "LinkedIn post failed",
          droppedMediaBecauseNotUrn,
          wasTrimmed: liTrim.trimmed,
        });

        results.push({
          platform: "linkedin",
          ok: false,
          status: 200,
          error: `${help.headline} ${help.what}`,
          userHelp: help,
          details: li1.json,
        });
        continue;
      }

      // TIKTOK
      if (p === "tiktok") {
        if (!videoUrl) {
          results.push({
            platform: "tiktok",
            ok: false,
            status: 200,
            error: "TikTok needs a video URL.",
            userMessage: "TikTok posts need an MP4/MOV/WEBM video. Add a video and try again.",
          });
          continue;
        }

        const tk = await postToTikTokViaInternal(req, {
          organisationId,
          message: rawMessage,
          videoUrl,
        });

        results.push({
          platform: "tiktok",
          ok: tk.ok,
          status: tk.status,
          details: tk.json,
          userMessage: tk.ok ? "Posted to TikTok." : tk.error || "TikTok couldn’t publish this.",
        });
        continue;
      }

      // Unsupported providers
      results.push({
        platform: p,
        ok: false,
        skipped: true,
        reason: "This provider isn’t enabled in publish/now yet.",
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
          warning: "Publish ran, but failed to update DB row status/error_info.",
          results,
          summary: { attempted: results.length, ok: okCount, failed: failCount, skipped: skippedCount },
        },
        { status: 200 }
      );
    }

    return NextResponse.json(
      {
        success,
        results,
        summary: { attempted: results.length, ok: okCount, failed: failCount, skipped: skippedCount },
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("[publish/now] unexpected error", err);
    return NextResponse.json({ success: false, error: err?.message || "Internal server error" }, { status: 500 });
  }
}
