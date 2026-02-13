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

type UserHelp = {
  headline?: string;
  what?: string;
  doThis?: string[];
  notes?: string[];
};

type SuggestedImage = {
  url: string;
  title: string;
  pageUrl: string;
  licenseShortName?: string;
  licenseUrl?: string;
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
  return (
    /\.(mp4|mov|webm)(\?.*)?$/i.test(u) ||
    u.toLowerCase().includes(".mp4") ||
    u.toLowerCase().includes(".mov") ||
    u.toLowerCase().includes(".webm")
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

  return { ok: true as const, authorUrn: `urn:li:person:${sub}`, status: 200 };
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

async function searchCommonsImages(query: string, limit = 6): Promise<SuggestedImage[]> {
  const q = (query || "").trim();
  if (!q) return [];

  const apiUrl =
    "https://commons.wikimedia.org/w/api.php" +
    `?action=query&format=json&origin=*` +
    `&generator=search&gsrsearch=${encodeURIComponent(q + " filetype:bitmap")}` +
    `&gsrlimit=${Math.max(1, Math.min(limit, 10))}` +
    `&gsrnamespace=6` +
    `&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=900`;

  const res = await fetch(apiUrl, { cache: "no-store" });
  const json: any = await res.json().catch(() => null);

  const pages = json?.query?.pages ? Object.values(json.query.pages) : [];
  const out: SuggestedImage[] = [];

  for (const p of pages) {
    const title = String((p as any)?.title || "").trim();
    const ii = (p as any)?.imageinfo?.[0];
    const url = String(ii?.thumburl || ii?.url || "").trim();
    if (!title || !url) continue;

    const encoded = encodeURIComponent(title.replace(/ /g, "_"));
    const pageUrl = `https://commons.wikimedia.org/wiki/${encoded}`;

    const meta = ii?.extmetadata || {};
    const licenseShortName = meta?.LicenseShortName?.value ? String(meta.LicenseShortName.value) : undefined;
    const licenseUrl = meta?.LicenseUrl?.value ? String(meta.LicenseUrl.value) : undefined;

    out.push({ url, title, pageUrl, licenseShortName, licenseUrl });
  }

  return out.slice(0, limit);
}

function helpForInvalidImageUrl(imageUrl: string): UserHelp {
  return {
    headline: "LinkedIn can’t use that image link",
    what:
      "LinkedIn needs a direct image file that our server can download (not a webpage link, not a blocked CDN link).",
    doThis: [
      "Use an https link that ends in .jpg, .jpeg, .png, .webp, or .gif",
      "Make sure the link opens the image directly in a browser (not a page with the image inside it)",
      "If your image is from a website, re-host it somewhere that provides a direct image file URL",
      "Or use one of the suggested free-use images below (check the licence first)",
    ],
    notes: [
      `Your current URL: ${imageUrl || "—"}`,
      "Always check copyright/licence before posting publicly.",
    ],
  };
}

function helpForInvalidVideoUrl(videoUrl: string): UserHelp {
  return {
    headline: "LinkedIn can’t use that video link",
    what:
      "LinkedIn needs a direct video file link that our server can download (not a webpage).",
    doThis: [
      "Use an https link that ends in .mp4, .mov, or .webm",
      "Try re-uploading the video via your uploader so it becomes a direct file URL",
      "Keep the video size reasonable (very large videos can fail uploads)",
    ],
    notes: [`Your current URL: ${videoUrl || "—"}`],
  };
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
        {
          ok: false,
          error: "Missing organisationId",
          userMessage: "We couldn’t find your organisation yet. Refresh and try again.",
          userHelp: { headline: "Organisation missing", doThis: ["Refresh the page and try again."] },
        },
        { status: 200 }
      );
    }

    if (!text) {
      return NextResponse.json(
        {
          ok: false,
          error: "Missing post text",
          userMessage: "Your post is empty. Add a message and try again.",
          userHelp: { headline: "Add a message", doThis: ["Type your post text, then try again."] },
        },
        { status: 200 }
      );
    }

    const li = await loadLinkedInAccount(organisationId);
    const token = li?.page_access_token || null;

    if (!token) {
      return NextResponse.json(
        {
          ok: false,
          error: "LinkedIn not connected",
          userMessage: "LinkedIn isn’t connected yet. Go to Connect → LinkedIn → Connect.",
          userHelp: {
            headline: "Connect LinkedIn",
            doThis: ["Go to Connect", "Click LinkedIn", "Complete the connect flow", "Then try posting again"],
          },
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
          userHelp: {
            headline: "Reconnect LinkedIn",
            doThis: ["Go to Connect → LinkedIn", "Disconnect (if shown) then connect again", "Retry your post"],
          },
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

    // VIDEO FLOW
    if (wantsVideo) {
      if (!isLikelyVideoUrl(videoUrl)) {
        return NextResponse.json(
          {
            ok: false,
            error: "videoUrl must be a direct https video file link ending .mp4/.mov/.webm (not a webpage).",
            userMessage: "That video link isn’t a direct video file. Use an MP4/MOV/WEBM file link (https) and try again.",
            userHelp: helpForInvalidVideoUrl(videoUrl),
          },
          { status: 200 }
        );
      }

      const vidRes = await fetch(videoUrl, { cache: "no-store" });
      if (!vidRes.ok) {
        return NextResponse.json(
          {
            ok: false,
            error: `Could not download videoUrl (HTTP ${vidRes.status})`,
            userMessage: "We couldn’t fetch that video link. Try re-uploading it and try again.",
            userHelp: {
              headline: "We can’t download that video",
              what: "The link might be blocked, expired, or not publicly accessible.",
              doThis: ["Try a different video URL", "Or re-upload the video so it becomes a public direct file link"],
              notes: [`HTTP status: ${vidRes.status}`],
            },
          },
          { status: 200 }
        );
      }

      const contentType = vidRes.headers.get("content-type") || "video/mp4";
      const arrayBuffer = await vidRes.arrayBuffer();

      const sizeMb = Math.round((arrayBuffer.byteLength / (1024 * 1024)) * 10) / 10;
      if (sizeMb > 150) {
        return NextResponse.json(
          {
            ok: false,
            error: `Video is too large for this simple upload flow (${sizeMb}MB).`,
            userMessage: "That video is quite large. Try a smaller MP4 (under ~150MB) for now.",
            userHelp: {
              headline: "Video too large",
              doThis: ["Export/compress the video smaller", "Aim for under ~150MB", "Then try again"],
              notes: [`Size: ${sizeMb}MB`],
            },
          },
          { status: 200 }
        );
      }

      const reg = await registerLinkedInUpload({ token, authorUrn: author.authorUrn, kind: "video" });
      if (!reg.ok) {
        return NextResponse.json(
          {
            ok: false,
            error: reg.error,
            userMessage: "LinkedIn wouldn’t accept the video upload setup. Try again in a minute.",
            userHelp: {
              headline: "LinkedIn upload setup failed",
              doThis: ["Wait 30 seconds and try again", "If it keeps failing, reconnect LinkedIn on the Connect page"],
            },
            details: reg.details,
            status: reg.status,
          },
          { status: 200 }
        );
      }

      const up = await uploadArrayBufferToLinkedIn(reg.uploadUrl, arrayBuffer, contentType);
      if (!up.ok) {
        return NextResponse.json(
          {
            ok: false,
            error: up.error,
            userMessage: "LinkedIn couldn’t upload the video. Try a smaller MP4 or try again shortly.",
            userHelp: {
              headline: "Video upload failed",
              doThis: ["Try a smaller MP4", "Try again in a minute", "If it persists, reconnect LinkedIn"],
            },
            details: up.details,
            status: up.status,
          },
          { status: 200 }
        );
      }

      videoAssetUrn = reg.asset;
    }

    // IMAGE FLOW
    if (wantsImage) {
      if (!isLikelyImageUrl(imageUrl)) {
        const suggestedImages = await searchCommonsImages("wellbeing workplace mental health", 6);
        return NextResponse.json(
          {
            ok: false,
            error: "imageUrl must be a direct https image link ending .jpg/.png/.webp/.gif (not a webpage).",
            userMessage: "That image link isn’t a direct image file. Use a direct JPG/PNG/WebP/GIF (https) link and try again.",
            userHelp: helpForInvalidImageUrl(imageUrl),
            suggestedImages,
          },
          { status: 200 }
        );
      }

      const imgRes = await fetch(imageUrl, { cache: "no-store" });
      if (!imgRes.ok) {
        const suggestedImages = await searchCommonsImages("wellbeing workplace mental health", 6);
        return NextResponse.json(
          {
            ok: false,
            error: `Could not download imageUrl (HTTP ${imgRes.status})`,
            userMessage: "We couldn’t fetch that image link. Try a different image or use a suggested free-use one (check licence).",
            userHelp: {
              headline: "We can’t download that image",
              what: "The image might be blocked, private, or not a direct file link.",
              doThis: ["Try a different image URL", "Or use one of the suggested images below (check licence)"],
              notes: [`HTTP status: ${imgRes.status}`],
            },
            suggestedImages,
          },
          { status: 200 }
        );
      }

      const contentType = imgRes.headers.get("content-type") || "image/jpeg";
      const arrayBuffer = await imgRes.arrayBuffer();

      const sizeMb = Math.round((arrayBuffer.byteLength / (1024 * 1024)) * 10) / 10;
      if (sizeMb > 20) {
        const suggestedImages = await searchCommonsImages("wellbeing workplace mental health", 6);
        return NextResponse.json(
          {
            ok: false,
            error: `Image is quite large (${sizeMb}MB).`,
            userMessage: "That image is a bit large. Try a smaller JPG/PNG (or use a suggested image).",
            userHelp: {
              headline: "Image too large",
              doThis: ["Use a smaller image (under ~20MB is safest)", "Try a different image URL", "Or use a suggested image (check licence)"],
              notes: [`Size: ${sizeMb}MB`],
            },
            suggestedImages,
          },
          { status: 200 }
        );
      }

      const reg = await registerLinkedInUpload({ token, authorUrn: author.authorUrn, kind: "image" });
      if (!reg.ok) {
        return NextResponse.json(
          {
            ok: false,
            error: reg.error,
            userMessage: "LinkedIn wouldn’t accept the image upload setup. Try again in a minute.",
            userHelp: {
              headline: "LinkedIn upload setup failed",
              doThis: ["Wait 30 seconds and try again", "If it keeps failing, reconnect LinkedIn"],
            },
            details: reg.details,
            status: reg.status,
          },
          { status: 200 }
        );
      }

      const up = await uploadArrayBufferToLinkedIn(reg.uploadUrl, arrayBuffer, contentType);
      if (!up.ok) {
        return NextResponse.json(
          {
            ok: false,
            error: up.error,
            userMessage: "LinkedIn couldn’t upload the image. Try a smaller JPG/PNG or try again shortly.",
            userHelp: {
              headline: "Image upload failed",
              doThis: ["Try a different JPG/PNG", "Try again in a minute", "If it persists, reconnect LinkedIn"],
            },
            details: up.details,
            status: up.status,
          },
          { status: 200 }
        );
      }

      imageAssetUrn = reg.asset;
    }

    // CREATE POST
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
          userHelp: {
            headline: "Duplicate post",
            what: "LinkedIn blocks posts that look too similar to a recent one.",
            doThis: ["Change the first line", "Change the call-to-action", "Try again"],
          },
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
        userHelp: {
          headline: "LinkedIn rejected the post",
          doThis: ["Try again in a minute", "Shorten the post", "Remove emojis/extra formatting if needed"],
        },
        details: post.details,
        status: post.status,
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("[linkedin/post] error", err);
    return NextResponse.json(
      {
        ok: false,
        error: err?.message || "Server error",
        userMessage: "Something went wrong sending to LinkedIn. Please try again.",
        userHelp: { headline: "Temporary error", doThis: ["Try again in a minute", "If it persists, reconnect LinkedIn"] },
      },
      { status: 200 }
    );
  }
}
