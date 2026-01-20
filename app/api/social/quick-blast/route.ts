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
  page_id: string | null; // FB: page id, IG: ig user id, LI: author urn (urn:li:person:...)
  page_name: string | null;
  connection_type: string | null;
  make_webhook_url: string | null;
  is_active: boolean | null;
  page_access_token: string | null; // FB Page token, IG token (same FB page token), LI access token
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

function isExpired(tokenExpiresAt: string | null) {
  if (!tokenExpiresAt) return false;
  const t = Date.parse(tokenExpiresAt);
  if (!Number.isFinite(t)) return false;
  return Date.now() > t - 60_000; // treat as expired if within 60s of expiry
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
  // Photo post if imageUrl provided
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

/**
 * Instagram Content Publishing:
 * - Create media container (image_url + caption)
 * - Poll container status
 * - Publish container
 */
async function createIgMediaContainer(args: {
  igUserId: string;
  accessToken: string;
  imageUrl: string;
  caption: string;
}) {
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

async function getIgContainerStatus(args: {
  creationId: string;
  accessToken: string;
}) {
  const url =
    `https://graph.facebook.com/v24.0/${encodeURIComponent(args.creationId)}?` +
    new URLSearchParams({
      fields: "status_code,status",
      access_token: args.accessToken,
    }).toString();

  const res = await fetch(url, { method: "GET", cache: "no-store" });
  const json: any = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, json };
}

async function publishIgMedia(args: {
  igUserId: string;
  accessToken: string;
  creationId: string;
}) {
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
  if (!args.imageUrl || !args.imageUrl.trim()) {
    return {
      ok: false,
      status: 400,
      json: {
        error: {
          message:
            "Instagram posting currently requires an imageUrl. Add an image and try again (we’ll add text-only later).",
        },
      },
      stage: "input" as const,
    };
  }

  if (!isLikelyImageUrl(args.imageUrl)) {
    return {
      ok: false,
      status: 400,
      json: {
        error: {
          message:
            "Instagram imageUrl must be a direct https image link (ending .jpg/.png etc).",
        },
      },
      stage: "input" as const,
    };
  }

  // 1) create container
  const created = await createIgMediaContainer({
    igUserId: args.igUserId,
    accessToken: args.accessToken,
    imageUrl: args.imageUrl,
    caption: args.caption,
  });

  if (!created.ok || !created.json?.id) {
    return {
      ok: false,
      status: created.status,
      json: created.json,
      stage: "media_create" as const,
    };
  }

  const creationId = String(created.json.id);

  // 2) poll until FINISHED (avoid “Media ID not available”)
  let containerStatus = "UNKNOWN";
  for (let i = 0; i < 10; i++) {
    const st = await getIgContainerStatus({
      creationId,
      accessToken: args.accessToken,
    });

    containerStatus =
      st.json?.status_code || st.json?.status || containerStatus;

    if (
      containerStatus === "FINISHED" ||
      containerStatus === "READY" ||
      containerStatus === "PUBLISHED"
    ) {
      break;
    }

    if (containerStatus === "ERROR" || containerStatus === "FAILED") {
      return {
        ok: false,
        status: 400,
        json: st.json,
        stage: "container_status" as const,
      };
    }

    // wait a bit
    await new Promise((r) => setTimeout(r, 1200));
  }

  // 3) publish
  const pub = await publishIgMedia({
    igUserId: args.igUserId,
    accessToken: args.accessToken,
    creationId,
  });

  if (!pub.ok) {
    return {
      ok: false,
      status: pub.status,
      json: pub.json,
      stage: "media_publish" as const,
      creationId,
      containerStatus,
    };
  }

  return {
    ok: true,
    status: 200,
    json: pub.json,
    creationId,
    containerStatus,
  };
}

/**
 * LinkedIn text post (Member share) via ugcPosts.
 * We store author as page_id (urn:li:person:...) and token in page_access_token.
 */
async function postToLinkedIn(args: {
  authorUrn: string;
  accessToken: string;
  message: string;
}) {
  const url = "https://api.linkedin.com/v2/ugcPosts";

  const payload = {
    author: args.authorUrn,
    lifecycleState: "PUBLISHED",
    specificContent: {
      "com.linkedin.ugc.ShareContent": {
        shareCommentary: {
          text: args.message,
        },
        shareMediaCategory: "NONE",
      },
    },
    visibility: {
      "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC",
    },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${args.accessToken}`,
      "Content-Type": "application/json",
      "X-Restli-Protocol-Version": "2.0.0",
    },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  const json: any = await res.json().catch(() => null);

  // Some LinkedIn responses put the created ID in headers, some in body.
  const headerId =
    res.headers.get("x-restli-id") ||
    res.headers.get("x-linkedin-id") ||
    res.headers.get("location");

  return {
    ok: res.ok,
    status: res.status,
    json,
    postedId: json?.id || headerId || null,
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
      if (p !== "facebook" && p !== "instagram" && p !== "linkedin") {
        results.push({
          platform: p,
          ok: false,
          skipped: true,
          reason: "Not implemented yet.",
        });
        continue;
      }

      // -------------------------
      // Facebook
      // -------------------------
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

      // -------------------------
      // Instagram
      // -------------------------
      if (p === "instagram") {
        const row = await loadSocialAccount(organisationId, "instagram");

        if (!row?.page_id) {
          results.push({
            platform: "instagram",
            ok: false,
            error:
              "Instagram not connected (missing page_id). Go to Connect and connect Instagram.",
          });
          continue;
        }

        if (!row?.page_access_token) {
          results.push({
            platform: "instagram",
            ok: false,
            error:
              "Instagram connected but missing page_access_token. Reconnect Instagram (or Facebook) and try again.",
          });
          continue;
        }

        const ig = await postToInstagram({
          igUserId: row.page_id,
          accessToken: row.page_access_token,
          caption: message,
          imageUrl: imageUrl,
        });

        if (!ig.ok) {
          results.push({
            platform: "instagram",
            ok: false,
            stage: (ig as any).stage || "instagram",
            status: (ig as any).status || 400,
            error: ig.json?.error?.message || "Instagram post failed",
            details: ig.json,
          });
          continue;
        }

        results.push({
          platform: "instagram",
          ok: true,
          creationId: (ig as any).creationId || null,
          postedId: ig.json?.id || null,
          containerStatus: (ig as any).containerStatus || null,
        });

        continue;
      }

      // -------------------------
      // LinkedIn
      // -------------------------
      if (p === "linkedin") {
        const row = await loadSocialAccount(organisationId, "linkedin");

        if (!row?.page_id) {
          results.push({
            platform: "linkedin",
            ok: false,
            error:
              "LinkedIn not connected (missing author URN). Go to Connect and connect LinkedIn.",
          });
          continue;
        }

        if (!row?.page_access_token) {
          results.push({
            platform: "linkedin",
            ok: false,
            error:
              "LinkedIn connected but missing access token. Reconnect LinkedIn and try again.",
          });
          continue;
        }

        if (isExpired(row.token_expires_at)) {
          results.push({
            platform: "linkedin",
            ok: false,
            error: "LinkedIn token expired. Please reconnect LinkedIn.",
          });
          continue;
        }

        const li = await postToLinkedIn({
          authorUrn: row.page_id,
          accessToken: row.page_access_token,
          message, // text-only for now
        });

        if (!li.ok) {
          results.push({
            platform: "linkedin",
            ok: false,
            status: li.status,
            error: li.json?.message || li.json?.error_description || "LinkedIn post failed",
            details: li.json,
          });
          continue;
        }

        results.push({
          platform: "linkedin",
          ok: true,
          postedId: li.postedId,
          mode: imageUrl ? "text_with_image_ignored" : "text",
        });

        continue;
      }
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
