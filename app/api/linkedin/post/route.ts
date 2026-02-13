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

type SuggestedImage = {
  url: string;
  title: string;
  pageUrl: string;
  licenseShortName?: string;
  licenseUrl?: string;
};

const LINKEDIN_TEXT_LIMIT = 3000;

// Conservative guardrails (not “official” limits; just to prevent obvious fails)
const MAX_IMAGE_MB = 10;
const MAX_VIDEO_MB = 150;

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
  return { headline, what, doThis, notes: notes || [] };
}

function respondFail(args: {
  error: string;
  userMessage: string;
  details?: any;
  status?: number;
  userHelp?: any;
  suggestedImages?: SuggestedImage[];
}) {
  return NextResponse.json(
    {
      ok: false,
      error: args.error,
      userMessage: args.userMessage,
      userHelp: args.userHelp,
      suggestedImages: args.suggestedImages || [],
      details: args.details,
      status: args.status,
    },
    { status: 200 }
  );
}

/** ---------------- Wikimedia “free example images” suggestions ---------------- */

function stripStopWords(words: string[]) {
  const stop = new Set([
    "the",
    "and",
    "or",
    "to",
    "of",
    "in",
    "a",
    "an",
    "for",
    "with",
    "on",
    "as",
    "is",
    "are",
    "was",
    "were",
    "be",
    "been",
    "this",
    "that",
    "it",
    "your",
    "you",
    "we",
    "they",
    "i",
    "our",
    "from",
    "at",
    "by",
    "not",
    "just",
    "into",
    "about",
    "can",
    "could",
    "should",
    "would",
  ]);
  return words.filter((w) => w.length >= 4 && !stop.has(w));
}

function guessSearchQueryFromText(text: string) {
  const cleaned = String(text || "")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .toLowerCase();

  const parts = cleaned.split(/\s+/).map((s) => s.trim()).filter(Boolean);
  const keywords = stripStopWords(parts).slice(0, 5);

  // fallback if text is too generic
  if (keywords.length === 0) return "wellbeing workplace team";
  return keywords.join(" ");
}

function commonsPageUrl(title: string) {
  const encoded = encodeURIComponent(title.replace(/ /g, "_"));
  return `https://commons.wikimedia.org/wiki/${encoded}`;
}

async function fetchCommonsSuggestions(query: string, limit = 3): Promise<SuggestedImage[]> {
  try {
    const q = (query || "").trim();
    if (!q) return [];

    const apiUrl =
      "https://commons.wikimedia.org/w/api.php" +
      `?action=query&format=json&origin=*` +
      `&generator=search&gsrsearch=${encodeURIComponent(q + " filetype:bitmap")}` +
      `&gsrlimit=${Math.max(1, Math.min(limit, 6))}` +
      `&gsrnamespace=6` +
      `&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=800`;

    const res = await fetch(apiUrl, { cache: "no-store" });
    const json: any = await res.json().catch(() => null);

    const pages = json?.query?.pages ? Object.values(json.query.pages) : [];
    const out: SuggestedImage[] = [];

    for (const p of pages) {
      const title = String((p as any)?.title || "").trim();
      const ii = (p as any)?.imageinfo?.[0];
      const url = String(ii?.thumburl || ii?.url || "").trim();
      if (!title || !url) continue;

      const meta = ii?.extmetadata || {};
      const licenseShortName = String(meta?.LicenseShortName?.value || "").replace(/<[^>]*>/g, "").trim();
      const licenseUrl = String(meta?.LicenseUrl?.value || "").replace(/<[^>]*>/g, "").trim();

      out.push({
        url,
        title,
        pageUrl: commonsPageUrl(title),
        licenseShortName: licenseShortName || undefined,
        licenseUrl: licenseUrl || undefined,
      });

      if (out.length >= limit) break;
    }

    return out.slice(0, limit);
  } catch {
    return [];
  }
}

/** ---------------- LinkedIn core helpers ---------------- */

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

