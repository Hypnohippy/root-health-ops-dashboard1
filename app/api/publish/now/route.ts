// app/api/publish/now/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";

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

async function postToThreads(args: {
  accessToken: string;
  message: string;
  imageUrl?: string;
}) {
  const token = (args.accessToken || "").trim();
  if (!token) {
    return {
      ok: false,
      status: 401,
      json: { error: "Threads is not connected (missing access token)." },
    };
  }

  const isImage = !!(args.imageUrl && args.imageUrl.trim());
  if (isImage && !isLikelyImageUrl(args.imageUrl!)) {
    return {
      ok: false,
      status: 400,
      json: {
        error:
          "Threads imageUrl must be a direct https image link (ending .jpg/.png etc).",
      },
    };
  }

  const createParams = new URLSearchParams();
  createParams.set("media_type", isImage ? "IMAGE" : "TEXT");
  createParams.set("text", args.message);
  if (isImage) createParams.set("image_url", args.imageUrl!.trim());
  createParams.set("access_token", token);

  const createRes = await fetch(
    `https://graph.threads.net/me/threads?${createParams.toString()}`,
    { method: "POST", cache: "no-store" }
  );
  const createJson: any = await createRes.json().catch(() => null);

  if (!createRes.ok || !createJson?.id) {
    return {
      ok: false,
      status: createRes.status,
      json: createJson || { error: "Threads create container failed" },
    };
  }

  const creationId = String(createJson.id);

  const publishParams = new URLSearchParams();
  publishParams.set("creation_id", creationId);
  publishParams.set("access_token", token);

  const pubRes = await fetch(
    `https://graph.threads.net/me/threads_publish?${publishParams.toString()}`,
    { method: "POST", cache: "no-store" }
  );
  const pubJson: any = await pubRes.json().catch(() => null);

  if (!pubRes.ok || !pubJson?.id) {
    return {
      ok: false,
      status: pubRes.status,
      json: pubJson || { error: "Threads publish failed" },
    };
  }

  return {
    ok: true,
    status: pubRes.status,
    json: { postedId: pubJson.id, containerId: creationId },
  };
}

async function postToInstagram(args: {
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
      json: { error: "Instagram imageUrl must be a direct https image link ending .jpg/.png/.webp/.gif" },
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
        json: { postedId: publishJson.id, containerId: creationId },
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
      error: "Instagram is still processing this media. Please try again in a moment.",
      containerId: creationId,
    },
  };
}

async function postToLinkedInViaInternal(
  req: NextRequest,
  organisationId: string,
  message: string
) {
  const origin = req.nextUrl.origin;
  const res = await fetch(`${origin}/api/linkedin/post`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: message, organisationId }),
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
    const id = String(body?.id || "").trim();
    const platformsRaw = Array.isArray(body?.platforms) ? body.platforms : [];
    const platforms: ProviderId[] = platformsRaw
      .map((p: any) => String(p || "").toLowerCase().trim())
      .filter(Boolean) as ProviderId[];

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

    const message = String((row as any).message || "").trim();
    const imageUrl = String((row as any).image_url || "").trim();

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

        const fb = await postToFacebook({
          pageId: acct.page_id,
          pageAccessToken: acct.page_access_token,
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
        } else {
          results.push({
            platform: "facebook",
            ok: true,
            postedId: fb.json?.post_id || fb.json?.id || null,
            mode: fb.mode,
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

        const ig = await postToInstagram({
          igUserId: acct.page_id,
          accessToken: acct.page_access_token,
          caption: message,
          imageUrl: imageUrl,
        });

        if (!ig.ok) {
          results.push({
            platform: "instagram",
            ok: false,
            status: ig.status,
            error: ig.json?.error || ig.json?.error?.message || "Instagram post failed",
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
          message,
          imageUrl: imageUrl || undefined,
        });

        if (!th.ok) {
          results.push({
            platform: "threads",
            ok: false,
            status: th.status,
            error: th.json?.error || "Threads post failed",
            details: th.json,
          });
        } else {
          results.push({
            platform: "threads",
            ok: true,
            postedId: th.json?.postedId || null,
            mode: imageUrl ? "image" : "text",
            details: th.json,
          });
        }
        continue;
      }

      if (p === "linkedin") {
        const li = await postToLinkedInViaInternal(req, organisationId, message);
        if (!li.ok) {
          results.push({
            platform: "linkedin",
            ok: false,
            status: 200,
            error: li.error || "LinkedIn post failed",
            details: li.json,
          });
        } else {
          results.push({
            platform: "linkedin",
            ok: true,
            postedId: li.json?.postedId || null,
            mode: "text",
            details: li.json,
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
