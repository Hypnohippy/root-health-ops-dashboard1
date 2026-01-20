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

async function fetchJson(url: string) {
  const res = await fetch(url, { method: "GET", cache: "no-store" });
  const json: any = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, json };
}

async function postForm(url: string, params: Record<string, string>) {
  const body = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => body.set(k, v));

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });

  const json: any = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, json };
}

async function ensureInstagramBusinessId(args: {
  organisationId: string;
  facebookPageId: string;
  facebookPageToken: string;
}) {
  // Ask Facebook Page for the linked IG business account
  const url =
    `https://graph.facebook.com/v24.0/${encodeURIComponent(
      args.facebookPageId
    )}?` +
    new URLSearchParams({
      fields: "instagram_business_account{id,username,name}",
      access_token: args.facebookPageToken,
    }).toString();

  const out = await fetchJson(url);

  if (!out.ok) {
    return {
      ok: false as const,
      error: out.json?.error?.message || "Failed to fetch IG business account",
      details: out.json,
    };
  }

  const ig = out.json?.instagram_business_account;
  const igId: string | null = ig?.id ? String(ig.id) : null;
  const igName: string | null =
    (ig?.username && String(ig.username)) ||
    (ig?.name && String(ig.name)) ||
    null;

  if (!igId) {
    return {
      ok: false as const,
      error:
        "No Instagram Business account is linked to this Facebook Page. In Meta Business Suite, link the Instagram account to the Page (Business assets), then reconnect.",
      details: out.json,
    };
  }

  // Persist/refresh an instagram row in social_accounts so Connect shows it nicely.
  // Also store the same page access token because IG publishing uses it.
  try {
    // Look up existing instagram row
    const { data: existing, error: lookupErr } = await supabaseAdmin
      .from("social_accounts")
      .select("id")
      .eq("organisation_id", args.organisationId)
      .eq("platform", "instagram")
      .limit(1);

    if (lookupErr) {
      console.warn("[quick-blast] IG lookup warn", lookupErr);
    }

    if (existing && existing.length > 0) {
      await supabaseAdmin
        .from("social_accounts")
        .update({
          page_id: igId,
          page_name: igName,
          connection_type: "instagram_oauth",
          make_webhook_url: null,
          is_active: true,
          page_access_token: args.facebookPageToken,
          token_expires_at: null,
        })
        .eq("id", existing[0].id);
    } else {
      await supabaseAdmin.from("social_accounts").insert({
        organisation_id: args.organisationId,
        platform: "instagram",
        page_id: igId,
        page_name: igName,
        connection_type: "instagram_oauth",
        make_webhook_url: null,
        is_active: true,
        page_access_token: args.facebookPageToken,
        token_expires_at: null,
      });
    }
  } catch (e) {
    console.warn("[quick-blast] IG persist warn", e);
  }

  return {
    ok: true as const,
    igId,
    igName,
  };
}

async function postToInstagramFeed(args: {
  igUserId: string;
  pageAccessToken: string;
  caption: string;
  imageUrl: string;
}) {
  // 1) Create media container
  const createUrl = `https://graph.facebook.com/v24.0/${encodeURIComponent(
    args.igUserId
  )}/media`;

  const created = await postForm(createUrl, {
    image_url: args.imageUrl,
    caption: args.caption,
    access_token: args.pageAccessToken,
  });

  if (!created.ok || !created.json?.id) {
    return {
      ok: false as const,
      step: "create_media",
      status: created.status,
      error:
        created.json?.error?.message ||
        "Instagram create media failed (check permissions and image URL).",
      details: created.json,
    };
  }

  const creationId = String(created.json.id);

  // 2) Publish
  const publishUrl = `https://graph.facebook.com/v24.0/${encodeURIComponent(
    args.igUserId
  )}/media_publish`;

  const published = await postForm(publishUrl, {
    creation_id: creationId,
    access_token: args.pageAccessToken,
  });

  if (!published.ok || !published.json?.id) {
    return {
      ok: false as const,
      step: "publish",
      status: published.status,
      error:
        published.json?.error?.message ||
        "Instagram publish failed (check permissions).",
      details: published.json,
    };
  }

  return {
    ok: true as const,
    mediaId: String(published.json.id),
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));

    const message = String(body?.message ?? "").trim();
    const platformsRaw = Array.isArray(body?.platforms) ? body.platforms : [];
    const platforms: ProviderId[] = platformsRaw
      .map((p: any) => String(p || "").toLowerCase().trim())
      .filter(Boolean) as ProviderId[];

    // accept both names (UI might send either)
    const imageUrl =
      String(body?.imageUrl ?? body?.image_url ?? "").trim() || null;

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

    // We’ll load Facebook once (IG depends on it)
    const fbRow = platforms.includes("facebook") || platforms.includes("instagram")
      ? await loadSocialAccount(organisationId, "facebook")
      : null;

    for (const p of platforms) {
      if (p === "facebook") {
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
        // IG requires an image URL
        if (!imageUrl) {
          results.push({
            platform: "instagram",
            ok: false,
            error:
              "Instagram requires an image URL (JPG/PNG) for feed posting. Add an image URL then try again.",
          });
          continue;
        }

        // IG depends on Facebook connection + Page access token
        if (!fbRow?.page_id) {
          results.push({
            platform: "instagram",
            ok: false,
            error:
              "Instagram publishing requires Facebook Page connection first. Connect Facebook, pick the Page, then retry Instagram.",
          });
          continue;
        }
        if (!fbRow?.page_access_token) {
          results.push({
            platform: "instagram",
            ok: false,
            error:
              "Facebook connected but missing page_access_token. Reconnect Facebook and pick the Page again (Instagram uses that token).",
          });
          continue;
        }

        // Find linked IG business account and persist instagram row
        const ensured = await ensureInstagramBusinessId({
          organisationId,
          facebookPageId: fbRow.page_id,
          facebookPageToken: fbRow.page_access_token,
        });

        if (!ensured.ok) {
          results.push({
            platform: "instagram",
            ok: false,
            error: ensured.error,
            details: ensured.details,
          });
          continue;
        }

        const ig = await postToInstagramFeed({
          igUserId: ensured.igId,
          pageAccessToken: fbRow.page_access_token,
          caption: message,
          imageUrl,
        });

        if (!ig.ok) {
          results.push({
            platform: "instagram",
            ok: false,
            step: ig.step,
            status: ig.status,
            error: ig.error,
            details: ig.details,
          });
          continue;
        }

        results.push({
          platform: "instagram",
          ok: true,
          mediaId: ig.mediaId,
          igAccount: ensured.igName || null,
        });

        continue;
      }

      // Everything else: explicitly not implemented yet (no Make/Ayrshare surprises)
      results.push({
        platform: p,
        ok: false,
        skipped: true,
        reason:
          "Not implemented in OAuth posting yet (Facebook + Instagram first).",
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
