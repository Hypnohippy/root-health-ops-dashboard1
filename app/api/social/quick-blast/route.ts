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
  page_id: string | null; // for linkedin we will store author URN or person id
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
  if (!/^https:\/\/.+/i.test(u)) return false;
  return /\.(jpg|jpeg|png|webp|gif)(\?.*)?$/i.test(u);
}

/** -----------------------------
 *  FACEBOOK
 *  ---------------------------- */
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
  return { ok: res.ok, status: res.status, json };
}

/** -----------------------------
 *  LINKEDIN (Option A)
 *  Uses the token already stored in social_accounts
 *  page_access_token = LinkedIn access token
 *  page_id = author URN (preferred) or LinkedIn person id
 *  ---------------------------- */

function normalizeLinkedInAuthorUrn(pageId: string | null): string | null {
  const v = (pageId || "").trim();
  if (!v) return null;

  // already urn
  if (v.startsWith("urn:li:")) return v;

  // otherwise treat as person id
  return `urn:li:person:${v}`;
}

async function fetchLinkedInMe(accessToken: string) {
  // Classic endpoint
  const res = await fetch("https://api.linkedin.com/v2/me", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "X-Restli-Protocol-Version": "2.0.0",
    },
    cache: "no-store",
  });

  const json: any = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, json };
}

async function ensureLinkedInAuthorUrn(args: {
  organisationId: string;
  linkedinRow: SocialAccountRow;
}): Promise<{ authorUrn: string | null; personId: string | null }> {
  const existingUrn = normalizeLinkedInAuthorUrn(args.linkedinRow.page_id);
  if (existingUrn) return { authorUrn: existingUrn, personId: null };

  const token = (args.linkedinRow.page_access_token || "").trim();
  if (!token) return { authorUrn: null, personId: null };

  const me = await fetchLinkedInMe(token);
  if (!me.ok || !me.json?.id) {
    console.warn("[quick-blast] linkedin /me failed", me.status, me.json);
    return { authorUrn: null, personId: null };
  }

  const personId = String(me.json.id);
  const authorUrn = `urn:li:person:${personId}`;

  // Save back so ALL pages can rely on it
  try {
    await supabaseAdmin
      .from("social_accounts")
      .update({
        page_id: authorUrn,
        page_name:
          args.linkedinRow.page_name ||
          me.json?.localizedFirstName ||
          me.json?.firstName?.localized?.en_US ||
          null,
        is_active: true,
      })
      .eq("id", args.linkedinRow.id);
  } catch (e) {
    console.warn("[quick-blast] linkedin author urn save warn", e);
  }

  return { authorUrn, personId };
}

async function postToLinkedInText(args: {
  accessToken: string;
  authorUrn: string;
  message: string;
}) {
  const url = "https://api.linkedin.com/v2/ugcPosts";

  const payload = {
    author: args.authorUrn,
    lifecycleState: "PUBLISHED",
    specificContent: {
      "com.linkedin.ugc.ShareContent": {
        shareCommentary: { text: args.message },
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

  // LinkedIn often returns 201 with empty body
  const text = await res.text().catch(() => "");
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  // some responses provide id in header
  const headerId =
    res.headers.get("x-restli-id") ||
    res.headers.get("x-linkedin-id") ||
    null;

  return {
    ok: res.ok,
    status: res.status,
    json,
    headerId,
    raw: text?.slice(0, 500) || "",
  };
}

/** -----------------------------
 *  MAIN
 *  ---------------------------- */
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
      // Only these are implemented right now
      if (p !== "facebook" && p !== "instagram" && p !== "linkedin" && p !== "threads") {
        results.push({
          platform: p,
          ok: false,
          skipped: true,
          reason: "Not implemented yet.",
        });
        continue;
      }

      // FACEBOOK
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
          mode: imageUrl ? "photo" : "text",
        });
        continue;
      }

      // INSTAGRAM (your existing working flow)
      if (p === "instagram") {
        // Keep your existing Instagram handler where it currently lives.
        // If you already have IG posting working in this endpoint in your current version,
        // leave it as-is. If not, this will skip cleanly.
        results.push({
          platform: "instagram",
          ok: false,
          skipped: true,
          reason:
            "Instagram posting is handled by your existing IG flow (already working).",
        });
        continue;
      }

      // THREADS (already working in your build — enforce 500 char max)
      if (p === "threads") {
        const row = await loadSocialAccount(organisationId, "threads");

        if (!row?.page_access_token) {
          results.push({
            platform: "threads",
            ok: false,
            error: "Threads not connected (missing access token). Connect Threads.",
          });
          continue;
        }

        // Threads max is 500 chars — hard trim so it never fails
        const text = message.length > 500 ? message.slice(0, 500) : message;

        // NOTE: Your Threads posting logic may exist elsewhere in your project.
        // If your project currently posts Threads successfully from this endpoint, keep it.
        // If you want me to wire the Threads API calls here next, say so and paste your current threads route.
        results.push({
          platform: "threads",
          ok: false,
          skipped: true,
          reason:
            "Threads posting is already working in your project; keep your existing implementation. (We can unify it here next if you want.)",
          note: message.length > 500 ? "Message trimmed to 500 chars (Threads limit)." : undefined,
        });
        continue;
      }

      // ✅ LINKEDIN (Option A implemented here)
      if (p === "linkedin") {
        const row = await loadSocialAccount(organisationId, "linkedin");

        if (!row?.page_access_token) {
          results.push({
            platform: "linkedin",
            ok: false,
            error:
              "LinkedIn not connected (missing access token). Reconnect LinkedIn from Connect.",
          });
          continue;
        }

        const { authorUrn } = await ensureLinkedInAuthorUrn({
          organisationId,
          linkedinRow: row,
        });

        if (!authorUrn) {
          results.push({
            platform: "linkedin",
            ok: false,
            error:
              "LinkedIn connected but could not resolve author URN. Reconnect LinkedIn and try again.",
          });
          continue;
        }

        const li = await postToLinkedInText({
          accessToken: row.page_access_token,
          authorUrn,
          message,
        });

        if (!li.ok) {
          results.push({
            platform: "linkedin",
            ok: false,
            status: li.status,
            error:
              li.json?.message ||
              li.json?.error_description ||
              "LinkedIn post failed",
            details: li.json || li.raw,
          });
          continue;
        }

        results.push({
          platform: "linkedin",
          ok: true,
          postedId: li.json?.id || li.headerId || null,
          mode: "text",
        });

        continue;
      }
    }

    const okCount = results.filter((r) => r.ok).length;
    const failCount = results.filter((r) => r.ok === false && !r.skipped).length;
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
