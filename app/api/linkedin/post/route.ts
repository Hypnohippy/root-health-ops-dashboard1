// app/api/linkedin/post/route.ts
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

function getAccessToken() {
  const token = process.env.LINKEDIN_ACCESS_TOKEN;
  if (!token) throw new Error("LINKEDIN_ACCESS_TOKEN not configured");
  return token;
}

async function fetchJson(url: string, init: RequestInit) {
  const res = await fetch(url, { ...init, cache: "no-store" });
  const json: any = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, json };
}

function guessContentTypeFromUrl(url: string) {
  const u = url.toLowerCase();
  if (u.includes(".png")) return "image/png";
  if (u.includes(".gif")) return "image/gif";
  if (u.includes(".webp")) return "image/webp";
  if (u.includes(".jpg") || u.includes(".jpeg")) return "image/jpeg";
  if (u.includes(".mp4")) return "video/mp4";
  if (u.includes(".mov")) return "video/quicktime";
  return "application/octet-stream";
}

function isDirectHttpUrl(u: string) {
  return /^https:\/\/.+/i.test((u || "").trim());
}

function isLikelyImageUrl(u: string) {
  const s = (u || "").trim();
  return isDirectHttpUrl(s) && /\.(jpg|jpeg|png|gif|webp)(\?.*)?$/i.test(s);
}

function isLikelyVideoUrl(u: string) {
  const s = (u || "").trim();
  return isDirectHttpUrl(s) && /\.(mp4|mov)(\?.*)?$/i.test(s);
}

async function getMemberUrn(token: string) {
  // OpenID Connect user info (works with your current setup)
  const me = await fetchJson("https://api.linkedin.com/v2/userinfo", {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!me.ok) {
    const msg =
      me.json?.message ||
      me.json?.error_description ||
      me.json?.error ||
      "Failed to fetch LinkedIn user info";
    throw new Error(msg);
  }

  const sub = String(me.json?.sub || "").trim();
  if (!sub) throw new Error("No 'sub' in LinkedIn userinfo response");
  return `urn:li:person:${sub}`;
}

async function downloadBytes(url: string) {
  const res = await fetch(url, { method: "GET", cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to fetch media URL (${res.status})`);
  const contentType =
    res.headers.get("content-type") || guessContentTypeFromUrl(url);
  const ab = await res.arrayBuffer();
  // ✅ IMPORTANT: use Uint8Array (NOT Buffer) to satisfy Next/TS fetch BodyInit typing
  const bytes = new Uint8Array(ab);
  return { bytes, contentType };
}

async function registerUpload(args: {
  token: string;
  ownerUrn: string;
  mediaKind: "image" | "video";
}) {
  // Recipes:
  // - image: urn:li:digitalmediaRecipe:feedshare-image
  // - video: urn:li:digitalmediaRecipe:feedshare-video
  const recipe =
    args.mediaKind === "video"
      ? "urn:li:digitalmediaRecipe:feedshare-video"
      : "urn:li:digitalmediaRecipe:feedshare-image";

  const body = {
    registerUploadRequest: {
      recipes: [recipe],
      owner: args.ownerUrn,
      serviceRelationships: [
        {
          relationshipType: "OWNER",
          identifier: "urn:li:userGeneratedContent",
        },
      ],
    },
  };

  const out = await fetchJson(
    "https://api.linkedin.com/v2/assets?action=registerUpload",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${args.token}`,
        "Content-Type": "application/json",
        "X-Restli-Protocol-Version": "2.0.0",
      },
      body: JSON.stringify(body),
    }
  );

  if (!out.ok) {
    const msg =
      out.json?.message ||
      out.json?.error_description ||
      out.json?.error ||
      "LinkedIn registerUpload failed";
    throw new Error(msg);
  }

  const asset = out.json?.value?.asset as string | undefined;
  const uploadUrl = out.json?.value?.uploadMechanism?.[
    "com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"
  ]?.uploadUrl as string | undefined;

  if (!asset || !uploadUrl) {
    throw new Error("LinkedIn registerUpload returned no asset/uploadUrl");
  }

  return { asset, uploadUrl };
}

