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

async function postToFacebookPage(args: {
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
  return { ok: res.ok, status: res.status, json };
}

/**
 * Instagram publishing (Business/Creator via Graph API)
 * Requires:
 * - igUserId = instagram_business_account id (your social_accounts.instagram.page_id)
 * - pageAccessToken = token with instagram_content_publish (we store it in page_access_token)
 *
 * For simplicity/reliability:
 * - If there's no imageUrl, we return a clear "needs image" message for IG.
 */
async function publishToInstagram(args: {
  igUserId: string;
  pageAccessToken: string;
  caption: string;
  imageUrl: string;
}) {
  // 1) Create media container
  const createUrl = `https://graph.facebook.com/v24.0/${encodeURIComponent(
    args.igUserId
  )}/media`;

  const createBody = new URLSearchParams();
  createBody.set("image_url", args.imageUrl);
  createBody.set("caption", args.caption);
  createBody.set("access_token", args.pageAccessToken);

  const createRes = await fetch(createUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: createBody,
    cache: "no-store",
  });

  const createJson: any = await createRes.json().catch(() => null);
  if (!createRes.ok || !createJson?.id) {
    return {
      ok: false,
      stage: "create_media",
      status: createRes.status,
      json: createJson,
    };
  }

  const creationId = String(createJson.id);

  // 2) Publish container
  const publishUrl = `https://graph.facebook.com/v24.0/${encodeURIComponent(
    args.igUserId
  )}/media_publish`;

  const publishBody = new URLSearchParams();
  publishBody.set("creation_id", creationId);
  publishBody.set("access_token", args.pageAccessToken);

  const publishRes = await fetch(publishUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: publishBody,
    cache: "no-store",
  });

  const publishJson: any = await publishRes.json().catch(() => null);

  return {
    ok: publishRes.ok,
    stage: "media_publish",
    status: publishRes.status,
    json: publishJson,
    creationId,
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));

    const message = String(body?.message ?? "").trim();
    const imageUrl = typeof body?.imageUrl === "string" ? body.imageUrl.trim() : "";

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
      if (p === "facebook") {
        const fbRow = await loadSocialAccount(organisationId, "facebook");

        if (!fbRow?.page_id) {
          results.push({
            platform: "facebook",
            ok: false,
            error:
              "Facebook not connected (missing page_id). Go to Connect and connect Facebook.",
          });
          continue;
        }

        if (!fbRow?.page_access_token) {
          results.push({
            platform: "facebook",
            ok: false,
            error:
              "Facebook connected but missing page_access_token. Reconnect Facebook and pick the Page again.",
          });
          continue;
        }

        const fb = await postToFacebookPage({
          pageId: fbRow.page_id,
          pageAccessToken: fbRow.page_access_token,
          message,
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
          postedId: fb.json?.id || null,
        });

        continue;
      }

      if (p === "instagram") {
        const igRow = await loadSocialAccount(organisationId, "instagram");

        if (!igRow?.page_id) {
          results.push({
            platform: "instagram",
            ok: false,
            error:
              "Instagram not connected (missing ig user id). Go to Connect and connect Instagram.",
          });
          continue;
        }

        if (!igRow?.page_access_token) {
          results.push({
            platform: "instagram",
            ok: false,
            error:
              "Instagram connected but missing page_access_token. Reconnect Facebook/Instagram to refresh tokens.",
          });
          continue;
        }

        if (!imageUrl) {
          results.push({
            platform: "instagram",
            ok: false,
            error:
              "Instagram posting currently requires an imageUrl. Add an image and try again (we’ll add text-only later).",
          });
          continue;
        }

        const ig = await publishToInstagram({
          igUserId: igRow.page_id,
          pageAccessToken: igRow.page_access_token,
          caption: message,
          imageUrl,
        });

        if (!ig.ok) {
          results.push({
            platform: "instagram",
            ok: false,
            stage: ig.stage,
            status: ig.status,
            error:
              ig.json?.error?.message ||
              "Instagram publish failed (check permissions + IG is linked to FB Page).",
            details: ig.json,
          });
          continue;
        }

        results.push({
          platform: "instagram",
          ok: true,
          creationId: ig.creationId || null,
          postedId: ig.json?.id || null,
        });

        continue;
      }

      // default: not implemented yet
      results.push({
        platform: p,
        ok: false,
        skipped: true,
        reason: "Not implemented yet in OAuth posting.",
      });
    }

    const okCount = results.filter((r) => r.ok).length;
    const failCount = results.length - okCount;

    return NextResponse.json(
      {
        success: okCount > 0 && failCount === 0,
        organisationId,
        results,
        summary: {
          attempted: results.length,
          ok: okCount,
          failed: failCount,
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
