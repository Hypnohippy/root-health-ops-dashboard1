import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

function pickText(body: any) {
  const t =
    (typeof body?.text === "string" && body.text) ||
    (typeof body?.message === "string" && body.message) ||
    "";
  return String(t || "").trim();
}

function pickUrl(body: any, key: "imageUrl" | "videoUrl") {
  const v = body?.[key];
  if (!v) return "";
  return String(v || "").trim();
}

function looksLikeHttpsUrl(u: string) {
  return /^https:\/\/.+/i.test((u || "").trim());
}

async function getLinkedInAccessToken() {
  const token = process.env.LINKEDIN_ACCESS_TOKEN;
  if (!token) throw new Error("LINKEDIN_ACCESS_TOKEN not configured");
  return token;
}

async function safeJson(res: Response) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

async function fetchBytesFromUrl(url: string) {
  const res = await fetch(url, { method: "GET", cache: "no-store" });
  const contentType = res.headers.get("content-type") || "";
  const buf = Buffer.from(await res.arrayBuffer());
  return { ok: res.ok, status: res.status, contentType, buf };
}

function isImageContentType(ct: string) {
  return /^image\/(jpeg|jpg|png|gif|webp)$/i.test(ct || "");
}
function isVideoContentType(ct: string) {
  return /^video\/(mp4|quicktime|x-m4v|webm)$/i.test(ct || "");
}

async function getAuthorUrn(token: string) {
  const userRes = await fetch("https://api.linkedin.com/v2/userinfo", {
    headers: { Authorization: `Bearer ${token}` },
  });
  const userInfo = await safeJson(userRes);
  if (!userRes.ok) {
    throw new Error(userInfo?.message || "Failed to fetch LinkedIn user info");
  }
  const sub = userInfo?.sub as string | undefined;
  if (!sub) throw new Error("No 'sub' field in LinkedIn userinfo response");
  return `urn:li:person:${sub}`;
}

async function registerUpload(token: string, authorUrn: string, kind: "image" | "video") {
  // LinkedIn recipes:
  // image: urn:li:digitalmediaRecipe:feedshare-image
  // video: urn:li:digitalmediaRecipe:feedshare-video
  const recipe =
    kind === "image"
      ? "urn:li:digitalmediaRecipe:feedshare-image"
      : "urn:li:digitalmediaRecipe:feedshare-video";

  const body = {
    registerUploadRequest: {
      recipes: [recipe],
      owner: authorUrn,
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
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-Restli-Protocol-Version": "2.0.0",
      "LinkedIn-Version": "202402",
    },
    body: JSON.stringify(body),
  });

  const json = await safeJson(res);
  if (!res.ok) {
    throw new Error(json?.message || "LinkedIn registerUpload failed");
  }

  const uploadUrl =
    json?.value?.uploadMechanism?.["com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"]
      ?.uploadUrl;

  const asset = json?.value?.asset;

  if (!uploadUrl || !asset) {
    throw new Error("LinkedIn registerUpload returned missing uploadUrl/asset");
  }

  return { uploadUrl: String(uploadUrl), asset: String(asset) };
}

async function uploadToLinkedIn(uploadUrl: string, bytes: Buffer, contentType: string) {
  // LinkedIn expects PUT binary to the uploadUrl
  const res = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": contentType || "application/octet-stream",
    },
    body: bytes,
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`LinkedIn upload failed (${res.status}). ${txt || ""}`.trim());
  }
}

