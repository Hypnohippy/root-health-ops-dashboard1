// app/api/social/quick-blast/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    ok: true,
    route: "app/api/social/quick-blast/route.ts",
    version: "2026-02-04-quickblast-multipost-v2-video-types",
    note:
      "Multi-platform Quick Blast with video modes. IG: reels/feed-video. FB: page video. Threads: text+image. LinkedIn: via /api/linkedin/post. TikTok: via /api/tiktok/post.",
  });
}

type Platform = "instagram" | "facebook" | "threads" | "linkedin" | "tiktok";
type IgVideoType = "reels" | "video";
type FbVideoType = "reels" | "video";

type SocialAccountRow = {
  organisation_id: string;
  platform: Platform;
  page_id: string | null;
  page_name: string | null;
  is_active: boolean | null;
  page_access_token: string | null;
  token_expires_at: string | null;
};

type ResultRow = {
  platform: Platform;
  ok: boolean;
  status: number;
  mode: "text" | "image" | "video";
  postedId?: string | null;
  skipped?: boolean;
  error?: string | null;
  details?: any | null;
  note?: string | null;
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

function looksLikeVideoUrl(url: string) {
  const u = (url || "").trim().toLowerCase();
  if (!u) return false;
  if (!isHttps(u)) return false;
  return (
    /\.(mp4|mov|webm)(\?.*)?$/i.test(u) ||
    u.includes(".mp4") ||
    u.includes(".mov") ||
    u.includes(".webm")
  );
}

async function getSingleTenantOrganisationId(): Promise<string | null> {
  const { data, error } = await supabaseAdmin.from("organisations").select("id").limit(1);
  if (error || !data || data.length === 0) return null;
  return String((data as any)[0].id);
}

async function loadActiveAccount(
  organisationId: string,
  platform: Platform
): Promise<SocialAccountRow | null> {
  const { data, error } = await supabaseAdmin
    .from("social_accounts")
    .select("organisation_id, platform, page_id, page_name, is_active, page_access_token, token_expires_at")
    .eq("organisation_id", organisationId)
    .eq("platform", platform)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[quick-blast] load account error", platform, error);
    return null;
  }
  return (data as any) ?? null;
}

/* -----------------------------
   FACEBOOK (text / image / video)
-------------------------------- */
async function postToFacebookTextOrImage(args: {
  pageId: string;
  pageAccessToken: string;
  message: string;
  imageUrl?: string;
}): Promise<{ ok: boolean; status: number; postedId?: string | null; details?: any | null; mode: "text" | "image" }> {
  const token = (args.pageAccessToken || "").trim();
  const pageId = (args.pageId || "").trim();
  if (!token || !pageId) return { ok: false, status: 401, details: null, mode: "text" };

  const imageUrl = (args.imageUrl || "").trim();
  const hasImage = !!imageUrl;

  if (hasImage) {
    if (!isLikelyImageUrl(imageUrl)) {
      return {
        ok: false,
        status: 400,
        mode: "image",
        details: { error: { message: "Facebook imageUrl must be a direct https image link ending .jpg/.png/.webp/.gif" } },
      };
    }

    const url = `https://graph.facebook.com/v24.0/${encodeURIComponent(pageId)}/photos`;
    const body = new URLSearchParams();
    body.set("url", imageUrl);
    body.set("caption", args.message);
    body.set("published", "true");
    body.set("access_token", token);

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      cache: "no-store",
    });

    const json: any = await res.json().catch(() => null);
    if (!res.ok) return { ok: false, status: res.status, mode: "image", details: json };

    return {
      ok: true,
      status: res.status,
      mode: "image",
      postedId: json?.post_id || json?.id || null,
      details: json,
    };
  }

  const url = `https://graph.facebook.com/v24.0/${encodeURIComponent(pageId)}/feed`;
  const body = new URLSearchParams();
  body.set("message", args.message);
  body.set("access_token", token);

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });

  const json: any = await res.json().catch(() => null);
  if (!res.ok) return { ok: false, status: res.status, mode: "text", details: json };

  return { ok: true, status: res.status, mode: "text", postedId: json?.id || null, details: json };
}