async function uploadToLinkedIn(args: {
  uploadUrl: string;
  bytes: Uint8Array;
  contentType: string;
}) {
  const res = await fetch(args.uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": args.contentType || "application/octet-stream",
    },
    // ✅ Uint8Array is accepted as BodyInit
    body: args.bytes,
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`LinkedIn upload failed (${res.status}) ${text}`.trim());
  }

  return true;
}

async function createUgcPost(args: {
  token: string;
  authorUrn: string;
  text: string;
  asset?: string;
  mediaKind?: "image" | "video";
}) {
  const hasMedia = !!args.asset && !!args.mediaKind;

  const postBody: any = {
    author: args.authorUrn,
    lifecycleState: "PUBLISHED",
    specificContent: {
      "com.linkedin.ugc.ShareContent": {
        shareCommentary: { text: args.text },
        shareMediaCategory: hasMedia
          ? args.mediaKind === "video"
            ? "VIDEO"
            : "IMAGE"
          : "NONE",
      },
    },
    visibility: {
      "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC",
    },
  };

  if (hasMedia) {
    postBody.specificContent["com.linkedin.ugc.ShareContent"].media = [
      {
        status: "READY",
        description: { text: "" },
        media: args.asset,
        title: { text: "" },
      },
    ];
  }

  const postRes = await fetch("https://api.linkedin.com/v2/ugcPosts", {
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

  // LinkedIn often returns 201 with empty body + Location header
  const text = await postRes.text().catch(() => "");
  let parsed: any = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = null;
  }

  if (!postRes.ok) {
    const msg =
      parsed?.message ||
      parsed?.error_description ||
      parsed?.error ||
      text ||
      "Failed to post on LinkedIn";
    throw new Error(msg);
  }

  const location = postRes.headers.get("x-restli-id") || postRes.headers.get("location");
  const idFromBody = parsed?.id;
  const postedId = idFromBody || location || null;

  return { postedId, raw: parsed || text || null };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));

    // Accept either { message } or { text }
    const text = String(body?.message ?? body?.text ?? "").trim();
    const imageUrl = String(body?.imageUrl ?? "").trim();
    const videoUrl = String(body?.videoUrl ?? "").trim();

    if (!text) {
      return NextResponse.json(
        { success: false, error: "Missing 'message' (or 'text') in body" },
        { status: 400 }
      );
    }

    if (imageUrl && videoUrl) {
      return NextResponse.json(
        { success: false, error: "Provide only one: imageUrl OR videoUrl" },
        { status: 400 }
      );
    }

    if (imageUrl && !isLikelyImageUrl(imageUrl)) {
      return NextResponse.json(
        { success: false, error: "imageUrl must be a direct https URL ending .jpg/.png/.gif/.webp" },
        { status: 400 }
      );
    }

    if (videoUrl && !isLikelyVideoUrl(videoUrl)) {
      return NextResponse.json(
        { success: false, error: "videoUrl must be a direct https URL ending .mp4/.mov" },
        { status: 400 }
      );
    }

    const token = getAccessToken();
    const authorUrn = await getMemberUrn(token);

    // Text-only post
    if (!imageUrl && !videoUrl) {
      const out = await createUgcPost({
        token,
        authorUrn,
        text,
      });

      return NextResponse.json({
        success: true,
        postedId: out.postedId,
        mode: "text",
      });
    }

    // Media post (image OR video)
    const mediaKind: "image" | "video" = videoUrl ? "video" : "image";
    const mediaUrl = videoUrl || imageUrl;

    const reg = await registerUpload({
      token,
      ownerUrn: authorUrn,
      mediaKind,
    });

    const dl = await downloadBytes(mediaUrl);
    await uploadToLinkedIn({
      uploadUrl: reg.uploadUrl,
      bytes: dl.bytes,
      contentType: dl.contentType,
    });

    const out = await createUgcPost({
      token,
      authorUrn,
      text,
      asset: reg.asset,
      mediaKind,
    });

    return NextResponse.json({
      success: true,
      postedId: out.postedId,
      mode: mediaKind,
      asset: reg.asset,
    });
  } catch (err: any) {
    const msg = err?.message || "Server error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
