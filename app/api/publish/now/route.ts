import { requirePublishingOrganisation, accessErrorResponse, publishingHeaders } from "@/lib/tenantAuth";
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
  return process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || req.nextUrl.origin;
}

function norm(v: any) {
  return String(v ?? "").trim();
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

function safeErrMsg(j: any) {
  return (
    j?.error?.message ||
    j?.message ||
    j?.error?.error_user_msg ||
    j?.error?.error_user_title ||
    j?.error ||
    null
  );
}

/** ---------------- SOCIAL ACCOUNT LOAD ---------------- */

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
            "Facebook needs a direct HTTPS image link ending in .jpg/.png/.webp/.gif (not a webpage).",
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
            "Facebook needs a direct HTTPS video file link ending .mp4/.mov/.webm (not a webpage).",
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

/** ---------------- INSTAGRAM (image + video/reels with container wait) ---------------- */

async function createInstagramImageContainer(args: {
  igUserId: string;
  accessToken: string;
  caption: string;
  imageUrl: string;
}) {
  const url =
    `https://graph.facebook.com/v24.0/${encodeURIComponent(
      args.igUserId
    )}/media?` +
    new URLSearchParams({
      image_url: args.imageUrl,
      caption: args.caption,
      access_token: args.accessToken,
    }).toString();

  const res = await fetch(url, { method: "POST", cache: "no-store" });
  const json: any = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, json, mode: "image" as const };
}

async function createInstagramVideoContainer(args: {
  igUserId: string;
  accessToken: string;
  caption: string;
  videoUrl: string;
}) {
  const url =
    `https://graph.facebook.com/v24.0/${encodeURIComponent(
      args.igUserId
    )}/media?` +
    new URLSearchParams({
      media_type: "REELS",
      video_url: args.videoUrl,
      caption: args.caption,
      access_token: args.accessToken,
    }).toString();

  const res = await fetch(url, { method: "POST", cache: "no-store" });
  const json: any = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, json, mode: "video" as const };
}

async function getInstagramContainerStatus(args: {
  creationId: string;
  accessToken: string;
}) {
  const url =
    `https://graph.facebook.com/v24.0/${encodeURIComponent(
      args.creationId
    )}?` +
    new URLSearchParams({
      fields: "status_code,status",
      access_token: args.accessToken,
    }).toString();

  const res = await fetch(url, { method: "GET", cache: "no-store" });
  const json: any = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, json };
}

async function publishInstagramMedia(args: {
  igUserId: string;
  accessToken: string;
  creationId: string;
}) {
  const url =
    `https://graph.facebook.com/v24.0/${encodeURIComponent(
      args.igUserId
    )}/media_publish?` +
    new URLSearchParams({
      creation_id: args.creationId,
      access_token: args.accessToken,
    }).toString();

  const res = await fetch(url, { method: "POST", cache: "no-store" });
  const json: any = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, json };
}

function isIgNotReady(errJson: any) {
  const msg = String(safeErrMsg(errJson) || "").toLowerCase();
  return (
    msg.includes("not ready") ||
    msg.includes("processing") ||
    msg.includes("please wait") ||
    msg.includes("temporarily unavailable") ||
    msg.includes("container is not ready")
  );
}

function isIgContainerFinished(statusJson: any) {
  const statusCode = String(
    statusJson?.status_code || statusJson?.status || ""
  ).toUpperCase();

  return statusCode === "FINISHED" || statusCode === "PUBLISHED";
}

function isIgContainerHardFailed(statusJson: any) {
  const statusCode = String(
    statusJson?.status_code || statusJson?.status || ""
  ).toUpperCase();

  return statusCode === "ERROR" || statusCode === "EXPIRED";
}