async function postToFacebookVideo(args: {
  pageId: string;
  pageAccessToken: string;
  message: string;
  videoUrl: string;
  fbVideoType: FbVideoType;
}): Promise<{ ok: boolean; status: number; postedId?: string | null; details?: any | null; mode: "video"; note?: string }> {
  const token = (args.pageAccessToken || "").trim();
  const pageId = (args.pageId || "").trim();
  const videoUrl = (args.videoUrl || "").trim();

  if (!token || !pageId) return { ok: false, status: 401, details: null, mode: "video" };
  if (!videoUrl) return { ok: false, status: 400, details: { error: { message: "Facebook requires videoUrl for video posts." } }, mode: "video" };
  if (!looksLikeVideoUrl(videoUrl)) {
    return { ok: false, status: 400, details: { error: { message: "Facebook videoUrl must be a direct https MP4/MOV/WEBM link." } }, mode: "video" };
  }

  // Reliable Page video publishing:
  // POST /{page-id}/videos with file_url + description
  const url = `https://graph.facebook.com/v24.0/${encodeURIComponent(pageId)}/videos`;
  const body = new URLSearchParams();
  body.set("file_url", videoUrl);
  body.set("description", args.message || "");
  body.set("access_token", token);

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });

  const json: any = await res.json().catch(() => null);
  if (!res.ok) return { ok: false, status: res.status, mode: "video", details: json };

  const note =
    args.fbVideoType === "reels"
      ? "FB video posted. (If you need guaranteed 'Reels' placement, we may need the dedicated Reels upload flow depending on your Meta app setup.)"
      : null;

  return { ok: true, status: res.status, mode: "video", postedId: json?.id || null, details: json, ...(note ? { note } : {}) };
}

/* -----------------------------
   THREADS (direct Graph)
-------------------------------- */
async function postToThreads(args: {
  accessToken: string;
  message: string;
  imageUrl?: string;
}): Promise<{ ok: boolean; status: number; postedId?: string | null; details?: any | null; mode: "text" | "image" }> {
  const token = (args.accessToken || "").trim();
  if (!token) return { ok: false, status: 401, details: { error: "Threads missing access token" }, mode: "text" };

  const imageUrl = (args.imageUrl || "").trim();
  const hasImage = !!imageUrl;

  if (hasImage && !isLikelyImageUrl(imageUrl)) {
    return {
      ok: false,
      status: 400,
      mode: "image",
      details: { error: "Threads imageUrl must be a direct https image link ending .jpg/.png/.webp/.gif" },
    };
  }

  const createParams = new URLSearchParams();
  createParams.set("media_type", hasImage ? "IMAGE" : "TEXT");
  createParams.set("text", args.message);
  if (hasImage) createParams.set("image_url", imageUrl);
  createParams.set("access_token", token);

  const createRes = await fetch(`https://graph.threads.net/me/threads?${createParams.toString()}`, {
    method: "POST",
    cache: "no-store",
  });

  const createJson: any = await createRes.json().catch(() => null);
  if (!createRes.ok || !createJson?.id) {
    return { ok: false, status: createRes.status, mode: hasImage ? "image" : "text", details: createJson };
  }

  const creationId = String(createJson.id);

  // Tiny wait helps avoid "media not found" races
  await sleep(800);

  const publishParams = new URLSearchParams();
  publishParams.set("creation_id", creationId);
  publishParams.set("access_token", token);

  const pubRes = await fetch(`https://graph.threads.net/me/threads_publish?${publishParams.toString()}`, {
    method: "POST",
    cache: "no-store",
  });

  const pubJson: any = await pubRes.json().catch(() => null);
  if (!pubRes.ok || !pubJson?.id) {
    return { ok: false, status: pubRes.status, mode: hasImage ? "image" : "text", details: pubJson };
  }

  return {
    ok: true,
    status: pubRes.status,
    mode: hasImage ? "image" : "text",
    postedId: String(pubJson.id),
    details: { postedId: pubJson.id, containerId: creationId },
  };
}

