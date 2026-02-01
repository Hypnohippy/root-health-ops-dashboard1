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

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function getSingleTenantOrganisationId() {
  const { data, error } = await supabaseAdmin.from("organisations").select("id").limit(1);
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

async function loadSocialAccount(organisationId: string, platform: ProviderId): Promise<SocialAccountRow | null> {
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
        json: { error: { message: "Facebook imageUrl must be a direct https image link (ending .jpg/.png etc)." } },
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

  // Text post
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

async function postToLinkedIn(args: { req: NextRequest; message: string; organisationId: string; imageUrl?: string }) {
  const url = `${baseUrl(args.req)}/api/linkedin/post`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: args.message,
      organisationId: args.organisationId,
      imageUrl: args.imageUrl || undefined,
    }),
    cache: "no-store",
  });

  const json: any = await res.json().catch(() => null);

  return {
    ok: res.ok && !!json?.postedId,
    status: res.status,
    json,
    error: json?.error || json?.message || (!res.ok ? `LinkedIn request failed (${res.status})` : null),
  };
}

/**
 * Threads direct posting (TEXT + IMAGE) via threads.net
 */
async function postToThreads(args: { accessToken: string; message: string; imageUrl?: string }) {
  const token = (args.accessToken || "").trim();
  if (!token) {
    return { ok: false, status: 401, json: { error: "Threads is not connected (missing access token). Reconnect Threads." } };
  }

  const isImage = !!(args.imageUrl && args.imageUrl.trim());

  if (isImage && !isLikelyImageUrl(args.imageUrl!)) {
    return { ok: false, status: 400, json: { error: "Threads imageUrl must be a direct https image link (ending .jpg/.png etc)." } };
  }

  // 1) Create container
  const createParams = new URLSearchParams();
  createParams.set("media_type", isImage ? "IMAGE" : "TEXT");
  createParams.set("text", args.message);
  if (isImage) createParams.set("image_url", args.imageUrl!.trim());
  createParams.set("access_token", token);

  const createRes = await fetch(`https://graph.threads.net/me/threads?${createParams.toString()}`, {
    method: "POST",
    cache: "no-store",
  });

  const createJson: any = await createRes.json().catch(() => null);

  if (!createRes.ok || !createJson?.id) {
    return { ok: false, status: createRes.status, json: createJson || { error: "Threads create container failed" } };
  }

  const creationId = String(createJson.id);

  // 2) Publish
  const publishParams = new URLSearchParams();
  publishParams.set("creation_id", creationId);
  publishParams.set("access_token", token);

  const pubRes = await fetch(`https://graph.threads.net/me/threads_publish?${publishParams.toString()}`, {
    method: "POST",
    cache: "no-store",
  });

  const pubJson: any = await pubRes.json().catch(() => null);

  if (!pubRes.ok || !pubJson?.id) {
    return { ok: false, status: pubRes.status, json: pubJson || { error: "Threads publish failed" } };
  }

  return { ok: true, status: pubRes.status, json: { postedId: pubJson.id, containerId: creationId } };
}

/**
 * Instagram direct posting (IMAGE) with wait + retries.
 * If still processing, we return pending=true so UI can show "Processing" instead of "Failed".
 */
