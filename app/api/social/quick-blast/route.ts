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
  page_id: string | null; // FB: page_id, IG: ig_user_id
  page_name: string | null;
  connection_type: string | null;
  make_webhook_url: string | null;
  is_active: boolean | null;
  page_access_token: string | null; // FB page token, IG token (needs insta scopes)
  token_expires_at: string | null;
};

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

async function resolveOrganisationId(req: NextRequest) {
  try {
    const orgFromQuery = req.nextUrl.searchParams.get("organisationId");
    if (orgFromQuery && orgFromQuery.trim()) return orgFromQuery.trim();
  } catch {}
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

function isHttps(url: string) {
  return /^https:\/\/.+/i.test((url || "").trim());
}

function isLikelyImageUrl(url: string) {
  const u = (url || "").trim();
  if (!u) return false;
  if (!isHttps(u)) return false; // FB/IG should fetch https
  return /\.(jpg|jpeg|png|webp|gif)(\?.*)?$/i.test(u);
}

async function fbPost(args: {
  pageId: string;
  pageAccessToken: string;
  message: string;
  imageUrl?: string;
}) {
  // If imageUrl is present, publish a photo post:
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

  // Otherwise do a text post:
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

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

async function igCreateMedia(args: {
  igUserId: string;
  accessToken: string;
  caption: string;
  imageUrl: string;
}) {
  // POST /{ig-user-id}/media?image_url=...&caption=...
  const url = `https://graph.facebook.com/v24.0/${encodeURIComponent(
    args.igUserId
  )}/media`;

  const body = new URLSearchParams();
  body.set("image_url", args.imageUrl);
  body.set("caption", args.caption);
  body.set("access_token", args.accessToken);

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });

  const json: any = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, json };
}

async function igGetContainerStatus(args: {
  creationId: string;
  accessToken: string;
}) {
  // GET /{creation-id}?fields=status_code
  const url =
    `https://graph.facebook.com/v24.0/${encodeURIComponent(args.creationId)}` +
    "?" +
    new URLSearchParams({
      fields: "status_code",
      access_token: args.accessToken,
    }).toString();

  const res = await fetch(url, { method: "GET", cache: "no-store" });
  const json: any = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, json };
}

async function igPublish(args: { igUserId: string; accessToken: string; creationId: string }) {
  // POST /{ig-user-id}/media_publish?creation_id=...
  const url = `https://graph.facebook.com/v24.0/${encodeURIComponent(
    args.igUserId
  )}/media_publish`;

  const body = new URLSearchParams();
  body.set("creation_id", args.creationId);
  body.set("access_token", args.accessToken);

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });

  const json: any = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, json };
}