/* -----------------------------
   INSTAGRAM (image + REELS + feed-video)
-------------------------------- */
type IgCreateOut =
  | { ok: true; status: number; creationId: string; details: any | null }
  | { ok: false; status: number; error: string; details: any | null };

async function igCreateContainer(args: {
  igUserId: string;
  accessToken: string;
  caption: string;
  imageUrl?: string | null;
  videoUrl?: string | null;
  igVideoType: IgVideoType;
}): Promise<IgCreateOut> {
  const token = (args.accessToken || "").trim();
  const igUserId = (args.igUserId || "").trim();

  if (!token || !igUserId) {
    return { ok: false, status: 401, error: "Instagram not connected (missing IG user id or access token).", details: null };
  }

  const hasVideo = !!(args.videoUrl && args.videoUrl.trim());
  const hasImage = !!(args.imageUrl && args.imageUrl.trim());

  if (!hasVideo && !hasImage) {
    return { ok: false, status: 400, error: "Instagram requires an image or a video URL for this post.", details: null };
  }

  if (hasImage && !isLikelyImageUrl(args.imageUrl!)) {
    return { ok: false, status: 400, error: "Instagram imageUrl must be a direct https image link ending .jpg/.png/.webp/.gif", details: null };
  }

  if (hasVideo && !looksLikeVideoUrl(args.videoUrl!)) {
    return { ok: false, status: 400, error: "Instagram videoUrl must be a direct https MP4/MOV/WEBM link.", details: null };
  }

  const url = new URL(`https://graph.facebook.com/v24.0/${encodeURIComponent(igUserId)}/media`);
  url.searchParams.set("access_token", token);
  url.searchParams.set("caption", args.caption);

  if (hasVideo) {
    // reels or feed-video
    url.searchParams.set("media_type", args.igVideoType === "video" ? "VIDEO" : "REELS");
    url.searchParams.set("video_url", args.videoUrl!.trim());
  } else {
    url.searchParams.set("image_url", args.imageUrl!.trim());
  }

  const res = await fetch(url.toString(), { method: "POST", cache: "no-store" });
  const json = await res.json().catch(() => null);

  if (!res.ok) {
    const friendly = json?.error?.error_user_msg || json?.error?.message || "Instagram container creation failed.";
    return { ok: false, status: res.status, error: String(friendly), details: json };
  }

  const creationId = json?.id;
  if (!creationId) return { ok: false, status: 500, error: "Instagram did not return a creation id.", details: json };

  return { ok: true, status: 200, creationId: String(creationId), details: json };
}

async function igWaitUntilReady(args: { creationId: string; accessToken: string; isVideo: boolean }) {
  const token = (args.accessToken || "").trim();
  if (!token) return { ok: false as const, status: 401, error: "Instagram missing access token.", details: null as any };

  const maxAttempts = args.isVideo ? 12 : 10;
  const delayMs = args.isVideo ? 5000 : 2500;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const url = new URL(`https://graph.facebook.com/v24.0/${encodeURIComponent(args.creationId)}`);
    url.searchParams.set("fields", "status_code");
    url.searchParams.set("access_token", token);

    const res = await fetch(url.toString(), { method: "GET", cache: "no-store" });
    const json = await res.json().catch(() => null);

    if (!res.ok) {
      const friendly = json?.error?.error_user_msg || json?.error?.message || "Instagram status check failed.";
      return { ok: false as const, status: res.status, error: String(friendly), details: json };
    }

    const statusCode = String(json?.status_code || "").toUpperCase();
    if (statusCode === "FINISHED") return { ok: true as const, status: 200, details: json };
    if (statusCode === "ERROR") return { ok: false as const, status: 400, error: "Instagram reported processing ERROR for this media.", details: json };

    await sleep(delayMs);
  }

  return { ok: false as const, status: 408, error: "Instagram is still processing the media. Wait 10–30 seconds and try again.", details: null };
}

type IgPublishOut =
  | { ok: true; status: number; postedId: string | null; details: any | null }
  | { ok: false; status: number; error: string; details: any | null };

