import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

type ProviderId = "linkedin";

type SocialAccountRow = {
  id: string;
  organisation_id: string;
  platform: ProviderId;
  page_access_token: string | null;
  is_active: boolean | null;
};

async function getSingleTenantOrganisationId() {
  const { data, error } = await supabaseAdmin
    .from("organisations")
    .select("id")
    .limit(1);

  if (error) {
    console.error("[linkedin/post] organisations error", error);
    return null;
  }
  if (!data || data.length === 0) return null;
  return data[0].id as string;
}

async function resolveOrganisationId(req: NextRequest) {
  // 1) querystring
  try {
    const orgFromQuery = req.nextUrl.searchParams.get("organisationId");
    if (orgFromQuery && orgFromQuery.trim()) return orgFromQuery.trim();
  } catch {}

  // 2) body
  try {
    const clone = req.clone();
    const b = await clone.json().catch(() => ({} as any));
    const orgFromBody = String(b?.organisationId ?? "").trim();
    if (orgFromBody) return orgFromBody;
  } catch {}

  // 3) single-tenant fallback
  return await getSingleTenantOrganisationId();
}

async function loadLinkedInToken(organisationId: string) {
  // Prefer token stored in social_accounts (so reconnect fixes expiry)
  const { data, error } = await supabaseAdmin
    .from("social_accounts")
    .select("id, organisation_id, platform, page_access_token, is_active")
    .eq("organisation_id", organisationId)
    .eq("platform", "linkedin")
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.warn("[linkedin/post] social_accounts load warn", error);
  }

  const row = (data as any as SocialAccountRow) ?? null;
  if (row?.page_access_token) return row.page_access_token;

  // Fallback to env token if you still have it
  const env = process.env.LINKEDIN_ACCESS_TOKEN;
  if (env) return env;

  throw new Error(
    "LinkedIn is not connected (no token found). Go to Connect and reconnect LinkedIn."
  );
}

async function fetchJson(url: string, token: string, init?: RequestInit) {
  const res = await fetch(url, {
    cache: "no-store",
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.headers || {}),
    },
  });

  const json: any = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, json };
}

async function getAuthorUrn(token: string) {
  // OpenID Connect userinfo
  const out = await fetchJson("https://api.linkedin.com/v2/userinfo", token);
  if (!out.ok) {
    const msg = out.json?.message || out.json?.error_description || "Failed to fetch LinkedIn userinfo";
    throw new Error(msg);
  }

  const sub = out.json?.sub ? String(out.json.sub) : "";
  if (!sub) throw new Error("LinkedIn userinfo returned no 'sub' (member id).");

  return `urn:li:person:${sub}`;
}