async function postToInstagram(args: {
  igUserId: string;
  accessToken: string;
  caption: string;
  imageUrl: string;
}) {
  if (!isLikelyImageUrl(args.imageUrl)) {
    return {
      ok: false,
      stage: "validation",
      status: 400,
      error:
        "Instagram imageUrl must be a direct https image link (ending .jpg/.png etc).",
      details: null,
    };
  }

  // 1) Create media container
  const create = await igCreateMedia({
    igUserId: args.igUserId,
    accessToken: args.accessToken,
    caption: args.caption,
    imageUrl: args.imageUrl,
  });

  if (!create.ok || !create.json?.id) {
    return {
      ok: false,
      stage: "media_create",
      status: create.status,
      error: create.json?.error?.message || "Instagram media create failed",
      details: create.json,
    };
  }

  const creationId = String(create.json.id);

  // 2) Poll until container is FINISHED (Meta can take a few seconds)
  let statusCode = "UNKNOWN";
  const maxAttempts = 12; // ~24s total at 2s intervals
  for (let i = 0; i < maxAttempts; i++) {
    await sleep(2000);

    const st = await igGetContainerStatus({
      creationId,
      accessToken: args.accessToken,
    });

    if (!st.ok) {
      // If status check fails, keep going a bit then report
      statusCode = "STATUS_CHECK_FAILED";
      continue;
    }

    statusCode = String(st.json?.status_code || "UNKNOWN");

    if (statusCode === "FINISHED") break;
    if (statusCode === "ERROR") {
      return {
        ok: false,
        stage: "container_status",
        status: 400,
        error: "Instagram container status ERROR",
        details: st.json,
      };
    }
  }

  if (statusCode !== "FINISHED") {
    return {
      ok: false,
      stage: "container_wait",
      status: 400,
      error:
        "Instagram media is not ready to publish yet. Try again in a moment.",
      details: { creationId, containerStatus: statusCode },
    };
  }

  // 3) Publish
  const pub = await igPublish({
    igUserId: args.igUserId,
    accessToken: args.accessToken,
    creationId,
  });

  if (!pub.ok || !pub.json?.id) {
    return {
      ok: false,
      stage: "media_publish",
      status: pub.status,
      error: pub.json?.error?.message || "Instagram publish failed",
      details: pub.json,
    };
  }

  return {
    ok: true,
    creationId,
    postedId: String(pub.json.id),
    containerStatus: statusCode,
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));

    const message = String(body?.message ?? "").trim();
    const imageUrl = String(body?.imageUrl ?? "").trim();

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

    const organisationId = await resolveOrganisationId(req);
    if (!organisationId) {
      return NextResponse.json(
        { success: false, error: "No organisation found in database." },
        { status: 400 }
      );
    }

    const results: any[] = [];

    for (const p of platforms) {
      // Only FB + IG are implemented right now
      if (p !== "facebook" && p !== "instagram") {
        results.push({
          platform: p,
          ok: false,
          skipped: true,
          reason: "Not implemented yet.",
        });
        continue;
      }

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

        const fb = await fbPost({
          pageId: row.page_id,
          pageAccessToken: row.page_access_token,
          message,
          imageUrl: imageUrl || undefined,
        });

        if (!fb.ok) {
          results.push({
            platform: "facebook",
            ok: false,
            stage: "post",
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

      // Instagram
      if (p === "instagram") {
        const row = await loadSocialAccount(organisationId, "instagram");

        if (!row?.page_id) {
          results.push({
            platform: "instagram",
            ok: false,
            error:
              "Instagram not connected (missing IG user id). Go to Connect and connect Instagram.",
          });
          continue;
        }

        if (!row?.page_access_token || !row.page_access_token.trim()) {
          results.push({
            platform: "instagram",
            ok: false,
            error:
              "Instagram connected but missing page_access_token. Reconnect Instagram and pick the account again.",
          });
          continue;
        }

        // For now, IG requires an image (you already saw this)
        if (!imageUrl) {
          results.push({
            platform: "instagram",
            ok: false,
            error:
              "Instagram posting currently requires an imageUrl. Add an image and try again (we’ll add text-only later).",
          });
          continue;
        }

        const ig = await postToInstagram({
          igUserId: row.page_id,
          accessToken: row.page_access_token,
          caption: message,
          imageUrl,
        });

        if (!ig.ok) {
          results.push({
            platform: "instagram",
            ok: false,
            stage: ig.stage,
            status: ig.status,
            error: ig.error,
            details: ig.details,
          });
          continue;
        }

        results.push({
          platform: "instagram",
          ok: true,
          creationId: ig.creationId,
          postedId: ig.postedId,
          containerStatus: ig.containerStatus,
        });
      }
    }

    const okCount = results.filter((r) => r.ok).length;
    const failedCount = results.filter((r) => !r.ok && !r.skipped).length;
    const skippedCount = results.filter((r) => r.skipped).length;

    return NextResponse.json(
      {
        success: failedCount === 0,
        organisationId,
        results,
        summary: {
          attempted: results.length,
          ok: okCount,
          failed: failedCount,
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