async function postToInstagram(args: {
  igUserId: string;
  accessToken: string;
  message: string;
  imageUrl?: string;
  videoUrl?: string;
}) {
  const hasVideo = !!args.videoUrl;
  const hasImage = !!args.imageUrl && !hasVideo;

  if (hasVideo && !isLikelyVideoUrl(args.videoUrl!)) {
    return {
      ok: false,
      status: 400,
      json: {
        error: {
          message:
            "Instagram video/reels needs a direct HTTPS .mp4/.mov/.webm file URL.",
        },
      },
      mode: "video" as const,
    };
  }

  if (hasImage && !isLikelyImageUrl(args.imageUrl!)) {
    return {
      ok: false,
      status: 400,
      json: {
        error: {
          message:
            "Instagram image posting needs a direct HTTPS image URL ending .jpg/.png/.webp/.gif.",
        },
      },
      mode: "image" as const,
    };
  }

  if (!hasImage && !hasVideo) {
    return {
      ok: false,
      status: 400,
      json: {
        error: {
          message: "Instagram needs either an image URL or a video URL.",
        },
      },
      mode: "text" as const,
    };
  }

  const created = hasVideo
    ? await createInstagramVideoContainer({
        igUserId: args.igUserId,
        accessToken: args.accessToken,
        caption: args.message,
        videoUrl: args.videoUrl!,
      })
    : await createInstagramImageContainer({
        igUserId: args.igUserId,
        accessToken: args.accessToken,
        caption: args.message,
        imageUrl: args.imageUrl!,
      });

  const creationId = String(created.json?.id || "").trim();

  if (!created.ok || !creationId) {
    return {
      ok: false,
      status: created.status,
      json: {
        error:
          safeErrMsg(created.json) ||
          "Instagram couldn’t create the media container.",
        created: created.json || null,
      },
      mode: created.mode,
    };
  }

  let lastStatus: any = null;

  const pollDelays = hasVideo
    ? [2000, 3000, 4000, 5000, 7000, 9000, 12000, 15000]
    : [800, 1200, 1500, 2000, 2500, 3000];

  for (let i = 0; i < pollDelays.length; i++) {
    await sleep(pollDelays[i]);

    const st = await getInstagramContainerStatus({
      creationId,
      accessToken: args.accessToken,
    });

    lastStatus = st;

    if (st.ok && isIgContainerFinished(st.json)) break;
    if (st.ok && isIgContainerHardFailed(st.json)) break;
  }

  if (isIgContainerHardFailed(lastStatus?.json)) {
    return {
      ok: false,
      status: 200,
      json: {
        error:
          safeErrMsg(lastStatus?.json) ||
          "Instagram container failed processing.",
        created: created.json,
        status: lastStatus?.json || null,
      },
      mode: created.mode,
    };
  }

  const publishDelays = hasVideo
    ? [0, 2000, 3500, 5000, 7000]
    : [0, 1200, 2000, 3500];

  let pub: { ok: boolean; status: number; json: any } | null = null;

  for (let attempt = 0; attempt < publishDelays.length; attempt++) {
    if (publishDelays[attempt]) await sleep(publishDelays[attempt]);

    const pRes = await publishInstagramMedia({
      igUserId: args.igUserId,
      accessToken: args.accessToken,
      creationId,
    });

    pub = pRes;

    if (pRes.ok && pRes.json?.id) break;
    if (!isIgNotReady(pRes.json)) break;
  }

  return {
    ok: !!(pub?.ok && pub?.json?.id),
    status: pub?.status ?? 200,
    json: {
      postedId: pub?.json?.id || null,
      created: created.json,
      container_status: lastStatus?.json || null,
      published: pub?.json || null,
    },
    mode: created.mode,
  };
}

