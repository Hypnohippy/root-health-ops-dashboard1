// app/api/linkedin/post/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

export const runtime = "nodejs";

type SocialAccountRow = {
  id: string;
  organisation_id: string;
  platform: string;
  page_id: string | null;
  page_name: string | null;
  is_active: boolean | null;
  page_access_token: string | null;
  token_expires_at: string | null;
};

function isHttps(url: string) {
  return /^https:\/\/.+/i.test((url || "").trim());
}

function isLikelyImageUrl(url: string) {
  const u = (url || "").trim();
  if (!u) return false;
  if (!isHttps(u)) return false;
  return /\.(jpg|jpeg|png|webp|gif)(\?.*)?$/i.test(u);
}

function isLikelyVideoUrl(url: string) {
  const u = (url || "").trim();
  if (!u) return false;
  if (!isHttps(u)) return false;
  const low = u.toLowerCase();
  return (
    /\.(mp4|mov|webm)(\?.*)?$/i.test(low) ||
    low.includes(".mp4") ||
    low.includes(".mov") ||
    low.includes(".webm")
  );
}

async function loadLinkedInAccount(organisationId: string): Promise<SocialAccountRow | null> {
  const { data, error } = await supabaseAdmin
    .from("social_accounts")
    .select("id, organisation_id, platform, page_id, page_name, is_active, page_access_token, token_expires_at")
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
  const userRes = await fetch("https://api.linkedin.com/v2/userinfo", {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });

  const userInfo: any = await userRes.json().catch(() => null);

  if (!userRes.ok) {
    return {
      ok: false as const,
      error: userInfo?.message || userInfo?.error_description || "Failed to fetch LinkedIn user info",
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

async function registerLinkedInUpload(args: { token: string; authorUrn: string; kind: "image" | "video" }) {
  const recipe =
    args.kind === "video"
      ? "urn:li:digitalmediaRecipe:feedshare-video"
      : "urn:li:digitalmediaRecipe:feedshare-image";

  const registerBody = {
    registerUploadRequest: {
      recipes: [recipe],
      owner: args.authorUrn,
      serviceRelationships: [
        { relationshipType: "OWNER", identifier: "urn:li:userGeneratedContent" },
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
      error: json?.message || `Failed to register LinkedIn ${args.kind} upload`,
      details: json,
      status: res.status,
    };
  }

  const value = json?.value;
  const uploadMechanism = value?.uploadMechanism?.["com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"];
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

  return { ok: true as const, uploadUrl, asset, status: 200 };
}

async function uploadArrayBufferToLinkedIn(uploadUrl: string, arrayBuffer: ArrayBuffer, contentType: string) {
  const res = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": contentType || "application/octet-stream" },
    body: arrayBuffer,
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return { ok: false as const, error: "Failed uploading bytes to LinkedIn", details: text, status: res.status };
  }

  return { ok: true as const, status: res.status };
}

function looksLikeDuplicatePost(details: any, status?: number) {
  const msg = String(details?.message || details?.error || details?.error_description || "")
    .toLowerCase()
    .trim();

  const inputErrors = details?.errorDetails?.inputErrors || details?.details?.errorDetails?.inputErrors;

  const hasCode =
    Array.isArray(inputErrors) &&
    inputErrors.some((e: any) => String(e?.code || "").toUpperCase() === "DUPLICATE_POST");

  const hasMsg =
    msg.includes("duplicate post") ||
    msg.includes("content is a duplicate") ||
    msg.includes("duplicate of urn:li:share:");

  return (status === 422 || status === 409) && (hasCode || hasMsg);
}

function antiDuplicateVariation(original: string) {
  const t = (original || "").trim();
  if (!t) return t;

  const lines = t.split("\n");
  const firstLine = (lines[0] || "").trim();

  const altHooks = [
    "A quick thought for today:",
    "One thing I’ve noticed lately:",
    "A small reminder that helps:",
    "Worth saying out loud:",
  ];

  const hook = altHooks[(firstLine.length + t.length) % altHooks.length];
  const newFirstLine = firstLine ? `${hook} ${firstLine}` : hook;
  const rest = lines.slice(1).join("\n").trim();
  const freshness = "\n\n(Sharing this again with a slightly different angle.)";

  const composed = rest ? `${newFirstLine}\n${rest}${freshness}` : `${newFirstLine}${freshness}`;
  return composed.trim();
}

async function createLinkedInUgcPost(args: {
  token: string;
  authorUrn: string;
  text: string;
  imageAssetUrn?: string;
  videoAssetUrn?: string;
}) {
  const hasVideo = !!args.videoAssetUrn;
  const hasImage = !!args.imageAssetUrn && !hasVideo;

  const postBody: any = {
    author: args.authorUrn,
    lifecycleState: "PUBLISHED",
    specificContent: {
      "com.linkedin.ugc.ShareContent": {
        shareCommentary: { text: args.text },
        shareMediaCategory: hasVideo ? "VIDEO" : hasImage ? "IMAGE" : "NONE",
      },
    },
    visibility: { "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" },
  };

  if (hasVideo) {
    postBody.specificContent["com.linkedin.ugc.ShareContent"].media = [
      { status: "READY", media: args.videoAssetUrn, title: { text: "Video" } },
    ];
  } else if (hasImage) {
    postBody.specificContent["com.linkedin.ugc.ShareContent"].media = [
      { status: "READY", media: args.imageAssetUrn, title: { text: "Image" } },
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

  const json: any = await res.json().catch(() => null);
  const headerId = res.headers.get("x-restli-id") || res.headers.get("x-linkedin-id");
  const postedId = json?.id || headerId || null;

  if (!res.ok) {
    return { ok: false as const, error: json?.message || "Failed to post on LinkedIn", details: json, status: res.status };
  }

  return { ok: true as const, postedId, details: json, status: res.status };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));

    const text = String(body?.text ?? body?.message ?? "").trim();
    const organisationId = String(body?.organisationId ?? "").trim();
    const imageUrl = String(body?.imageUrl ?? "").trim();
    const videoUrl = String(body?.videoUrl ?? "").trim();

    if (!organisationId) {
      return NextResponse.json(
        { ok: false, error: "Missing organisationId", userMessage: "We couldn’t find your organisation yet. Refresh and try again." },
        { status: 200 }
      );
    }

    if (!text) {
      return NextResponse.json(
        { ok: false, error: "Missing post text", userMessage: "Your post is empty. Add a message and try again." },
        { status: 200 }
      );
    }

    const li = await loadLinkedInAccount(organisationId);
    const token = li?.page_access_token || null;

    if (!token) {
      return NextResponse.json(
        {
          ok: false,
          error: "LinkedIn is not connected (missing access token)",
          userMessage: "LinkedIn is not connected (missing access token). Please reconnect LinkedIn on the Connect page.",
        },
        { status: 200 }
      );
    }

    const author = await getLinkedInAuthorUrn(token);
    if (!author.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: author.error,
          userMessage: "LinkedIn connection looks invalid. Please reconnect LinkedIn on the Connect page.",
          details: author.details,
          status: author.status,
        },
        { status: 200 }
      );
    }

    // Prefer video if both provided
    const wantsVideo = !!videoUrl;
    const wantsImage = !!imageUrl && !wantsVideo;

    let imageAssetUrn: string | undefined;
    let videoAssetUrn: string | undefined;

    if (wantsVideo) {
      if (!isLikelyVideoUrl(videoUrl)) {
        return NextResponse.json(
          {
            ok: false,
            error: "videoUrl must be a direct https video file link ending .mp4/.mov/.webm (not a webpage).",
            userMessage: "That video link doesn’t look like a direct MP4/MOV/WEBM file. Upload via the uploader and try again.",
          },
          { status: 200 }
        );
      }

      const vidRes = await fetch(videoUrl, { cache: "no-store" });
      if (!vidRes.ok) {
        return NextResponse.json(
          { ok: false, error: `Could not download videoUrl (HTTP ${vidRes.status})`, userMessage: "We couldn’t fetch that video link. Try re-uploading it and try again." },
          { status: 200 }
        );
      }

      const contentType = vidRes.headers.get("content-type") || "video/mp4";
      const arrayBuffer = await vidRes.arrayBuffer();

      const sizeMb = Math.round((arrayBuffer.byteLength / (1024 * 1024)) * 10) / 10;
      if (sizeMb > 150) {
        return NextResponse.json(
          { ok: false, error: `Video is too large for this simple upload flow (${sizeMb}MB).`, userMessage: "That video is quite large. Try a smaller MP4 (under ~150MB) for now." },
          { status: 200 }
        );
      }

      const reg = await registerLinkedInUpload({ token, authorUrn: author.authorUrn, kind: "video" });
      if (!reg.ok) {
        return NextResponse.json(
          { ok: false, error: reg.error, userMessage: "LinkedIn wouldn’t accept the video upload setup. Try again in a minute.", details: reg.details, status: reg.status },
          { status: 200 }
        );
      }

      const up = await uploadArrayBufferToLinkedIn(reg.uploadUrl, arrayBuffer, contentType);
      if (!up.ok) {
        return NextResponse.json(
          { ok: false, error: up.error, userMessage: "LinkedIn couldn’t upload the video. Try a smaller MP4 or try again shortly.", details: up.details, status: up.status },
          { status: 200 }
        );
      }

      videoAssetUrn = reg.asset;
    }

    if (wantsImage) {
      if (!isLikelyImageUrl(imageUrl)) {
        return NextResponse.json(
          {
            ok: false,
            error: "imageUrl must be a direct https image link ending .jpg/.png/.webp/.gif (not a webpage).",
            userMessage: "That image link doesn’t look like a direct image file. Pick a JPG/PNG/WebP link and try again.",
          },
          { status: 200 }
        );
      }

      const imgRes = await fetch(imageUrl, { cache: "no-store" });
      if (!imgRes.ok) {
        return NextResponse.json(
          { ok: false, error: `Could not download imageUrl (HTTP ${imgRes.status})`, userMessage: "We couldn’t fetch that image link. Try a different image or re-host it via Brainstorm." },
          { status: 200 }
        );
      }

      const contentType = imgRes.headers.get("content-type") || "image/jpeg";
      const arrayBuffer = await imgRes.arrayBuffer();

      const reg = await registerLinkedInUpload({ token, authorUrn: author.authorUrn, kind: "image" });
      if (!reg.ok) {
        return NextResponse.json(
          { ok: false, error: reg.error, userMessage: "LinkedIn wouldn’t accept the image upload setup. Try again in a minute.", details: reg.details, status: reg.status },
          { status: 200 }
        );
      }

      const up = await uploadArrayBufferToLinkedIn(reg.uploadUrl, arrayBuffer, contentType);
      if (!up.ok) {
        return NextResponse.json(
          { ok: false, error: up.error, userMessage: "LinkedIn couldn’t upload the image. Try a smaller JPG/PNG or try again shortly.", details: up.details, status: up.status },
          { status: 200 }
        );
      }

      imageAssetUrn = reg.asset;
    }

    const post = await createLinkedInUgcPost({
      token,
      authorUrn: author.authorUrn,
      text,
      imageAssetUrn,
      videoAssetUrn,
    });

    if (post.ok) {
      return NextResponse.json({
        ok: true,
        postedId: post.postedId,
        mode: videoAssetUrn ? "video" : imageAssetUrn ? "image" : "text",
      });
    }

    const isDup = looksLikeDuplicatePost(post.details, post.status);
    if (isDup) {
      const altText = antiDuplicateVariation(text);
      const retry = await createLinkedInUgcPost({
        token,
        authorUrn: author.authorUrn,
        text: altText,
        imageAssetUrn,
        videoAssetUrn,
      });

      if (retry.ok) {
        return NextResponse.json({
          ok: true,
          postedId: retry.postedId,
          mode: videoAssetUrn ? "video" : imageAssetUrn ? "image" : "text",
          note: "LinkedIn flagged the first attempt as a duplicate — we reposted with a small variation.",
        });
      }

      return NextResponse.json(
        {
          ok: false,
          error: retry.error || post.error,
          userMessage: "LinkedIn didn’t publish this because it’s too similar to a recent post. Change the first line or CTA and try again.",
          details: retry.details || post.details,
          status: retry.status || post.status,
        },
        { status: 200 }
      );
    }

    return NextResponse.json(
      {
        ok: false,
        error: post.error,
        userMessage: "LinkedIn couldn’t publish this post. Try again in a minute, or shorten/edit the text.",
        details: post.details,
        status: post.status,
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("[linkedin/post] error", err);
    return NextResponse.json(
      { ok: false, error: err?.message || "Server error", userMessage: "Something went wrong sending to LinkedIn. Please try again." },
      { status: 200 }
    );
  }
}