async function postToInstagram(args: { igUserId: string; accessToken: string; caption: string; imageUrl: string }) {
  const token = (args.accessToken || "").trim();
  const igUserId = (args.igUserId || "").trim();
  const imageUrl = (args.imageUrl || "").trim();

  if (!token) {
    return { ok: false, status: 401, json: { error: "Instagram missing access token. Reconnect Instagram." } };
  }

  if (!igUserId) {
    return {
      ok: false,
      status: 400,
      json: { error: "Instagram missing IG User ID. Reconnect and ensure it’s a Business account linked to a Facebook Page." },
    };
  }

  if (!imageUrl) {
    return { ok: false, status: 400, json: { error: "Instagram requires an image for this post. Paste a direct image URL." } };
  }

  if (!isLikelyImageUrl(imageUrl)) {
    return { ok: false, status: 400, json: { error: "Instagram imageUrl must be a direct https image link ending .jpg/.png/.webp/.gif" } };
  }

  // 1) Create media container
  const createBody = new URLSearchParams();
  createBody.set("image_url", imageUrl);
  createBody.set("caption", args.caption || "");
  createBody.set("access_token", token);

  const createRes = await fetch(`https://graph.facebook.com/v24.0/${encodeURIComponent(igUserId)}/media`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: createBody,
    cache: "no-store",
  });

  const createJson: any = await createRes.json().catch(() => null);

  if (!createRes.ok || !createJson?.id) {
    return { ok: false, status: createRes.status, json: createJson || { error: "Instagram create container failed" } };
  }

  const creationId = String(createJson.id);

  // 1.5) Wait for container FINISHED
  const waitsMs = [2000, 2000, 3000, 5000, 8000, 8000];
  for (let i = 0; i < waitsMs.length; i++) {
    const statusRes = await fetch(
      `https://graph.facebook.com/v24.0/${encodeURIComponent(creationId)}?fields=status_code&access_token=${encodeURIComponent(token)}`,
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

  // 2) Publish container (retry a few times)
  for (let attempt = 1; attempt <= 4; attempt++) {
    const publishBody = new URLSearchParams();
    publishBody.set("creation_id", creationId);
    publishBody.set("access_token", token);

    const publishRes = await fetch(`https://graph.facebook.com/v24.0/${encodeURIComponent(igUserId)}/media_publish`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: publishBody,
      cache: "no-store",
    });

    const publishJson: any = await publishRes.json().catch(() => null);

    if (publishRes.ok && publishJson?.id) {
      return { ok: true, status: publishRes.status, json: { postedId: publishJson.id, containerId: creationId } };
    }

    const subcode = publishJson?.error?.error_subcode;
    if (subcode === 2207027 || publishJson?.error?.code === 9007) {
      await sleep(1500 * attempt);
      continue;
    }

    return { ok: false, status: publishRes.status, json: publishJson || { error: "Instagram publish failed" } };
  }

  // exhausted: treat as pending
  return {
    ok: false,
    status: 202,
    json: { error: "Instagram is still processing this media. Please try again in a moment.", containerId: creationId },
    pending: true as const,
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));

    const message = String(body?.message ?? "").trim();
    const imageUrl = String(body?.imageUrl ?? "").trim();
    const videoUrl = String(body?.videoUrl ?? "").trim(); // kept for compatibility (full video posting comes next)

    const platformsRaw = Array.isArray(body?.platforms) ? body.platforms : [];
    const platforms: ProviderId[] = platformsRaw
      .map((p: any) => String(p || "").toLowerCase().trim())
      .filter(Boolean) as ProviderId[];

    if (!message) {
      return NextResponse.json({ success: false, error: "Message is required." }, { status: 400 });
    }

    if (platforms.length === 0) {
      return NextResponse.json({ success: false, error: "At least one platform is required." }, { status: 400 });
    }

    const organisationId = await resolveOrganisationId(req, body?.organisationId);
    if (!organisationId) {
      return NextResponse.json({ success: false, error: "No organisation found in database." }, { status: 400 });
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
            error: "Facebook not connected (missing page_id). Go to Connect and connect Facebook.",
          });
          continue;
        }

        if (!row?.page_access_token) {
          results.push({
            platform: "facebook",
            ok: false,
            error: "Facebook connected but missing page_access_token. Reconnect Facebook and pick the Page again.",
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
          const code = fb.json?.error?.code ?? null;
          const isRateLimited = Number(code) === 368;

          results.push({
            platform: "facebook",
            ok: false,
            status: fb.status,
            error: fb.json?.error?.message || "Facebook post failed",
            details: fb.json,
            rate_limited: isRateLimited,
            retry_after_seconds: isRateLimited ? 3600 : undefined,
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
        const li = await postToLinkedIn({ req, message, organisationId, imageUrl: imageUrl || undefined });

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
          mode: imageUrl ? "image" : "text",
        });

        continue;
      }

      // --- Instagram (direct IMAGE) ---
      if (p === "instagram") {
        const row = await loadSocialAccount(organisationId, "instagram");

        if (!row) {
          results.push({
            platform: "instagram",
            ok: false,
            status: 401,
            error: "Instagram is not connected. Go to Dashboard → Connect and connect Instagram.",
          });
          continue;
        }

        const igUserId = row.page_id || "";
        const token = row.page_access_token || "";

        const ig = await postToInstagram({
          igUserId,
          accessToken: token,
          caption: message,
          imageUrl: imageUrl,
        });

        if (!(ig as any).ok) {
          results.push({
            platform: "instagram",
            ok: false,
            pending: (ig as any).pending ? true : false,
            status: (ig as any).status,
            error: (ig as any)?.json?.error || (ig as any)?.json?.error?.message || "Instagram post failed",
            details: (ig as any)?.json,
          });
          continue;
        }

        results.push({
          platform: "instagram",
          ok: true,
          postedId: (ig as any).json?.postedId || null,
          mode: "image",
          details: (ig as any).json,
        });

        continue;
      }

      // --- Threads (direct TEXT/IMAGE) ---
      if (p === "threads") {
        const row = await loadSocialAccount(organisationId, "threads");

        if (!row?.page_access_token) {
          results.push({
            platform: "threads",
            ok: false,
            status: 401,
            error: "Threads is not connected (missing access token). Reconnect Threads on the Connect page.",
          });
          continue;
        }

        const th = await postToThreads({
          accessToken: row.page_access_token,
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
          continue;
        }

        results.push({
          platform: "threads",
          ok: true,
          postedId: th.json?.postedId || null,
          mode: imageUrl ? "image" : "text",
          details: th.json,
        });

        continue;
      }

      // Leave TikTok/others unchanged for now
      results.push({
        platform: p,
        ok: false,
        skipped: true,
        reason: "Not implemented here yet (kept unchanged).",
      });
    }

    const okCount = results.filter((r) => r.ok).length;
    const pendingCount = results.filter((r) => r.pending).length;
    const failCount = results.filter((r) => !r.ok && !r.skipped && !r.pending).length;
    const skippedCount = results.filter((r) => r.skipped).length;

    // If something is pending, we should not claim "success",
    // but we also shouldn't pretend it's a hard fail.
    const success = okCount > 0 && failCount === 0 && pendingCount === 0;

    return NextResponse.json(
      {
        success,
        organisationId,
        results,
        summary: {
          attempted: results.length,
          ok: okCount,
          pending: pendingCount,
          failed: failCount,
          skipped: skippedCount,
        },
        // Helpful top-level UX message
        userMessage:
          pendingCount > 0
            ? "Some posts are still processing (Instagram). Retry shortly."
            : failCount > 0
            ? "Some posts didn’t send. See per-channel details."
            : "Sent.",
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("[quick-blast] unexpected error", err);
    return NextResponse.json({ success: false, error: err?.message || "Internal server error" }, { status: 500 });
  }
}