async function igPublishOnce(args: { igUserId: string; accessToken: string; creationId: string }): Promise<IgPublishOut> {
  const token = (args.accessToken || "").trim();
  const igUserId = (args.igUserId || "").trim();
  if (!token || !igUserId) return { ok: false, status: 401, error: "Instagram not connected (missing IG user id or access token).", details: null };

  const url = new URL(`https://graph.facebook.com/v24.0/${encodeURIComponent(igUserId)}/media_publish`);
  url.searchParams.set("creation_id", args.creationId);
  url.searchParams.set("access_token", token);

  const res = await fetch(url.toString(), { method: "POST", cache: "no-store" });
  const json = await res.json().catch(() => null);

  if (!res.ok) {
    const friendly = json?.error?.error_user_msg || json?.error?.message || "Instagram publish failed.";
    return { ok: false, status: res.status, error: String(friendly), details: json };
  }

  return { ok: true, status: 200, postedId: json?.id ? String(json.id) : null, details: json };
}

async function igPublishWithRetry(args: { igUserId: string; accessToken: string; creationId: string; isVideo: boolean }): Promise<IgPublishOut> {
  const maxPublishAttempts = 6;
  const delayMs = args.isVideo ? 5000 : 2500;

  for (let i = 1; i <= maxPublishAttempts; i++) {
    const out = await igPublishOnce({ igUserId: args.igUserId, accessToken: args.accessToken, creationId: args.creationId });
    if (out.ok) return out;

    const msg = String(out?.error || "").toLowerCase();
    const detailsMsg = String(out?.details?.error?.message || "").toLowerCase();
    const userMsg = String(out?.details?.error?.error_user_msg || "").toLowerCase();

    const notReady =
      msg.includes("not ready") ||
      userMsg.includes("not ready") ||
      detailsMsg.includes("media id is not available") ||
      detailsMsg.includes("not available") ||
      out?.details?.error?.code === 9007 ||
      out?.details?.error?.error_subcode === 2207027;

    if (!notReady) return out;
    await sleep(delayMs);
  }

  return { ok: false, status: 400, error: "The media is still not ready to publish. Wait 10–30 seconds and try again.", details: null };
}

/* -----------------------------
   LINKEDIN (use your existing route)
-------------------------------- */
async function postToLinkedInViaInternal(args: { req: NextRequest; organisationId: string; message: string; imageUrl?: string }) {
  const origin = args.req.nextUrl.origin;

  const res = await fetch(`${origin}/api/linkedin/post`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      organisationId: args.organisationId,
      text: args.message,
      imageUrl: args.imageUrl || "",
    }),
    cache: "no-store",
  });

  const json: any = await res.json().catch(() => null);
  const ok = res.ok && !!json?.postedId;

  return {
    ok,
    status: res.status,
    postedId: json?.postedId || null,
    details: json,
    error: ok ? null : (json?.userMessage || json?.error || `LinkedIn failed (${res.status})`),
  };
}

/* -----------------------------
   TIKTOK (internal route)
-------------------------------- */
async function postToTikTokViaInternal(args: { req: NextRequest; organisationId: string; message: string; imageUrl?: string; videoUrl?: string }) {
  const origin = args.req.nextUrl.origin;

  const res = await fetch(`${origin}/api/tiktok/post`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      organisationId: args.organisationId,
      message: args.message,
      imageUrl: args.imageUrl || "",
      videoUrl: args.videoUrl || "",
    }),
    cache: "no-store",
  });

  if (res.status === 404 || res.status === 405) {
    return {
      ok: false,
      status: res.status,
      postedId: null,
      details: null,
      error: "TikTok post route not found at /api/tiktok/post.",
    };
  }

  const json: any = await res.json().catch(() => null);
  const ok = res.ok && (json?.ok === true || json?.success === true || !!json?.postedId);

  return {
    ok,
    status: res.status,
    postedId: json?.postedId || null,
    details: json,
    error: ok ? null : (json?.userMessage || json?.error || `TikTok failed (${res.status})`),
  };
}

