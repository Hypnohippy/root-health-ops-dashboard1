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

function isLikelyImageUrl(url: string) {
  const u = (url || "").trim();
  if (!u) return false;
  if (!/^https:\/\/.+/i.test(u)) return false; // FB/IG should fetch https
  // allow jpg/jpeg/png/webp/gif (FB Page photos generally fine with jpg/png; others may work)
  return /\.(jpg|jpeg|png|webp|gif)(\?.*)?$/i.test(u);
}

async function postToFacebook(args: {
  pageId: string;
  pageAccessToken: string;
  message: string;
  imageUrl?: string;
}) {
  // If imageUrl is present, publish a photo post:
  // POST /{page_id}/photos?url=...&caption=...&published=true
  if (args.imageUrl && args.imageUrl.trim()) {
    const imageUrl = args.imageUrl.trim();

    // If it doesn't look like a direct image URL, fail fast with a helpful error
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

  // Otherwise do a text post:
  // POST /{page_id}/feed?message=...
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
      // ✅ For now: Facebook + Instagram implemented, others skip cleanly
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

        // FB returns { id: "..."} for feed, and { id: "...", post_id?: "..."} for photos sometimes
        results.push({
          platform: "facebook",
          ok: true,
          postedId: fb.json?.post_id || fb.json?.id || null,
          mode: imageUrl ? "photo" : "text",
        });

        continue;
      }

      // Instagram stays as-is in your existing setup (you already proved posting works).
      // We keep the existing behavior: if your IG route requires imageUrl, the UI already warns.
      results.push({
        platform: "instagram",
        ok: false,
        skipped: true,
        reason:
          "Instagram posting is handled by your existing IG flow. (This endpoint currently focuses on FB image support.)",
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
