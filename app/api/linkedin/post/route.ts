import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

export const runtime = "nodejs";

type SocialAccountRow = {
  id: string;
  organisation_id: string;
  platform: string;
  page_id: string | null; // for LinkedIn we store something like member id / openid sub in here in your project
  page_name: string | null;
  is_active: boolean | null;
  page_access_token: string | null;
  token_expires_at: string | null;
};

function isLikelyImageUrl(url: string) {
  const u = (url || "").trim();
  if (!u) return false;
  if (!/^https:\/\/.+/i.test(u)) return false;
  return /\.(jpg|jpeg|png|webp|gif)(\?.*)?$/i.test(u);
}

async function loadLinkedInAccount(organisationId: string): Promise<SocialAccountRow | null> {
  const { data, error } = await supabaseAdmin
    .from("social_accounts")
    .select(
      "id, organisation_id, platform, page_id, page_name, is_active, page_access_token, token_expires_at"
    )
    .eq("organisation_id", organisationId)
    .eq("platform", "linkedin")
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[linkedin/post] social_accounts load error", error);
    return null;
  }
  return (data as any) ?? null;
}

async function getLinkedInAuthorUrn(token: string) {
  // Use OpenID Connect userinfo
  const userRes = await fetch("https://api.linkedin.com/v2/userinfo", {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });

  const userInfo: any = await userRes.json().catch(() => null);

  if (!userRes.ok) {
    return {
      ok: false as const,
      error:
        userInfo?.message ||
        userInfo?.error_description ||
        "Failed to fetch LinkedIn user info",
      details: userInfo,
      status: userRes.status,
    };
  }

  const sub = userInfo?.sub as string | undefined;
  if (!sub) {
    return {
      ok: false as const,
      error: "No 'sub' field in LinkedIn userinfo response",
      details: userInfo,
      status: 500,
    };
  }

  return {
    ok: true as const,
    authorUrn: `urn:li:person:${sub}`,
    status: 200,
  };
}