function isLikelyMediaUrl(url: string) {
  const u = (url || "").trim();
  if (!u) return false;
  if (!/^https:\/\//i.test(u)) return false;
  return true;
}

function mediaCategoryFromContentType(ct: string) {
  const s = (ct || "").toLowerCase();
  if (s.startsWith("image/")) return "IMAGE" as const;
  if (s.startsWith("video/")) return "VIDEO" as const;
  return null;
}

/**
 * Register upload + PUT bytes to LinkedIn, returns asset URN
 */
async function uploadAssetToLinkedIn(args: {
  token: string;
  authorUrn: string;
  mediaUrl: string;
}) {
  // 1) download bytes from your mediaUrl
  const mediaRes = await fetch(args.mediaUrl, { cache: "no-store" });
  if (!mediaRes.ok) {
    throw new Error(`Failed to fetch mediaUrl (${mediaRes.status}). Ensure it is a public https URL.`);
  }

  const contentType = mediaRes.headers.get("content-type") || "application/octet-stream";
  const ab = await mediaRes.arrayBuffer();

  const category = mediaCategoryFromContentType(contentType);
  if (!category) {
    throw new Error(
      `Unsupported media type (${contentType}). Use a public https image/* or video/* URL.`
    );
  }

  // 2) register upload
  const recipe =
    category === "IMAGE"
      ? "urn:li:digitalmediaRecipe:feedshare-image"
      : "urn:li:digitalmediaRecipe:feedshare-video";

  const registerBody: any = {
    registerUploadRequest: {
      owner: args.authorUrn,
      recipes: [recipe],
      serviceRelationships: [
        {
          relationshipType: "OWNER",
          identifier: "urn:li:userGeneratedContent",
        },
      ],
      supportedUploadMechanism: ["SYNCHRONOUS_UPLOAD"],
    },
  };

  const reg = await fetchJson(
    "https://api.linkedin.com/v2/assets?action=registerUpload",
    args.token,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Restli-Protocol-Version": "2.0.0",
      },
      body: JSON.stringify(registerBody),
    }
  );

  if (!reg.ok) {
    const msg =
      reg.json?.message ||
      reg.json?.error?.message ||
      "LinkedIn registerUpload failed";
    throw new Error(msg);
  }

  const value = reg.json?.value;
  const asset = value?.asset ? String(value.asset) : "";
  const uploadUrl =
    value?.uploadMechanism?.[
      "com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"
    ]?.uploadUrl;

  if (!asset || !uploadUrl) {
    throw new Error("LinkedIn registerUpload returned no asset/uploadUrl.");
  }

  // 3) upload bytes
  // IMPORTANT: use Uint8Array, not Buffer (fixes your Vercel build error)
  const bytes = new Uint8Array(ab);

  const putRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${args.token}`,
      "Content-Type": contentType,
    },
    body: bytes,
  });

  if (!putRes.ok) {
    const txt = await putRes.text().catch(() => "");
    throw new Error(`LinkedIn upload PUT failed (${putRes.status}). ${txt}`.trim());
  }

  return { asset, category };
}

async function createUgcPost(args: {
  token: string;
  authorUrn: string;
  text: string;
  asset?: string;
  category?: "IMAGE" | "VIDEO";
}) {
  const base: any = {
    author: args.authorUrn,
    lifecycleState: "PUBLISHED",
    visibility: {
      "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC",
    },
  };

  // Text-only
  if (!args.asset || !args.category) {
    base.specificContent = {
      "com.linkedin.ugc.ShareContent": {
        shareCommentary: { text: args.text },
        shareMediaCategory: "NONE",
      },
    };
  } else {
    base.specificContent = {
      "com.linkedin.ugc.ShareContent": {
        shareCommentary: { text: args.text },
        shareMediaCategory: args.category,
        media: [
          {
            status: "READY",
            media: args.asset,
            title: { text: "" },
          },
        ],
      },
    };
  }

  const postRes = await fetch("https://api.linkedin.com/v2/ugcPosts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${args.token}`,
      "Content-Type": "application/json",
      "X-Restli-Protocol-Version": "2.0.0",
      "LinkedIn-Version": "202402",
    },
    body: JSON.stringify(base),
  });

  const postJson: any = await postRes.json().catch(() => null);

  if (!postRes.ok) {
    const msg =
      postJson?.message ||
      postJson?.error?.message ||
      "Failed to post on LinkedIn";
    throw new Error(msg);
  }

  // LinkedIn typically returns an id URN in headers or body depending on endpoint behavior.
  // We’ll return the full payload and let Quick Blast show something useful.
  return postJson;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({} as any));

    // Accept BOTH field names (your Quick Blast sends message; older code sent text)
    const text = String(body?.text ?? body?.message ?? "").trim();
    const mediaUrl = String(body?.mediaUrl ?? body?.imageUrl ?? body?.videoUrl ?? "").trim();

    if (!text) {
      return NextResponse.json({ error: "Missing 'text' (or 'message') in body" }, { status: 400 });
    }

    const organisationId = await resolveOrganisationId(req);
    if (!organisationId) {
      return NextResponse.json({ error: "No organisation found" }, { status: 400 });
    }

    const token = await loadLinkedInToken(organisationId);
    const authorUrn = await getAuthorUrn(token);

    // Optional media
    let asset: string | undefined;
    let category: "IMAGE" | "VIDEO" | undefined;

    if (mediaUrl) {
      if (!isLikelyMediaUrl(mediaUrl)) {
        return NextResponse.json(
          { error: "mediaUrl must be a public https URL" },
          { status: 400 }
        );
      }

      const up = await uploadAssetToLinkedIn({ token, authorUrn, mediaUrl });
      asset = up.asset;
      category = up.category;
    }

    const postData = await createUgcPost({
      token,
      authorUrn,
      text,
      asset,
      category,
    });

    // Provide a stable field for Quick Blast + UI
    return NextResponse.json({
      ok: true,
      organisationId,
      postedId: postData?.id || postData?.urn || null,
      mode: category ? category.toLowerCase() : "text",
      raw: postData,
    });
  } catch (err: any) {
    const msg = err?.message || "Server error";
    console.error("[linkedin/post] error", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
