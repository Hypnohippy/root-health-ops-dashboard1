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
  return /\.(mp4|mov|webm)(\?.*)?$/i.test(u);
}

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

/** FACEBOOK: video > image > text */
async function postToFacebook(args: {
  pageId: string;
  pageAccessToken: string;
  message: string;
  imageUrl?: string;
  videoUrl?: string;
}) {
  const videoUrl = (args.videoUrl || "").trim();
  const imageUrl = (args.imageUrl || "").trim();

  if (videoUrl) {
    if (!isLikelyVideoUrl(videoUrl)) {
      return {
        ok: false,
        status: 400,
        json: { error: { message: "Facebook videoUrl must be a direct https .mp4/.mov/.webm link." } },
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

  if (imageUrl) {
    if (!isLikelyImageUrl(imageUrl)) {
      return {
        ok: false,
        status: 400,
        json: { error: { message: "Facebook imageUrl must be a direct https image link (.jpg/.png/.webp/.gif)." } },
        mode: "photo" as const,
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
    return { ok: res.ok, status: res.status, json, mode: "photo" as const };
  }

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

/** THREADS */
async function getThreadsUserId(accessToken: string) {
  const token = (accessToken || "").trim();
  const url = `https://graph.threads.net/v1.0/me?fields=id,username&access_token=${encodeURIComponent(token)}`;

  const res = await fetch(url, { method: "GET", cache: "no-store" });
  const json: any = await res.json().catch(() => null);

  if (!res.ok || !json?.id) {
    return {
      ok: false as const,
      status: res.status,
      error: json?.error?.message || json?.message || "Could not resolve Threads user id (token invalid?)",
      details: json,
    };
  }

  return { ok: true as const, status: 200, threadsUserId: String(json.id) };
}

function truncateThreadsText(text: string) {
  const t = (text || "").trim();
  if (t.length <= 500) return t;
  return t.slice(0, 497) + "...";
}

async function postToThreads(args: { accessToken: string; message: string; imageUrl?: string }) {
  const token = (args.accessToken || "").trim();
  if (!token) {
    return { ok: false, status: 401, json: { error: "Threads is not connected (missing access token)." } };
  }

  const who = await getThreadsUserId(token);
  if (!who.ok) {
    return { ok: false, status: who.status, json: { error: who.error, details: who.details } };
  }

  const threadsUserId = who.threadsUserId;
  const msg = truncateThreadsText(args.message);

  const isImage = !!(args.imageUrl && args.imageUrl.trim());
  if (isImage && !isLikelyImageUrl(args.imageUrl!)) {
    return {
      ok: false,
      status: 400,
      json: { error: "Threads imageUrl must be a direct https image link ending .jpg/.png/.webp/.gif" },
    };
  }

  // 1) Create container
  const createParams = new URLSearchParams();
  createParams.set("media_type", isImage ? "IMAGE" : "TEXT");
  createParams.set("text", msg);
  if (isImage) createParams.set("image_url", args.imageUrl!.trim());
  createParams.set("access_token", token);

  const createRes = await fetch(
    `https://graph.threads.net/v1.0/${encodeURIComponent(threadsUserId)}/threads?${createParams.toString()}`,
    { method: "POST", cache: "no-store" }
  );

  const createJson: any = await createRes.json().catch(() => null);
  if (!createRes.ok || !createJson?.id) {
    return { ok: false, status: createRes.status, json: createJson || { error: "Threads create container failed" } };
  }

  const creationId = String(createJson.id);

  // 1.5) Delay helps prevent “Media Not Found”
  await sleep(isImage ? 1400 : 900);

  // 2) Publish with retries (handles transient timing issues)
  const publishParams = new URLSearchParams();
  publishParams.set("creation_id", creationId);
  publishParams.set("access_token", token);

  const publishUrl = `https://graph.threads.net/v1.0/${encodeURIComponent(threadsUserId)}/threads_publish?${publishParams.toString()}`;

  const retryDelays = [0, 1500, 3000]; // 3 attempts total
  let lastJson: any = null;
  let lastStatus = 500;

  for (let i = 0; i < retryDelays.length; i++) {
    if (retryDelays[i] > 0) await sleep(retryDelays[i]);

    const pubRes = await fetch(publishUrl, { method: "POST", cache: "no-store" });
    const pubJson: any = await pubRes.json().catch(() => null);

    lastJson = pubJson;
    lastStatus = pubRes.status;

    if (pubRes.ok && pubJson?.id) {
      return {
        ok: true,
        status: pubRes.status,
        json: { postedId: pubJson.id, containerId: creationId, threadsUserId, textTrimmed: msg.length !== args.message.trim().length },
      };
    }

    // If it’s “Media Not Found”, keep retrying
    const subcode = pubJson?.error?.error_subcode;
    const msgTxt = String(pubJson?.error?.message || "").toLowerCase();
    const userMsg = String(pubJson?.error?.error_user_msg || "").toLowerCase();
    const looksLikeNotFound =
      subcode === 4279009 || msgTxt.includes("does not exist") || userMsg.includes("cannot be found") || msgTxt.includes("not found");

    if (!looksLikeNotFound) break;
  }

  return {
    ok: false,
    status: lastStatus,
    json: lastJson || { error: "Threads publish failed" },
  };
}

/** INSTAGRAM: video reels > image */
async function postToInstagram(args: {
  igUserId: string;
  accessToken: string;
  caption: string;
  imageUrl?: string;
  videoUrl?: string;
}) {
  const token = (args.accessToken || "").trim();
  const igUserId = (args.igUserId || "").trim();
  const imageUrl = (args.imageUrl || "").trim();
  const videoUrl = (args.videoUrl || "").trim();

  if (!token) return { ok: false, status: 401, json: { error: "Instagram missing access token." } };
  if (!igUserId) return { ok: false, status: 400, json: { error: "Instagram missing IG User ID." } };

  // VIDEO (Reels)
  if (videoUrl) {
    if (!isLikelyVideoUrl(videoUrl)) {
      return { ok: false, status: 400, json: { error: "Instagram videoUrl must be a direct https .mp4/.mov/.webm link." } };
    }

    const createBody = new URLSearchParams();
    createBody.set("media_type", "REELS");
    createBody.set("video_url", videoUrl);
    createBody.set("caption", args.caption || "");
    createBody.set("access_token", token);

    const createRes = await fetch(
      `https://graph.facebook.com/v24.0/${encodeURIComponent(igUserId)}/media`,
      { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: createBody, cache: "no-store" }
    );

    const createJson: any = await createRes.json().catch(() => null);
    if (!createRes.ok || !createJson?.id) {
      return { ok: false, status: createRes.status, json: createJson || { error: "Instagram create (reels) failed" } };
    }

    const creationId = String(createJson.id);

    // Wait for processing
    const waitsMs = [2000, 3000, 5000, 8000, 8000, 10000];
    for (let i = 0; i < waitsMs.length; i++) {
      const statusRes = await fetch(
        `https://graph.facebook.com/v24.0/${encodeURIComponent(creationId)}?fields=status_code&access_token=${encodeURIComponent(token)}`,
        { method: "GET", cache: "no-store" }
      );
      const statusJson: any = await statusRes.json().catch(() => null);
      const code = String(statusJson?.status_code || "").toUpperCase();
      if (statusRes.ok && code === "FINISHED") break;
      await sleep(waitsMs[i]);
    }

    // Publish (retries)
    for (let attempt = 1; attempt <= 4; attempt++) {
      const publishBody = new URLSearchParams();
      publishBody.set("creation_id", creationId);
      publishBody.set("access_token", token);

      const publishRes = await fetch(
        `https://graph.facebook.com/v24.0/${encodeURIComponent(igUserId)}/media_publish`,
        { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: publishBody, cache: "no-store" }
      );

      const publishJson: any = await publishRes.json().catch(() => null);

      if (publishRes.ok && publishJson?.id) {
        return { ok: true, status: publishRes.status, json: { postedId: publishJson.id, containerId: creationId, media_type: "REELS" } };
      }

      await sleep(1500 * attempt);
    }

    return { ok: false, status: 400, json: { error: "Instagram is still processing this reel. Try again in a moment.", containerId: creationId } };
  }

  // IMAGE
  if (!imageUrl) return { ok: false, status: 400, json: { error: "Instagram requires an image URL or a video URL." } };
  if (!isLikelyImageUrl(imageUrl)) return { ok: false, status: 400, json: { error: "Instagram imageUrl must be a direct https image link ending .jpg/.png/.webp/.gif" } };

  const createBody = new URLSearchParams();
  createBody.set("image_url", imageUrl);
  createBody.set("caption", args.caption || "");
  createBody.set("access_token", token);

  const createRes = await fetch(
    `https://graph.facebook.com/v24.0/${encodeURIComponent(igUserId)}/media`,
    { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: createBody, cache: "no-store" }
  );

  const createJson: any = await createRes.json().catch(() => null);
  if (!createRes.ok || !createJson?.id) {
    return { ok: false, status: createRes.status, json: createJson || { error: "Instagram create container failed" } };
  }

  const creationId = String(createJson.id);

  const waitsMs = [2000, 2000, 3000, 5000, 8000, 8000];
  for (let i = 0; i < waitsMs.length; i++) {
    const statusRes = await fetch(
      `https://graph.facebook.com/v24.0/${encodeURIComponent(creationId)}?fields=status_code&access_token=${encodeURIComponent(token)}`,
      { method: "GET", cache: "no-store" }
    );
    const statusJson: any = await statusRes.json().catch(() => null);
    const statusCode = String(statusJson?.status_code || "").toUpperCase();
    if (statusRes.ok && statusCode === "FINISHED") break;
    await sleep(waitsMs[i]);
  }

  for (let attempt = 1; attempt <= 4; attempt++) {
    const publishBody = new URLSearchParams();
    publishBody.set("creation_id", creationId);
    publishBody.set("access_token", token);

    const publishRes = await fetch(
      `https://graph.facebook.com/v24.0/${encodeURIComponent(igUserId)}/media_publish`,
      { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: publishBody, cache: "no-store" }
    );

    const publishJson: any = await publishRes.json().catch(() => null);

    if (publishRes.ok && publishJson?.id) {
      return { ok: true, status: publishRes.status, json: { postedId: publishJson.id, containerId: creationId, media_type: "IMAGE" } };
    }

    await sleep(1500 * attempt);
  }

  return { ok: false, status: 400, json: { error: "Instagram is still processing this media. Please try again in a moment.", containerId: creationId } };
}

async function postToLinkedInViaInternal(req: NextRequest, organisationId: string, message: string, imageUrl?: string, videoUrl?: string) {
  const origin = req.nextUrl.origin;
  const res = await fetch(`${origin}/api/linkedin/post`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({ text: message, organisationId, imageUrl: imageUrl || "", videoUrl: videoUrl || "" }),
  });

  const json: any = await res.json().catch(() => null);

  const ok = !!json?.ok;
  const postedId = json?.postedId || null;
  const mode = json?.mode || "text";

  const error =
    json?.userMessage ||
    json?.error ||
    json?.message ||
    (!res.ok ? `LinkedIn request failed (${res.status})` : null);

  return { ok, status: res.status, json, error, postedId, mode };
}

async function postToTikTokViaInternal(req: NextRequest, organisationId: string, message: string, videoUrl?: string) {
  const origin = req.nextUrl.origin;

  // IMPORTANT: this assumes you have (or will paste) a TikTok publish route here:
  // app/api/tiktok/publish/route.ts
  const res = await fetch(`${origin}/api/tiktok/publish`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({ organisationId, text: message, videoUrl: videoUrl || "" }),
  });

  const json: any = await res.json().catch(() => null);

  // If the route doesn’t exist, Vercel will typically return 404 HTML
  if (!res.ok) {
    return { ok: false, status: res.status, json: json || { error: "TikTok publish route failed or missing." } };
  }

  const ok = !!(json?.ok || json?.success);
  return { ok, status: res.status, json };
}

export async function POST(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const organisationId = (url.searchParams.get("organisationId") || "").trim();
    if (!organisationId) return NextResponse.json({ success: false, error: "Missing organisationId" }, { status: 400 });

    const body = await req.json().catch(() => ({}));
    const id = String(body?.id || "").trim();
    const platformsRaw = Array.isArray(body?.platforms) ? body.platforms : [];
    const platforms: ProviderId[] = platformsRaw
      .map((p: any) => String(p || "").toLowerCase().trim())
      .filter(Boolean) as ProviderId[];

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

    const message = String((row as any).message || "").trim();
    const imageUrl = String((row as any).image_url || "").trim();

    // ✅ Restore videoUrl support: Quick Blast stores it in meta.video_url
    const meta = (row as any).meta || {};
    const videoUrl = String(meta?.video_url || "").trim();

    const results: any[] = [];

    for (const p of platforms) {
      if (p === "facebook") {
        const acct = await loadSocialAccount(organisationId, "facebook");
        if (!acct?.page_id || !acct?.page_access_token) {
          results.push({ platform: "facebook", ok: false, status: 401, error: "Facebook not connected (missing page_id or access token)." });
          continue;
        }

        const fb = await postToFacebook({
          pageId: acct.page_id,
          pageAccessToken: acct.page_access_token,
          message,
          imageUrl: imageUrl || undefined,
          videoUrl: videoUrl || undefined,
        });

        if (!fb.ok) results.push({ platform: "facebook", ok: false, status: fb.status, error: fb.json?.error?.message || "Facebook post failed", details: fb.json, mode: fb.mode });
        else results.push({ platform: "facebook", ok: true, postedId: fb.json?.post_id || fb.json?.id || null, mode: fb.mode });
        continue;
      }

      if (p === "instagram") {
        const acct = await loadSocialAccount(organisationId, "instagram");
        if (!acct?.page_id || !acct?.page_access_token) {
          results.push({ platform: "instagram", ok: false, status: 401, error: "Instagram not connected (missing IG user id or token)." });
          continue;
        }

        const ig = await postToInstagram({
          igUserId: acct.page_id,
          accessToken: acct.page_access_token,
          caption: message,
          imageUrl: imageUrl || undefined,
          videoUrl: videoUrl || undefined,
        });

        if (!ig.ok) results.push({ platform: "instagram", ok: false, status: ig.status, error: ig.json?.error || ig.json?.error?.message || "Instagram post failed", details: ig.json });
        else results.push({ platform: "instagram", ok: true, postedId: ig.json?.postedId || null, mode: videoUrl ? "video" : "image", details: ig.json });
        continue;
      }

      if (p === "threads") {
        const acct = await loadSocialAccount(organisationId, "threads");
        if (!acct?.page_access_token) {
          results.push({ platform: "threads", ok: false, status: 401, error: "Threads not connected (missing token)." });
          continue;
        }

        // Threads: safest path = text + optional image (video not wired here)
        const th = await postToThreads({
          accessToken: acct.page_access_token,
          message,
          imageUrl: imageUrl && isLikelyImageUrl(imageUrl) ? imageUrl : undefined,
        });

        if (!th.ok) results.push({ platform: "threads", ok: false, status: th.status, error: th.json?.error || th.json?.error?.message || "Threads post failed", details: th.json });
        else results.push({ platform: "threads", ok: true, postedId: th.json?.postedId || null, mode: imageUrl ? "image" : "text", details: th.json });
        continue;
      }

      if (p === "linkedin") {
        const li = await postToLinkedInViaInternal(req, organisationId, message, imageUrl || undefined, videoUrl || undefined);
        if (!li.ok) results.push({ platform: "linkedin", ok: false, status: 200, error: li.error || "LinkedIn post failed", details: li.json });
        else results.push({ platform: "linkedin", ok: true, postedId: li.postedId, mode: li.mode, details: li.json });
        continue;
      }

      if (p === "tiktok") {
        // Calls internal TikTok route. If you already have a different route name/path,
        // paste it and I’ll align this to your exact existing implementation.
        const tk = await postToTikTokViaInternal(req, organisationId, message, videoUrl || undefined);
        if (!tk.ok) results.push({ platform: "tiktok", ok: false, status: tk.status, error: tk.json?.error || "TikTok post failed (or route missing).", details: tk.json });
        else results.push({ platform: "tiktok", ok: true, postedId: tk.json?.postedId || tk.json?.id || null, mode: "video", details: tk.json });
        continue;
      }

      results.push({ platform: p, ok: false, skipped: true, reason: "Not implemented in Post Now yet." });
    }

    const okCount = results.filter((r) => r.ok).length;
    const failCount = results.filter((r) => !r.ok && !r.skipped).length;
    const skippedCount = results.filter((r) => r.skipped).length;

    const success = okCount > 0 && failCount === 0;

    const nowIso = new Date().toISOString();
    const nextMeta = {
      ...(meta || {}),
      last_publish_attempt_at: nowIso,
      last_publish_summary: { ok: okCount, failed: failCount, skipped: skippedCount, attempted: results.length },
    };

    const updatePayload: any = {
      error_info: {
        results,
        success,
        summary: { ok: okCount, failed: failCount, skipped: skippedCount, attempted: results.length },
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
          warning: "Published attempt ran, but failed to update DB row status/error_info.",
          results,
          summary: { attempted: results.length, ok: okCount, failed: failCount, skipped: skippedCount },
        },
        { status: 200 }
      );
    }

    return NextResponse.json(
      { success, results, summary: { attempted: results.length, ok: okCount, failed: failCount, skipped: skippedCount } },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("[publish/now] unexpected error", err);
    return NextResponse.json({ success: false, error: err?.message || "Internal server error" }, { status: 500 });
  }
}
