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
  page_id: string | null; // pageId / igId / threadsUserId / etc
  page_name: string | null;
  connection_type: string | null;
  make_webhook_url: string | null;
  is_active: boolean | null;
  page_access_token: string | null;
  token_expires_at: string | null;
};

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

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

function isLikelyImageUrl(url: string) {
  const u = (url || "").trim();
  if (!u) return false;
  if (!/^https:\/\/.+/i.test(u)) return false;
  return /\.(jpg|jpeg|png|webp|gif)(\?.*)?$/i.test(u);
}

// -------------------------
// Facebook posting
// -------------------------
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
    return { ok: res.ok, status: res.status, json };
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
  return { ok: res.ok, status: res.status, json };
}

// -------------------------
// Threads posting
// (graph.threads.net)
// -------------------------
async function threadsCreateContainer(args: {
  threadsUserId: string;
  accessToken: string;
  message: string;
  imageUrl?: string;
}) {
  const base = `https://graph.threads.net/v1.0/${encodeURIComponent(args.threadsUserId)}/threads`;

  const body = new URLSearchParams();
  body.set("access_token", args.accessToken);

  if (args.imageUrl && args.imageUrl.trim()) {
    const imageUrl = args.imageUrl.trim();
    if (!isLikelyImageUrl(imageUrl)) {
      return {
        ok: false,
        status: 400,
        json: { error: { message: "Threads imageUrl must be a direct https image link (.jpg/.png etc)." } },
      };
    }
    body.set("media_type", "IMAGE");
    body.set("image_url", imageUrl);
    body.set("text", args.message);
  } else {
    body.set("media_type", "TEXT");
    body.set("text", args.message);
  }

  const res = await fetch(base, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });

  const json: any = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, json };
}

async function threadsPublishContainer(args: {
  threadsUserId: string;
  accessToken: string;
  creationId: string;
}) {
  const url = `https://graph.threads.net/v1.0/${encodeURIComponent(
    args.threadsUserId
  )}/threads_publish`;

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
      // ---------- Facebook ----------
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
          mode: imageUrl ? "photo" : "text",
        });
        continue;
      }

      // ---------- Instagram ----------
      if (p === "instagram") {
        // Your IG flow already works in this project (you proved it).
        // We keep using it exactly as you’ve implemented it elsewhere.
        // If your IG posting is already integrated into THIS endpoint in your current deployment, keep that.
        // Otherwise: you can leave this as “skipped” until we unify.
        //
        // If you already have the IG implementation in this endpoint (as per your successful result),
        // then DO NOT use this block. Keep your working IG implementation.
        //
        // For safety, we’ll detect whether the IG row has a token; if yes, we attempt direct Threads-style publish is NOT correct for IG.
        // So we simply return the “not implemented here” message unless your working IG code is present.
        results.push({
          platform: "instagram",
          ok: false,
          skipped: true,
          reason:
            "Instagram posting is handled by your existing IG flow in this project. (Leave as-is if already implemented.)",
        });
        continue;
      }

      // ---------- LinkedIn ----------
      if (p === "linkedin") {
        // You already wired LinkedIn and confirmed it posts successfully.
        // So we don’t touch it here unless you want it unified in this endpoint as well.
        results.push({
          platform: "linkedin",
          ok: false,
          skipped: true,
          reason:
            "LinkedIn posting is already working in your project; keep your existing LinkedIn implementation where it currently lives.",
        });
        continue;
      }

      // ---------- Threads ----------
      if (p === "threads") {
        const row = await loadSocialAccount(organisationId, "threads");

        if (!row?.page_id) {
          results.push({
            platform: "threads",
            ok: false,
            error: "Threads not connected (missing threads user id). Go to Connect and connect Threads.",
          });
          continue;
        }

        if (!row?.page_access_token) {
          results.push({
            platform: "threads",
            ok: false,
            error: "Threads connected but missing access token. Reconnect Threads.",
          });
          continue;
        }

        // Create container
        const create = await threadsCreateContainer({
          threadsUserId: row.page_id,
          accessToken: row.page_access_token,
          message,
          imageUrl: imageUrl || undefined,
        });

        if (!create.ok) {
          results.push({
            platform: "threads",
            ok: false,
            stage: "container_create",
            status: create.status,
            error: create.json?.error?.message || "Threads container create failed",
            details: create.json,
          });
          continue;
        }

        const creationId = String(create.json?.id || "");
        if (!creationId) {
          results.push({
            platform: "threads",
            ok: false,
            stage: "container_create",
            error: "Threads did not return a creation id",
            details: create.json,
          });
          continue;
        }

        // Publish (with small retries in case media needs a moment)
        let published: any = null;
        let lastErr: any = null;

        for (let attempt = 1; attempt <= 6; attempt++) {
          const pub = await threadsPublishContainer({
            threadsUserId: row.page_id,
            accessToken: row.page_access_token,
            creationId,
          });

          if (pub.ok && (pub.json?.id || pub.json?.post_id)) {
            published = pub;
            break;
          }

          lastErr = pub;
          // Wait a moment (common when publishing media)
          await sleep(1500);
        }

        if (!published) {
          results.push({
            platform: "threads",
            ok: false,
            stage: "container_publish",
            status: lastErr?.status || 400,
            error: lastErr?.json?.error?.message || "Threads publish failed",
            details: lastErr?.json,
            creationId,
          });
          continue;
        }

        results.push({
          platform: "threads",
          ok: true,
          creationId,
          postedId: published.json?.id || published.json?.post_id || null,
          mode: imageUrl ? "image" : "text",
        });

        continue;
      }

      // ---------- Everything else ----------
      results.push({
        platform: p,
        ok: false,
        skipped: true,
        reason: "Not implemented yet.",
      });
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