async function createUgcPost(args: {
  token: string;
  authorUrn: string;
  text: string;
  media?: { kind: "image" | "video"; asset: string };
}) {
  const hasMedia = !!args.media;

  const postBody: any = {
    author: args.authorUrn,
    lifecycleState: "PUBLISHED",
    specificContent: {
      "com.linkedin.ugc.ShareContent": {
        shareCommentary: { text: args.text },
        shareMediaCategory: hasMedia
          ? args.media!.kind === "image"
            ? "IMAGE"
            : "VIDEO"
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
        media: args.media!.asset,
        title: { text: "" },
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
  });

  const json = await safeJson(res);

  if (!res.ok) {
    throw new Error(json?.message || "Failed to post on LinkedIn");
  }

  // often returned in headers
  const headerId =
    res.headers.get("x-restli-id") ||
    res.headers.get("x-linkedin-id") ||
    res.headers.get("location") ||
    "";

  const postedId =
    (typeof json?.id === "string" && json.id) ||
    (typeof json === "string" && json) ||
    headerId ||
    null;

  return { postedId, raw: json };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));

    const text = pickText(body);
    const imageUrl = pickUrl(body, "imageUrl");
    const videoUrl = pickUrl(body, "videoUrl");

    if (!text) {
      return NextResponse.json(
        { error: "Missing post text. Send { message: '...' } (or { text: '...' })." },
        { status: 400 }
      );
    }

    // validate urls if provided
    if (imageUrl && !looksLikeHttpsUrl(imageUrl)) {
      return NextResponse.json({ error: "imageUrl must be an https URL" }, { status: 400 });
    }
    if (videoUrl && !looksLikeHttpsUrl(videoUrl)) {
      return NextResponse.json({ error: "videoUrl must be an https URL" }, { status: 400 });
    }

    const token = await getLinkedInAccessToken();
    const authorUrn = await getAuthorUrn(token);

    // Prefer video if both provided
    const mediaUrl = (videoUrl || imageUrl || "").trim();

    if (!mediaUrl) {
      const out = await createUgcPost({ token, authorUrn, text });
      return NextResponse.json({ ok: true, mode: "text", postedId: out.postedId, raw: out.raw });
    }

    // Fetch bytes
    const fetched = await fetchBytesFromUrl(mediaUrl);

    if (!fetched.ok) {
      return NextResponse.json(
        { error: `Failed to fetch media (${fetched.status}) from URL` },
        { status: 400 }
      );
    }

    const ct = fetched.contentType || "";
    const sizeBytes = fetched.buf.length;

    // Basic sanity limits to avoid timeouts
    // (LinkedIn supports larger, but Vercel serverless can struggle with huge files)
    const MAX_IMAGE = 8 * 1024 * 1024;  // 8MB
    const MAX_VIDEO = 20 * 1024 * 1024; // 20MB

    const isImg = isImageContentType(ct);
    const isVid = isVideoContentType(ct);

    if (!isImg && !isVid) {
      return NextResponse.json(
        { error: `Unsupported media content-type: ${ct || "unknown"}` },
        { status: 400 }
      );
    }

    if (isImg && sizeBytes > MAX_IMAGE) {
      return NextResponse.json(
        { error: `Image too large (${Math.round(sizeBytes / 1024 / 1024)}MB). Keep under 8MB for now.` },
        { status: 400 }
      );
    }

    if (isVid && sizeBytes > MAX_VIDEO) {
      return NextResponse.json(
        { error: `Video too large (${Math.round(sizeBytes / 1024 / 1024)}MB). Keep under 20MB for now.` },
        { status: 400 }
      );
    }

    const kind: "image" | "video" = isVid ? "video" : "image";

    // registerUpload → upload → create post
    const reg = await registerUpload(token, authorUrn, kind);
    await uploadToLinkedIn(reg.uploadUrl, fetched.buf, ct);

    const out = await createUgcPost({
      token,
      authorUrn,
      text,
      media: { kind, asset: reg.asset },
    });

    return NextResponse.json({
      ok: true,
      mode: kind,
      postedId: out.postedId,
      asset: reg.asset,
      raw: out.raw,
    });
  } catch (err: any) {
    console.error("LinkedIn post error", err);
    return NextResponse.json(
      { error: err?.message || "Server error" },
      { status: 500 }
    );
  }
}
