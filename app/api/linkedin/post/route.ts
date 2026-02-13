// app/api/linkedin/post/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseService } from "../../../../lib/supabaseService";

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

const LINKEDIN_TEXT_LIMIT = 3000;

// Conservative guardrails (not “official” limits; just to prevent obvious fails)
const MAX_IMAGE_MB = 10; // keep images small-ish
const MAX_VIDEO_MB = 150; // your existing guard

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
  return (
    /\.(mp4|mov|webm)(\?.*)?$/i.test(u) ||
    u.toLowerCase().includes(".mp4") ||
    u.toLowerCase().includes(".mov") ||
    u.toLowerCase().includes(".webm")
  );
}

function mb(bytes: number) {
  return Math.round((bytes / (1024 * 1024)) * 10) / 10;
}

function toUserHelp(headline: string, what: string, doThis: string[], notes?: string[]) {
  return {
    headline,
    what,
    doThis,
    notes: notes || [],
  };
}

function respondFail(args: {
  error: string;
  userMessage: string;
  details?: any;
  status?: number;
  userHelp?: any;
}) {
  return NextResponse.json(
    {
      ok: false,
      error: args.error,
      userMessage: args.userMessage,
      userHelp: args.userHelp,
      details: args.details,
      status: args.status,
    },
    { status: 200 }
  );
}