async function uploadArrayBufferToLinkedIn(uploadUrl: string, arrayBuffer: ArrayBuffer, contentType: string) {
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

/** ---------------- MAIN ---------------- */

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
        userMessage: "We couldn’t find your organisation yet. Refresh and try again.",
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
        userMessage: `LinkedIn needs shorter text here. Your post is ${text.length}/${LINKEDIN_TEXT_LIMIT} characters — shorten it and try again.`,
        userHelp: toUserHelp(
          "Text is too long for LinkedIn",
          "LinkedIn can reject long posts when sent via the API.",
          [
            `Reduce to under ${LINKEDIN_TEXT_LIMIT} characters.`,
            "Keep the first line short and punchy.",
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

    // Suggestions based on the post text (used for image-related errors)
    const suggestionQuery = guessSearchQueryFromText(text);

    if (wantsVideo) {
      if (!isLikelyVideoUrl(videoUrl)) {
        return respondFail({
          error: "Invalid videoUrl",
          userMessage:
            "For LinkedIn video posts, the link must be a direct HTTPS video file (like .mp4). This one looks like a web page instead.",
          userHelp: toUserHelp(
            "What LinkedIn needs for video",
            "LinkedIn needs a direct file URL so we can upload it to LinkedIn.",
            [
              "Use a link that starts with https:// and ends in .mp4 (or .mov / .webm).",
              "Make sure the link is public (no login needed).",
              "Best option: re-upload the video using your uploader and use the new link.",
            ]
          ),
        });
      }

      const vidRes = await fetch(videoUrl, { cache: "no-store" });
      if (!vidRes.ok) {
        return respondFail({
          error: `Could not download videoUrl (HTTP ${vidRes.status})`,
          userMessage:
            "We couldn’t fetch that video link (it may be blocked or expired). Re-upload the video and try again.",
          userHelp: toUserHelp(
            "We couldn’t download the video",
            "The server hosting the video didn’t allow us to fetch it.",
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
          userMessage: `That video is too large for reliable posting right now (${sizeMb}MB). Try a smaller MP4 (under ~150MB).`,
          userHelp: toUserHelp(
            "Video file is too big",
            "Large videos often fail or take too long to upload to LinkedIn.",
            ["Export a smaller MP4 (lower resolution/bitrate).", "Aim for under ~150MB.", "Re-upload and try again."]
          ),
        });
      }

      const reg = await registerLinkedInUpload({ token, authorUrn: author.authorUrn, kind: "video" });
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
          userMessage: "LinkedIn couldn’t upload the video. Try a smaller MP4 or try again shortly.",
          details: up.details,
          status: up.status,
          userHelp: toUserHelp(
            "LinkedIn couldn’t upload the video",
            "This can happen with large files or temporary LinkedIn issues.",
            ["Try a smaller MP4.", "Try again in a few minutes.", "If it repeats, reconnect LinkedIn."]
          ),
        });
      }

      videoAssetUrn = reg.asset;
    }

    if (wantsImage) {
      // If the URL pattern is wrong, give “what LinkedIn needs” + suggestions.
      if (!isLikelyImageUrl(imageUrl)) {
        const suggestedImages = await fetchCommonsSuggestions(suggestionQuery, 3);

        return respondFail({
          error: "Invalid imageUrl",
          userMessage:
            "For LinkedIn image posts, you need a direct HTTPS image file link (JPG/PNG/WebP/GIF). This link doesn’t look like a direct image file.",
          userHelp: toUserHelp(
            "What LinkedIn needs for images",
            "LinkedIn needs a direct image file so we can upload it into LinkedIn (not a web page).",
            [
              "The link must start with https://",
              "It must end in .jpg / .png / .webp / .gif",
              "It must load without any login (public link)",
              "Best: use Scheduled → Search media to pick a Wikimedia Commons image (then check the licence), or re-upload your image into Root Health so it’s hosted reliably.",
            ],
            ["If you use a random website link, it often blocks downloads and LinkedIn rejects it."]
          ),
          suggestedImages,
        });
      }

      const imgRes = await fetch(imageUrl, { cache: "no-store" });
      if (!imgRes.ok) {
        const suggestedImages = await fetchCommonsSuggestions(suggestionQuery, 3);

        return respondFail({
          error: `Could not download imageUrl (HTTP ${imgRes.status})`,
          userMessage:
            "We couldn’t fetch that image link (the website may be blocking downloads). Try a different image link, or use Search media to pick a free-to-use image (check the licence).",
          userHelp: toUserHelp(
            "We couldn’t download the image",
            "Some sites block direct downloads, even if the link ends in .png/.jpg.",
            [
              "Try another image link from a stable host.",
              "Or: Scheduled → Search media (Wikimedia Commons) and pick an image there.",
              "If it’s your own image, re-upload it via your system so it’s publicly reachable.",
            ]
          ),
          suggestedImages,
        });
      }

      const contentType = (imgRes.headers.get("content-type") || "").toLowerCase();
      const arrayBuffer = await imgRes.arrayBuffer();

      // Critical diagnosis: link returns HTML/text not an image
      if (!contentType.startsWith("image/")) {
        const suggestedImages = await fetchCommonsSuggestions(suggestionQuery, 3);

        return respondFail({
          error: `imageUrl did not return an image (content-type: ${contentType || "unknown"})`,
          userMessage:
            "That link isn’t actually returning an image file to our server (it’s returning a web page or blocked response). LinkedIn can’t use it.",
          userHelp: toUserHelp(
            "This link isn’t an image file",
            "Even if the URL ends in .png/.jpg, some websites return HTML or block hotlinking.",
            [
              "Use an image link that loads publicly with no login.",
              "Try a stable image host, or re-upload your image into Root Health.",
              "Or: use Scheduled → Search media to pick a Wikimedia Commons image (check the licence).",
            ],
            ["A quick test: open the URL in a private/incognito window — it should show only the image."]
          ),
          details: { contentType, bytes: arrayBuffer.byteLength },
          suggestedImages,
        });
      }

      const sizeMb = mb(arrayBuffer.byteLength);
      if (sizeMb > MAX_IMAGE_MB) {
        const suggestedImages = await fetchCommonsSuggestions(suggestionQuery, 3);

        return respondFail({
          error: `Image too large (${sizeMb}MB)`,
          userMessage: `That image is very large (${sizeMb}MB). Try a smaller JPG/PNG (under ~10MB) or pick a different image.`,
          userHelp: toUserHelp(
            "Image file is too big",
            "Large images can fail during upload to LinkedIn.",
            ["Resize/compress the image.", "Aim for under ~10MB.", "Try again."]
          ),
          suggestedImages,
        });
      }

      const reg = await registerLinkedInUpload({ token, authorUrn: author.authorUrn, kind: "image" });
      if (!reg.ok) {
        const suggestedImages = await fetchCommonsSuggestions(suggestionQuery, 3);

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
          suggestedImages,
        });
      }

      const up = await uploadArrayBufferToLinkedIn(reg.uploadUrl, arrayBuffer, contentType || "image/jpeg");
      if (!up.ok) {
        const suggestedImages = await fetchCommonsSuggestions(suggestionQuery, 3);

        return respondFail({
          error: up.error,
          userMessage: "LinkedIn couldn’t upload the image. Try a smaller image or try again shortly.",
          details: up.details,
          status: up.status,
          userHelp: toUserHelp(
            "LinkedIn couldn’t upload the image",
            "This can happen with large images or temporary LinkedIn issues.",
            ["Try a smaller image.", "Try again in a few minutes.", "If it repeats, reconnect LinkedIn."]
          ),
          suggestedImages,
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
          "LinkedIn didn’t publish this because it’s too similar to a recent post. Change the first line (or the final call-to-action) and try again.",
        details: retry.details || post.details,
        status: retry.status || post.status,
        userHelp: toUserHelp(
          "LinkedIn thinks this is a duplicate",
          "LinkedIn blocks posts that look too similar to something you posted recently.",
          ["Change the first line (opening hook).", "Change the last line (CTA).", "Try again."]
        ),
      });
    }

    return respondFail({
      error: post.error,
      userMessage:
        "LinkedIn couldn’t publish this post. If you used media, try text-only first. If it’s long, shorten it and try again.",
      details: post.details,
      status: post.status,
      userHelp: toUserHelp(
        "LinkedIn couldn’t publish this post",
        "LinkedIn rejected the request. This is usually text length, media upload, or a temporary LinkedIn issue.",
        [
          "Try text-only to confirm the message is OK.",
          `Keep text under ${LINKEDIN_TEXT_LIMIT} characters.`,
          "If using an image: use a direct HTTPS image file URL that loads publicly.",
          "Try again in a few minutes if it looks like a temporary LinkedIn issue.",
        ]
      ),
    });
  } catch (err: any) {
    console.error("[linkedin/post] error", err);
    return respondFail({
      error: err?.message || "Server error",
      userMessage: "Something went wrong sending to LinkedIn. Please try again.",
    });
  }
}