/* -----------------------------
   MAIN
-------------------------------- */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({} as any));

    const message: string = String(body?.message ?? "").trim();
    const imageUrl: string = String(body?.imageUrl ?? "").trim();
    const videoUrl: string = String(body?.videoUrl ?? "").trim();

    const igVideoType: IgVideoType = (String(body?.igVideoType || "reels").toLowerCase() === "video" ? "video" : "reels");
    const fbVideoType: FbVideoType = (String(body?.fbVideoType || "video").toLowerCase() === "reels" ? "reels" : "video");

    const platformsRaw: any[] = Array.isArray(body?.platforms) ? body.platforms : [];
    const platforms = platformsRaw.map((p) => String(p || "").toLowerCase().trim()).filter(Boolean) as Platform[];

    if (!message) return NextResponse.json({ success: false, error: "Message is required." }, { status: 200 });
    if (platforms.length === 0) return NextResponse.json({ success: false, error: "No platforms selected." }, { status: 200 });

    const organisationId =
      String(body?.organisationId ?? body?.organisation_id ?? "").trim() ||
      (await getSingleTenantOrganisationId());

    if (!organisationId) {
      return NextResponse.json({ success: false, error: "No organisation found (missing organisationId)." }, { status: 200 });
    }

    const hasImage = !!imageUrl;
    const hasVideo = !!videoUrl;

    const results: ResultRow[] = [];

    for (const p of platforms) {
      /* ---- FACEBOOK ---- */
      if (p === "facebook") {
        const acct = await loadActiveAccount(organisationId, "facebook");
        if (!acct?.page_id || !acct?.page_access_token) {
          results.push({ platform: "facebook", ok: false, status: 401, mode: hasVideo ? "video" : hasImage ? "image" : "text", error: "Facebook not connected.", details: null });
          continue;
        }

        if (hasVideo) {
          const fbv = await postToFacebookVideo({
            pageId: acct.page_id,
            pageAccessToken: acct.page_access_token,
            message,
            videoUrl,
            fbVideoType,
          });

          if (!fbv.ok) {
            results.push({ platform: "facebook", ok: false, status: fbv.status, mode: "video", error: fbv.details?.error?.message || "Facebook didn’t accept this video.", details: fbv.details ?? null });
          } else {
            results.push({ platform: "facebook", ok: true, status: fbv.status, mode: "video", postedId: fbv.postedId ?? null, details: fbv.details ?? null, note: fbv.note || null });
          }
          continue;
        }

        const fb = await postToFacebookTextOrImage({
          pageId: acct.page_id,
          pageAccessToken: acct.page_access_token,
          message,
          imageUrl: hasImage ? imageUrl : undefined,
        });

        if (!fb.ok) {
          results.push({ platform: "facebook", ok: false, status: fb.status, mode: fb.mode, error: fb.details?.error?.message || "Facebook didn’t accept this post.", details: fb.details ?? null });
        } else {
          results.push({ platform: "facebook", ok: true, status: fb.status, mode: fb.mode, postedId: fb.postedId ?? null, details: fb.details ?? null });
        }
        continue;
      }

      /* ---- THREADS ---- */
      if (p === "threads") {
        const acct = await loadActiveAccount(organisationId, "threads");
        if (!acct?.page_access_token) {
          results.push({ platform: "threads", ok: false, status: 401, mode: hasImage ? "image" : "text", error: "Threads not connected (missing access token).", details: null });
          continue;
        }

        const th = await postToThreads({ accessToken: acct.page_access_token, message, imageUrl: hasImage ? imageUrl : undefined });

        if (!th.ok) {
          const err =
            th.details?.error?.error_user_msg ||
            th.details?.error?.message ||
            th.details?.error ||
            "Threads didn’t accept this post.";
          results.push({ platform: "threads", ok: false, status: th.status, mode: th.mode, error: String(err), details: th.details ?? null });
        } else {
          results.push({ platform: "threads", ok: true, status: th.status, mode: th.mode, postedId: th.postedId ?? null, details: th.details ?? null });
        }
        continue;
      }

      /* ---- LINKEDIN ---- */
      if (p === "linkedin") {
        const li = await postToLinkedInViaInternal({ req, organisationId, message, imageUrl: hasImage ? imageUrl : undefined });
        if (!li.ok) {
          results.push({ platform: "linkedin", ok: false, status: li.status, mode: hasImage ? "image" : "text", error: li.error || "LinkedIn didn’t publish this post.", details: li.details ?? null });
        } else {
          results.push({ platform: "linkedin", ok: true, status: li.status, mode: hasImage ? "image" : "text", postedId: li.postedId ?? null, details: li.details ?? null });
        }
        continue;
      }

      /* ---- INSTAGRAM ---- */
      if (p === "instagram") {
        const acct = await loadActiveAccount(organisationId, "instagram");
        if (!acct?.page_id || !acct?.page_access_token) {
          results.push({ platform: "instagram", ok: false, status: 401, mode: hasVideo ? "video" : hasImage ? "image" : "text", error: "Instagram not connected.", details: null });
          continue;
        }

        const created = await igCreateContainer({
          igUserId: acct.page_id,
          accessToken: acct.page_access_token,
          caption: message,
          imageUrl: hasImage ? imageUrl : null,
          videoUrl: hasVideo ? videoUrl : null,
          igVideoType,
        });

        if (!created.ok) {
          results.push({ platform: "instagram", ok: false, status: created.status, mode: hasVideo ? "video" : hasImage ? "image" : "text", error: created.error, details: created.details ?? null });
          continue;
        }

        const isVideo = hasVideo;

        const ready = await igWaitUntilReady({ creationId: created.creationId, accessToken: acct.page_access_token, isVideo });
        if (!ready.ok) {
          results.push({ platform: "instagram", ok: false, status: ready.status, mode: isVideo ? "video" : "image", error: ready.error, details: ready.details ?? null });
          continue;
        }

        const published = await igPublishWithRetry({ igUserId: acct.page_id, accessToken: acct.page_access_token, creationId: created.creationId, isVideo });
        if (!published.ok) {
          results.push({ platform: "instagram", ok: false, status: published.status, mode: isVideo ? "video" : "image", error: published.error, details: published.details ?? null });
          continue;
        }

        results.push({
          platform: "instagram",
          ok: true,
          status: published.status,
          mode: isVideo ? "video" : "image",
          postedId: published.postedId ?? null,
          details: published.details ?? null,
          note: isVideo ? (igVideoType === "reels" ? "Posted as Instagram Reel." : "Posted as Instagram feed video.") : null,
        });
        continue;
      }

      /* ---- TIKTOK ---- */
      if (p === "tiktok") {
        const tk = await postToTikTokViaInternal({ req, organisationId, message, imageUrl: hasImage ? imageUrl : undefined, videoUrl: hasVideo ? videoUrl : undefined });
        if (!tk.ok) {
          results.push({ platform: "tiktok", ok: false, status: tk.status, mode: hasVideo ? "video" : hasImage ? "image" : "text", error: tk.error || "TikTok didn’t publish this post.", details: tk.details ?? null });
        } else {
          results.push({ platform: "tiktok", ok: true, status: tk.status, mode: hasVideo ? "video" : hasImage ? "image" : "text", postedId: tk.postedId ?? null, details: tk.details ?? null });
        }
        continue;
      }

      results.push({ platform: p, ok: false, skipped: true, status: 200, mode: hasVideo ? "video" : hasImage ? "image" : "text", error: `Unknown platform '${p}' skipped.`, details: null });
    }

    const attempted = results.length;
    const ok = results.filter((r) => r.ok).length;
    const failed = results.filter((r) => !r.ok && !r.skipped).length;
    const skipped = results.filter((r) => r.skipped).length;

    const success = ok > 0 && failed === 0;

    return NextResponse.json(
      {
        success,
        organisationId,
        results,
        summary: { attempted, ok, failed, skipped },
        userMessage: ok > 0 ? (failed === 0 ? "Posted ✅" : "Some posts didn’t send. See details below.") : "No posts sent from this route.",
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("[quick-blast] crashed", err);
    return NextResponse.json({ success: false, error: err?.message || "Quick Blast crashed." }, { status: 200 });
  }
}