async function loadLinkedInAccount(organisationId: string): Promise<SocialAccountRow | null> {
  const { data, error } = await supabaseService
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

async function registerLinkedInUpload(args: {
  token: string;
  authorUrn: string;
  kind: "image" | "video";
}) {
  const recipe =
    args.kind === "video"
      ? "urn:li:digitalmediaRecipe:feedshare-video"
      : "urn:li:digitalmediaRecipe:feedshare-image";

  const registerBody = {
    registerUploadRequest: {
      recipes: [recipe],
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
      error: json?.message || `Failed to register LinkedIn ${args.kind} upload`,
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

  return { ok: true as const, uploadUrl, asset, status: 200 };
}

async function uploadArrayBufferToLinkedIn(
  uploadUrl: string,
  arrayBuffer: ArrayBuffer,
  contentType: string
) {
  const res = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": contentType || "application/octet-stream" },
    body: arrayBuffer,
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return {
      ok: false as const,
      error: "Failed uploading bytes to LinkedIn",
      details: text,
      status: res.status,
    };
  }

  return { ok: true as const, status: res.status };
}

function looksLikeDuplicatePost(details: any, status?: number) {
  const msg = String(details?.message || details?.error || details?.error_description || "")
    .toLowerCase()
    .trim();

  const inputErrors =
    details?.errorDetails?.inputErrors || details?.details?.errorDetails?.inputErrors;

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
    visibility: {
      "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC",
    },
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
    return {
      ok: false as const,
      error: json?.message || "Failed to post on LinkedIn",
      details: json,
      status: res.status,
    };
  }

  return { ok: true as const, postedId, details: json, status: res.status };
}

function plainLinkedInPostFailureHelp(text: string, hasImage: boolean, hasVideo: boolean) {
  const tooLong = text.length > LINKEDIN_TEXT_LIMIT;

  const doThis: string[] = [];
  if (tooLong) doThis.push(`Shorten the text to under ${LINKEDIN_TEXT_LIMIT} characters.`);
  if (hasImage) doThis.push("Try removing the image and posting as text-only to confirm the message is OK.");
  if (hasVideo) doThis.push("Try a smaller MP4 video and re-upload it.");
  doThis.push("If it still fails, try again in a few minutes — LinkedIn sometimes rejects temporary uploads.");

  return toUserHelp(
    "LinkedIn couldn’t publish this post",
    "LinkedIn rejected the request. This usually happens because the post is too long, the media couldn’t be uploaded, or LinkedIn is temporarily fussy.",
    doThis
  );
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));

    const text = String(body?.text ?? body?.message ?? "").trim();
    const organisationId = String(body?.organisationId ?? "").trim();

    const imageUrl = String(body?.imageUrl ?? "").trim();
    const videoUrl = String(body?.videoUrl ?? "").trim();

    if (!organisationId) {
      return respondFail({
        error: "Missing organisationId",
        userMessage: "We couldn’t find your organisation yet. Refresh the page and try again.",
      });
    }

    if (!text) {
      return respondFail({
        error: "Missing post text",
        userMessage: "Your post is empty. Add a message and try again.",
      });
    }

    if (text.length > LINKEDIN_TEXT_LIMIT) {
      return respondFail({
        error: "Post text too long",
        userMessage: `This LinkedIn post is too long (${text.length}/${LINKEDIN_TEXT_LIMIT}). Shorten it and try again.`,
        userHelp: toUserHelp(
          "Text is too long",
          "LinkedIn rejects very long posts through the API.",
          [
            `Shorten the post to under ${LINKEDIN_TEXT_LIMIT} characters.`,
            "Keep the first line punchy — that’s what people see in the feed.",
          ]
        ),
      });
    }

    const li = await loadLinkedInAccount(organisationId);
    const token = li?.page_access_token || null;

    if (!token) {
      return respondFail({
        error: "LinkedIn not connected",
        userMessage: "LinkedIn isn’t connected yet. Go to Connect → LinkedIn → Connect.",
      });
    }

    const author = await getLinkedInAuthorUrn(token);
    if (!author.ok) {
      return respondFail({
        error: author.error,
        userMessage: "LinkedIn connection looks invalid. Please reconnect LinkedIn on the Connect page.",
        details: author.details,
        status: author.status,
        userHelp: toUserHelp(
          "LinkedIn needs reconnecting",
          "Your LinkedIn login token looks expired or invalid.",
          ["Go to Connect → LinkedIn → Reconnect.", "Then try posting again."]
        ),
      });
    }

    // Prefer video if both provided
    const wantsVideo = !!videoUrl;
    const wantsImage = !!imageUrl && !wantsVideo;

    let imageAssetUrn: string | undefined = undefined;
    let videoAssetUrn: string | undefined = undefined;

    if (wantsVideo) {
      if (!isLikelyVideoUrl(videoUrl)) {
        return respondFail({
          error: "Invalid videoUrl",
          userMessage:
            "That video link doesn’t look like a direct video file. Please use a direct MP4/MOV/WEBM link (not a web page).",
          userHelp: toUserHelp(
            "Video link isn’t a direct file",
            "LinkedIn needs an actual video file URL (like .mp4). Many links are web pages, not the file itself.",
            ["Re-upload the video using your uploader.", "Use the generated MP4 link and try again."]
          ),
        });
      }

      const vidRes = await fetch(videoUrl, { cache: "no-store" });
      if (!vidRes.ok) {
        return respondFail({
          error: `Could not download videoUrl (HTTP ${vidRes.status})`,
          userMessage:
            "We couldn’t fetch that video link. It may be blocked or expired. Try re-uploading the video and try again.",
          userHelp: toUserHelp(
            "We couldn’t download the video",
            "The server hosting the video didn’t let us fetch it.",
            ["Re-upload the video.", "Make sure the link is public and HTTPS.", "Try again."]
          ),
        });
      }

      const contentType = vidRes.headers.get("content-type") || "video/mp4";
      const arrayBuffer = await vidRes.arrayBuffer();

      const sizeMb = mb(arrayBuffer.byteLength);
      if (sizeMb > MAX_VIDEO_MB) {
        return respondFail({
          error: `Video too large (${sizeMb}MB)`,
          userMessage:
            `That video is quite large (${sizeMb}MB). Try a smaller MP4 and try again.`,
          userHelp: toUserHelp(
            "Video file is too big",
            "Large videos often fail or take too long to upload to LinkedIn.",
            ["Export a smaller MP4 (lower resolution/bitrate).", "Aim for under ~150MB.", "Re-upload and try again."]
          ),
        });
      }

      const reg = await registerLinkedInUpload({
        token,
        authorUrn: author.authorUrn,
        kind: "video",
      });

      if (!reg.ok) {
        return respondFail({
          error: reg.error,
          userMessage: "LinkedIn wouldn’t accept the video upload setup. Try again in a minute.",
          details: reg.details,
          status: reg.status,
          userHelp: toUserHelp(
            "LinkedIn video setup failed",
            "LinkedIn refused the first step of the upload process.",
            ["Try again in 1–2 minutes.", "If it keeps happening, reconnect LinkedIn and try again."]
          ),
        });
      }

      const up = await uploadArrayBufferToLinkedIn(reg.uploadUrl, arrayBuffer, contentType);
      if (!up.ok) {
        return respondFail({
          error: up.error,
          userMessage:
            "LinkedIn couldn’t upload the video. Try a smaller MP4 or try again shortly.",
          details: up.details,
          status: up.status,
          userHelp: toUserHelp(
            "LinkedIn couldn’t upload the video",
            "The upload step failed. This can happen with large files or temporary LinkedIn issues.",
            ["Try a smaller MP4.", "Try again in a few minutes.", "If it repeats, reconnect LinkedIn."]
          ),
        });
      }

      videoAssetUrn = reg.asset;
    }

    if (wantsImage) {
      if (!isLikelyImageUrl(imageUrl)) {
        return respondFail({
          error: "Invalid imageUrl",
          userMessage:
            "That image link doesn’t look like a direct image file. Use a direct JPG/PNG/WebP/GIF link and try again.",
          userHelp: toUserHelp(
            "Image link isn’t a direct file",
            "Some image links are actually web pages (or don’t end in .jpg/.png). LinkedIn needs a direct image file.",
            [
              "Use a URL that ends in .jpg or .png.",
              "Make sure it’s public and starts with https://",
              "If in doubt, use your media picker or re-host the image somewhere stable.",
            ]
          ),
        });
      }

      const imgRes = await fetch(imageUrl, { cache: "no-store" });
      if (!imgRes.ok) {
        return respondFail({
          error: `Could not download imageUrl (HTTP ${imgRes.status})`,
          userMessage:
            "We couldn’t fetch that image link. It may be blocked. Try a different image or re-host it and try again.",
          userHelp: toUserHelp(
            "We couldn’t download the image",
            "The website hosting the image didn’t allow us to fetch it.",
            ["Try a different image.", "Use a more stable image host.", "Make sure the link is public + HTTPS."]
          ),
        });
      }

      const contentType = (imgRes.headers.get("content-type") || "").toLowerCase();
      const arrayBuffer = await imgRes.arrayBuffer();

      // Big one: lots of ".png" URLs return HTML (blocked/hotlink), not an actual image
      if (!contentType.startsWith("image/")) {
        const hint =
          contentType.includes("text/html") || contentType.includes("text/plain")
            ? "This link is probably showing a web page (or blocking hotlinking), not the image file itself."
            : "This link isn’t returning an image file.";

        return respondFail({
          error: `imageUrl did not return an image (content-type: ${contentType || "unknown"})`,
          userMessage:
            `LinkedIn couldn’t use that image link because it doesn’t return an image file. ${hint}`,
          details: { contentType, bytes: arrayBuffer.byteLength },
          userHelp: toUserHelp(
            "Image link isn’t actually an image",
            "Even though the URL ends in .png/.jpg, the host might block downloads and return a web page instead.",
            [
              "Try a different image link (ideally from a stable host).",
              "Open the image URL in a browser: it should show ONLY the image (no page around it).",
              "If this keeps happening, re-upload the image via your system so it’s hosted reliably.",
            ],
            ["This is very common with charity/WordPress sites and protected media URLs."]
          ),
        });
      }

      const sizeMb = mb(arrayBuffer.byteLength);
      if (sizeMb > MAX_IMAGE_MB) {
        return respondFail({
          error: `Image too large (${sizeMb}MB)`,
          userMessage:
            `That image is quite large (${sizeMb}MB). Try a smaller JPG/PNG and try again.`,
          userHelp: toUserHelp(
            "Image file is too big",
            "Big images sometimes fail to upload to LinkedIn.",
            ["Use a smaller image (resize/compress).", "Aim for under ~10MB.", "Try again."]
          ),
        });
      }

      const reg = await registerLinkedInUpload({
        token,
        authorUrn: author.authorUrn,
        kind: "image",
      });

      if (!reg.ok) {
        return respondFail({
          error: reg.error,
          userMessage: "LinkedIn wouldn’t accept the image upload setup. Try again in a minute.",
          details: reg.details,
          status: reg.status,
          userHelp: toUserHelp(
            "LinkedIn image setup failed",
            "LinkedIn refused the first step of the image upload.",
            ["Try again in 1–2 minutes.", "If it keeps happening, reconnect LinkedIn and try again."]
          ),
        });
      }

      const up = await uploadArrayBufferToLinkedIn(reg.uploadUrl, arrayBuffer, contentType || "image/jpeg");
      if (!up.ok) {
        return respondFail({
          error: up.error,
          userMessage:
            "LinkedIn couldn’t upload the image. Try a smaller JPG/PNG or try again shortly.",
          details: up.details,
          status: up.status,
          userHelp: toUserHelp(
            "LinkedIn couldn’t upload the image",
            "The upload step failed. This can happen with large files or temporary LinkedIn issues.",
            ["Try a smaller image.", "Try again in a few minutes.", "If it repeats, reconnect LinkedIn."]
          ),
        });
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

      return respondFail({
        error: retry.error || post.error,
        userMessage:
          "LinkedIn didn’t publish this because it’s too similar to a recent post. Change the first line (or the final CTA) and try again.",
        details: retry.details || post.details,
        status: retry.status || post.status,
        userHelp: toUserHelp(
          "LinkedIn thinks this is a duplicate",
          "LinkedIn blocks posts that look too similar to something you posted recently.",
          [
            "Change the first line (opening hook).",
            "Change the last line (CTA).",
            "Try again.",
          ]
        ),
      });
    }

    return respondFail({
      error: post.error,
      userMessage:
        "LinkedIn couldn’t publish this post. If you used media, try text-only first. If it’s long, shorten it and try again.",
      details: post.details,
      status: post.status,
      userHelp: plainLinkedInPostFailureHelp(text, !!imageAssetUrn, !!videoAssetUrn),
    });
  } catch (err: any) {
    console.error("[linkedin/post] error", err);
    return respondFail({
      error: err?.message || "Server error",
      userMessage: "Something went wrong sending to LinkedIn. Please try again.",
    });
  }
}