/** ---------------- THREADS (unchanged) ---------------- */

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
      json: createJson || { error: "Threads create failed" },
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
      json: {
        error:
          "Threads is connected but missing its access token (NO_TOKEN). Reconnect Threads or restore token.",
      },
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
        error: "Threads video needs a direct HTTPS .mp4/.mov/.webm link.",
      },
    };
  }

  if (hasImage && !isLikelyImageUrl(args.imageUrl!)) {
    return {
      ok: false,
      status: 400,
      json: {
        error:
          "Threads image needs a direct HTTPS image link ending .jpg/.png/.webp/.gif.",
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

    if (
      !isThreadsMediaNotFound(pub.json) ||
      attempt === retryDelaysMs.length - 1
    ) {
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

/** ---------------- LINKEDIN (uses internal route) ---------------- */

const LINKEDIN_TEXT_LIMIT = 3000;

function trimLinkedInText(text: string) {
  const t = String(text || "").trim();
  if (t.length <= LINKEDIN_TEXT_LIMIT) return { text: t, trimmed: false };
  return {
    text: t.slice(0, LINKEDIN_TEXT_LIMIT - 1).trimEnd() + "…",
    trimmed: true,
  };
}

function friendlyLinkedInHelp(args: {
  rawError: string;
  hadMediaUrl: boolean;
  wasTrimmed: boolean;
}) {
  const raw = String(args.rawError || "").trim();
  const msg = raw.toLowerCase();

  let headline = "LinkedIn couldn’t publish this post.";
  let what = raw || "LinkedIn returned an error we couldn’t fully interpret.";
  let doThis: string[] = ["Try again in a minute.", "Try again as text-only."];

  if (
    msg.includes("unauthorized") ||
    msg.includes("permission") ||
    msg.includes("access token") ||
    msg.includes("expired") ||
    msg.includes("not connected")
  ) {
    headline = "LinkedIn connection issue.";
    what =
      "LinkedIn rejected the request because the connection may be missing a valid access token or permissions.";
    doThis = [
      "Reconnect LinkedIn on the Connect page, then retry this post.",
    ];
  }

  if (
    msg.includes("too long") ||
    msg.includes("length") ||
    msg.includes("characters")
  ) {
    headline = "LinkedIn said the post text is too long.";
    what = "LinkedIn has stricter text limits than other platforms.";
    doThis = [
      "Shorten the post (cut down the middle first).",
      `Keep it under about ${LINKEDIN_TEXT_LIMIT} characters to be safe.`,
    ];
  }

  if (
    msg.includes("image") ||
    msg.includes("media") ||
    msg.includes("asset") ||
    msg.includes("video")
  ) {
    headline = "LinkedIn didn’t accept the media (image/video).";
    what =
      "LinkedIn can be picky about media uploads. We’ll retry as text-only if needed.";
    doThis = [
      "Try again with a different image (simple JPG/PNG).",
      "If it still fails, post as text-only for LinkedIn.",
    ];
  }

  const notes: string[] = [];
  if (args.hadMediaUrl)
    notes.push(
      "Note: This post included media. If LinkedIn rejects it, we can fall back to text-only."
    );
  if (args.wasTrimmed)
    notes.push(
      "Note: We shortened the text slightly to fit LinkedIn’s safe limit."
    );

  return { headline, what, doThis, notes };
}

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
    headers: publishingHeaders(req),
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

/** ---------------- TIKTOK (uses internal route) ---------------- */

async function postToTikTokViaInternal(
  req: NextRequest,
  args: { organisationId: string; message: string; videoUrl: string }
) {
  const origin = originFromReq(req);

  const res = await fetch(`${origin}/api/tiktok/post`, {
    method: "POST",
    headers: publishingHeaders(req),
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
    const { organisationId } = await requirePublishingOrganisation(req, (url.searchParams.get("organisationId") || "").trim());

    if (!organisationId) {
      return NextResponse.json(
        { success: false, error: "Missing organisationId" },
        { status: 400 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const id = norm(body?.id);
    const platforms = toPlatformList(body?.platforms);

    if (!id) {
      return NextResponse.json(
        { success: false, error: "Missing id" },
        { status: 400 }
      );
    }

    if (platforms.length === 0) {
      return NextResponse.json(
        { success: false, error: "Pick at least one platform" },
        { status: 400 }
      );
    }

    const { data: row, error: readErr } = await supabaseAdmin
      .from("scheduled_posts")
      .select("id, organisation_id, message, platforms, image_url, scheduled_for, status, meta")
      .eq("id", id)
      .eq("organisation_id", organisationId)
      .maybeSingle();

    if (readErr || !row) {
      return NextResponse.json(
        {
          success: false,
          error: "Scheduled post not found for this organisation.",
        },
        { status: 404 }
      );
    }

    const rawMessage = String((row as any).message || "").trim();
    const rawImageUrl = String((row as any).image_url || "").trim();
    const meta = (row as any).meta || {};
    const rawVideoUrl = String(meta?.video_url || "").trim();

    const imageUrl = rawImageUrl && isLikelyImageUrl(rawImageUrl) ? rawImageUrl : "";
    const videoUrl = rawVideoUrl && isLikelyVideoUrl(rawVideoUrl) ? rawVideoUrl : "";

    const results: any[] = [];

    for (const p of platforms) {
      // A TikTok handoff may share a batch with already completed channels.
      if (meta.tiktok_inbox_upload?.completedPlatforms?.includes(p)) {
        results.push({ platform: p, ok: true, reused: true, userMessage: "Previously completed in this batch; not sent again." });
        continue;
      }
      // THREADS
      if (p === "threads") {
        const acct = await loadSocialAccount(organisationId, "threads");
        const token = acct?.page_access_token || "";
        const r = await postToThreads({
          accessToken: token,
          message: rawMessage,
          imageUrl,
          videoUrl,
        });

        results.push({
          platform: "threads",
          ok: !!r.ok,
          status: r.status,
          postedId: r.json?.postedId || null,
          mode:
            r.json?.media || (videoUrl ? "video" : imageUrl ? "image" : "text"),
          details: r.json,
          error: r.ok
            ? null
            : safeErrMsg(r.json) || r.json?.error || "Threads publish failed",
          userMessage: r.ok
            ? "Posted to Threads."
            : r.json?.error ||
              "Threads couldn’t publish this. Reconnect Threads and try again.",
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
            userMessage:
              "Facebook isn’t connected yet. Go to Connect → Facebook → Connect.",
          });
          continue;
        }

        const fb = videoUrl
          ? await postToFacebookVideo({
              pageId: acct.page_id,
              pageAccessToken: acct.page_access_token,
              message: rawMessage,
              videoUrl,
            })
          : imageUrl
          ? await postToFacebookPhoto({
              pageId: acct.page_id,
              pageAccessToken: acct.page_access_token,
              message: rawMessage,
              imageUrl,
            })
          : await postToFacebookText({
              pageId: acct.page_id,
              pageAccessToken: acct.page_access_token,
              message: rawMessage,
            });

        results.push({
          platform: "facebook",
          ok: fb.ok,
          status: fb.status,
          postedId: fb.json?.id || null,
          mode: fb.mode,
          details: fb.json,
          error: fb.ok ? null : safeErrMsg(fb.json) || "Facebook publish failed",
          userMessage: fb.ok
            ? "Posted to Facebook."
            : fb.json?.error?.message || "Facebook couldn’t publish this.",
        });
        continue;
      }

      // INSTAGRAM (image + video/reels)
      if (p === "instagram") {
        const acct = await loadSocialAccount(organisationId, "instagram");
        if (!acct?.page_id || !acct?.page_access_token) {
          results.push({
            platform: "instagram",
            ok: false,
            status: 401,
            error: "Instagram not connected (missing id or token).",
            userMessage:
              "Instagram isn’t connected yet. Go to Connect → Instagram → Connect.",
          });
          continue;
        }

        const ig = await postToInstagram({
          igUserId: acct.page_id,
          accessToken: acct.page_access_token,
          message: rawMessage,
          imageUrl: imageUrl || undefined,
          videoUrl: videoUrl || undefined,
        });

        results.push({
          platform: "instagram",
          ok: ig.ok,
          status: ig.status,
          postedId: ig.json?.postedId || ig.json?.published?.id || null,
          mode: ig.mode,
          details: ig.json,
          error: ig.ok
            ? null
            : safeErrMsg(ig.json) ||
              ig.json?.error ||
              "Instagram couldn’t publish this.",
          userMessage: ig.ok
            ? ig.mode === "video"
              ? "Posted to Instagram Reel."
              : "Posted to Instagram."
            : safeErrMsg(ig.json) ||
              ig.json?.error ||
              "Instagram couldn’t publish this.",
        });
        continue;
      }

      // LINKEDIN
      if (p === "linkedin") {
        const liTrim = trimLinkedInText(rawMessage);
        const messageForLinkedIn = liTrim.text;

        const li1 = await postToLinkedInViaInternal(req, {
          organisationId,
          message: messageForLinkedIn,
          imageUrl: imageUrl || undefined,
          videoUrl: videoUrl || undefined,
        });

        if (li1.ok) {
          results.push({
            platform: "linkedin",
            ok: true,
            postedId: li1.json?.postedId || null,
            mode: li1.json?.mode || (videoUrl ? "video" : imageUrl ? "image" : "text"),
            details: li1.json,
            error: null,
            userMessage: li1.json?.note
              ? `Posted to LinkedIn. ${String(li1.json.note)}`
              : "Posted to LinkedIn.",
          });
          continue;
        }

        const hadMediaUrl = !!imageUrl || !!videoUrl;

        if (hadMediaUrl) {
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
              error: null,
              userMessage:
                "LinkedIn didn’t accept the media, so we posted it as text-only instead.",
            });
            continue;
          }

          const help = friendlyLinkedInHelp({
            rawError: li2.error || li1.error || "LinkedIn post failed",
            hadMediaUrl,
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
          hadMediaUrl,
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
        if (meta.tiktok_inbox_upload?.publishId) {
          results.push({ platform: "tiktok", ok: meta.tiktok_inbox_upload.published === true, manualCompletionRequired: meta.tiktok_inbox_upload.published !== true, details: meta.tiktok_inbox_upload, error: meta.tiktok_inbox_upload.published === true ? null : "TikTok upload already accepted. Check the TikTok inbox and complete publication manually; no duplicate upload was made." });
          continue;
        }
        if (!videoUrl) {
          results.push({
            platform: "tiktok",
            ok: false,
            status: 200,
            error: "TikTok needs a video URL.",
            userMessage:
              "TikTok posts need an MP4/MOV/WEBM video. Add a video and try again.",
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
          ok: tk.ok && tk.json?.published === true,
          manualCompletionRequired: tk.ok && tk.json?.published !== true,
          status: tk.status,
          details: tk.json,
          error: tk.ok && tk.json?.published === true ? null : tk.ok ? "TikTok upload accepted; finish publication in the TikTok inbox. No publication is confirmed." : tk.error || "TikTok couldn’t upload this.",
          userMessage: tk.ok && tk.json?.published === true
            ? "Posted to TikTok."
            : tk.ok ? "Upload accepted — manual completion required in TikTok." : tk.error || "TikTok couldn’t upload this.",
        });
        if (tk.ok && tk.json?.publishId) meta.tiktok_inbox_upload = { publishId: tk.json.publishId, published: tk.json.published === true, acceptedAt: new Date().toISOString() };
        continue;
      }

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

    const firstFailure =
      results.find((r) => r && r.ok === false && !r.skipped) || null;

    const topError = success
      ? null
      : String(
          firstFailure?.error ||
            firstFailure?.userMessage ||
            "One or more platforms failed."
        ).trim();

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
    if (meta.tiktok_inbox_upload?.publishId) nextMeta.tiktok_inbox_upload = {
      ...meta.tiktok_inbox_upload,
      completedPlatforms: [...new Set([...(meta.tiktok_inbox_upload.completedPlatforms || []), ...results.filter(r => r.ok).map(r => r.platform)])],
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
        error: topError,
      },
      meta: nextMeta,
    };

    if (success) {
      updatePayload.status = "posted";
      updatePayload.posted_at = nowIso;
    } else {
      updatePayload.status = "failed";
      if (results.some(r => r.manualCompletionRequired)) updatePayload.posted_at = null;
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
          error: topError,
          warning: "Publish ran, but failed to update DB row status/error_info.",
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
        error: topError,
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
    const denied = accessErrorResponse(err);
    if (denied) return denied;
    console.error("[publish/now] unexpected error", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Internal server error" },
      { status: 500 }
    );
  }
}