async function registerLinkedInImageUpload(args: {
  token: string;
  authorUrn: string;
}) {
  const registerBody = {
    registerUploadRequest: {
      recipes: ["urn:li:digitalmediaRecipe:feedshare-image"],
      owner: args.authorUrn,
      serviceRelationships: [
        {
          relationshipType: "OWNER",
          identifier: "urn:li:userGeneratedContent",
        },
      ],
    },
  };

  const res = await fetch("https://api.linkedin.com/v2/assets?action=registerUpload", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${args.token}`,
      "Content-Type": "application/json",
      "X-Restli-Protocol-Version": "2.0.0",
    },
    body: JSON.stringify(registerBody),
    cache: "no-store",
  });

  const json: any = await res.json().catch(() => null);

  if (!res.ok) {
    return {
      ok: false as const,
      error: json?.message || "Failed to register LinkedIn image upload",
      details: json,
      status: res.status,
    };
  }

  const value = json?.value;
  const uploadMechanism =
    value?.uploadMechanism?.["com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"];
  const uploadUrl = uploadMechanism?.uploadUrl as string | undefined;
  const asset = value?.asset as string | undefined;

  if (!uploadUrl || !asset) {
    return {
      ok: false as const,
      error: "LinkedIn registerUpload did not return uploadUrl/asset",
      details: json,
      status: 500,
    };
  }

  return {
    ok: true as const,
    uploadUrl,
    asset,
    status: 200,
  };
}

async function uploadBytesToLinkedIn(uploadUrl: string, bytes: Uint8Array, contentType: string) {
  const res = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": contentType || "application/octet-stream",
    },
    body: bytes, // ✅ Uint8Array is valid BodyInit (avoids Buffer TS build error)
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return {
      ok: false as const,
      error: "Failed uploading image bytes to LinkedIn",
      details: text,
      status: res.status,
    };
  }

  return { ok: true as const, status: res.status };
}

async function createLinkedInUgcPost(args: {
  token: string;
  authorUrn: string;
  text: string;
  imageAssetUrn?: string;
}) {
  const hasImage = !!args.imageAssetUrn;

  const postBody: any = {
    author: args.authorUrn,
    lifecycleState: "PUBLISHED",
    specificContent: {
      "com.linkedin.ugc.ShareContent": {
        shareCommentary: { text: args.text },
        shareMediaCategory: hasImage ? "IMAGE" : "NONE",
      },
    },
    visibility: {
      "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC",
    },
  };

  if (hasImage) {
    postBody.specificContent["com.linkedin.ugc.ShareContent"].media = [
      {
        status: "READY",
        media: args.imageAssetUrn,
        title: { text: "Image" },
      },
    ];
  }

  const res = await fetch("https://api.linkedin.com/v2/ugcPosts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${args.token}`,
      "Content-Type": "application/json",
      "X-Restli-Protocol-Version": "2.0.0",
      "LinkedIn-Version": "202402",
    },
    body: JSON.stringify(postBody),
    cache: "no-store",
  });

  // LinkedIn sometimes returns empty JSON; try both header + body
  const json: any = await res.json().catch(() => null);
  const headerId = res.headers.get("x-restli-id") || res.headers.get("x-linkedin-id");
  const postedId = json?.id || headerId || null;

  if (!res.ok) {
    return {
      ok: false as const,
      error: json?.message || "Failed to post on LinkedIn",
      details: json,
      status: res.status,
    };
  }

  return { ok: true as const, postedId, details: json, status: res.status };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));

    // Accept either "text" (correct) or "message" (common elsewhere)
    const text = String(body?.text ?? body?.message ?? "").trim();
    const organisationId = String(body?.organisationId ?? "").trim();
    const imageUrl = String(body?.imageUrl ?? "").trim();

    if (!organisationId) {
      return NextResponse.json(
        { ok: false, error: "Missing organisationId" },
        { status: 400 }
      );
    }

    if (!text) {
      return NextResponse.json(
        { ok: false, error: "Missing post text" },
        { status: 400 }
      );
    }

    const li = await loadLinkedInAccount(organisationId);
    const token = li?.page_access_token || null;

    if (!token) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "LinkedIn is not connected (missing access token). Please reconnect LinkedIn on the Connect page.",
        },
        { status: 401 }
      );
    }

    const author = await getLinkedInAuthorUrn(token);
    if (!author.ok) {
      return NextResponse.json(
        { ok: false, error: author.error, details: author.details, status: author.status },
        { status: 500 }
      );
    }

    let imageAssetUrn: string | undefined = undefined;

    // ✅ If imageUrl provided, upload it to LinkedIn first
    if (imageUrl) {
      if (!isLikelyImageUrl(imageUrl)) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "imageUrl must be a direct https image link ending .jpg/.png/.webp/.gif (not a webpage).",
          },
          { status: 400 }
        );
      }

      const imgRes = await fetch(imageUrl, { cache: "no-store" });
      if (!imgRes.ok) {
        return NextResponse.json(
          {
            ok: false,
            error: `Could not download imageUrl (HTTP ${imgRes.status})`,
          },
          { status: 400 }
        );
      }

      const contentType = imgRes.headers.get("content-type") || "image/jpeg";
      const arrayBuffer = await imgRes.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);

      const reg = await registerLinkedInImageUpload({
        token,
        authorUrn: author.authorUrn,
      });

      if (!reg.ok) {
        return NextResponse.json(
          { ok: false, error: reg.error, details: reg.details, status: reg.status },
          { status: 500 }
        );
      }

      const up = await uploadBytesToLinkedIn(reg.uploadUrl, bytes, contentType);
      if (!up.ok) {
        return NextResponse.json(
          { ok: false, error: up.error, details: up.details, status: up.status },
          { status: 500 }
        );
      }

      imageAssetUrn = reg.asset;
    }

    const post = await createLinkedInUgcPost({
      token,
      authorUrn: author.authorUrn,
      text,
      imageAssetUrn,
    });

    if (!post.ok) {
      return NextResponse.json(
        { ok: false, error: post.error, details: post.details, status: post.status },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      postedId: post.postedId,
      mode: imageAssetUrn ? "image" : "text",
    });
  } catch (err: any) {
    console.error("[linkedin/post] error", err);
    return NextResponse.json(
      { ok: false, error: err?.message || "Server error" },
      { status: 500 }
    );
  }
}
