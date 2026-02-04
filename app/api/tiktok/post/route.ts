// app/api/tiktok/post/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

export const runtime = "nodejs";

type SocialAccountRow = {
  organisation_id: string;
  platform: string;
  page_id: string | null; // TikTok open_id stored here
  page_name: string | null;
  is_active: boolean | null;
  page_access_token: string | null; // TikTok user access token
  token_expires_at: string | null;
};

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function looksLikeVideoUrl(url: string) {
  const u = (url || "").trim().toLowerCase();
  if (!u) return false;
  if (!/^https:\/\/.+/i.test(u)) return false;
  return (
    /\.(mp4|mov|webm)(\?.*)?$/i.test(u) ||
    u.includes(".mp4") ||
    u.includes(".mov") ||
    u.includes(".webm")
  );
}

async function loadTikTokAccount(organisationId: string): Promise<SocialAccountRow | null> {
  const { data, error } = await supabaseAdmin
    .from("social_accounts")
    .select("organisation_id, platform, page_id, page_name, is_active, page_access_token, token_expires_at")
    .eq("organisation_id", organisationId)
    .eq("platform", "tiktok")
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[tiktok/post] load social_accounts error", error);
    return null;
  }
  return (data as any) ?? null;
}

/**
 * TikTok Content Posting API - init upload (FILE_UPLOAD)
 */
async function tiktokInitVideoUpload(args: {
  accessToken: string;
  title: string;
  videoSize: number;
  chunkSize: number;
  totalChunks: number;
}) {
  const res = await fetch("https://open.tiktokapis.com/v2/post/publish/video/init/", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${args.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      post_info: { title: args.title },
      source_info: {
        source: "FILE_UPLOAD",
        video_size: args.videoSize,
        chunk_size: args.chunkSize,
        total_chunk_count: args.totalChunks,
      },
    }),
    cache: "no-store",
  });

  const json: any = await res.json().catch(() => null);

  if (!res.ok) {
    const msg = json?.error?.message || json?.message || `TikTok init failed (HTTP ${res.status}).`;
    return { ok: false as const, status: res.status, error: msg, details: json };
  }

  const publishId = json?.data?.publish_id || json?.publish_id || null;
  const uploadUrl = json?.data?.upload_url || json?.upload_url || null;

  if (!publishId || !uploadUrl) {
    return {
      ok: false as const,
      status: 500,
      error: "TikTok init did not return publish_id/upload_url.",
      details: json,
    };
  }

  return {
    ok: true as const,
    status: 200,
    publishId: String(publishId),
    uploadUrl: String(uploadUrl),
    details: json,
  };
}

/**
 * Compute chunk plan that matches TikTok rules:
 * - chunk_size must be 5MB–64MB (except whole upload <5MB uses full size)
 * - total_chunk_count must be floor(video_size / chunk_size) (TikTok docs)
 * - last chunk can be > chunk_size (up to 128MB) to absorb remainder
 */
function buildChunkPlan(videoSize: number) {
  const MB = 1024 * 1024;
  const MIN = 5 * MB;
  const MAX = 64 * MB;

  // If <= 64MB, do a single whole upload (simplest + valid).
  if (videoSize <= MAX) {
    return { chunkSize: videoSize, totalChunks: 1 };
  }

  // For big videos, pick a safe chunk size within 5–64MB.
  // Using 32MB keeps last chunk <= 64MB + remainder <= 96MB (always < 128MB).
  let chunkSize = 32 * MB;

  // Ensure chunkSize stays within [MIN, MAX]
  if (chunkSize < MIN) chunkSize = MIN;
  if (chunkSize > MAX) chunkSize = MAX;

  // TikTok expects floor(video_size / chunk_size)
  let totalChunks = Math.floor(videoSize / chunkSize);

  // Safety: at least 1, max 1000 (TikTok docs)
  totalChunks = Math.max(1, Math.min(1000, totalChunks));

  return { chunkSize, totalChunks };
}

/**
 * Upload exactly totalChunks chunks sequentially.
 * The final chunk includes all remaining bytes.
 */
async function tiktokUploadChunks(args: {
  uploadUrl: string;
  bytes: Uint8Array;
  contentType: string;
  chunkSize: number;
  totalChunks: number;
}) {
  const total = args.bytes.byteLength;

  for (let part = 0; part < args.totalChunks; part++) {
    const start = part * args.chunkSize;

    // Final chunk absorbs all remaining bytes
    const endExclusive =
      part === args.totalChunks - 1 ? total : Math.min(total, start + args.chunkSize);

    const endInclusive = Math.max(start, endExclusive - 1);

    const chunk = args.bytes.slice(start, endExclusive);

    const putRes = await fetch(args.uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": args.contentType || "video/mp4",
        "Content-Length": String(chunk.byteLength),
        "Content-Range": `bytes ${start}-${endInclusive}/${total}`,
      },
      body: chunk as any,
      cache: "no-store",
    });

    // TikTok often returns 206 for partial, 201 for final — both count as ok
    if (!putRes.ok) {
      const text = await putRes.text().catch(() => "");
      return {
        ok: false as const,
        status: putRes.status,
        error: `TikTok upload failed on chunk ${part + 1}/${args.totalChunks} (HTTP ${putRes.status})`,
        details: text,
      };
    }

    // tiny pause helps stability
    await sleep(120);
  }

  return { ok: true as const, status: 200 };
}

async function tiktokFetchStatus(args: { accessToken: string; publishId: string }) {
  const res = await fetch("https://open.tiktokapis.com/v2/post/publish/status/fetch/", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${args.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ publish_id: args.publishId }),
    cache: "no-store",
  });

  const json: any = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, details: json };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({} as any));
    const organisationId = String(body?.organisationId ?? body?.organisation_id ?? "").trim();
    const message = String(body?.message ?? "").trim();
    const videoUrl = String(body?.videoUrl ?? "").trim();

    if (!organisationId) {
      return NextResponse.json(
        { ok: false, error: "Missing organisationId", userMessage: "We couldn’t find your organisation yet." },
        { status: 200 }
      );
    }

    if (!message) {
      return NextResponse.json(
        { ok: false, error: "Missing message", userMessage: "Add a caption/message first." },
        { status: 200 }
      );
    }

    if (!videoUrl) {
      return NextResponse.json(
        {
          ok: false,
          error: "TikTok requires videoUrl (MP4) to post.",
          userMessage: "TikTok needs a video. Upload an MP4 and try again.",
        },
        { status: 200 }
      );
    }

    if (!looksLikeVideoUrl(videoUrl)) {
      return NextResponse.json(
        {
          ok: false,
          error: "videoUrl must be a direct https MP4/MOV/WEBM link.",
          userMessage: "That video link doesn’t look like a direct MP4 file link.",
        },
        { status: 200 }
      );
    }

    const acct = await loadTikTokAccount(organisationId);
    const accessToken = String(acct?.page_access_token || "").trim();
    const openId = String(acct?.page_id || "").trim();

    if (!accessToken || !openId) {
      return NextResponse.json(
        {
          ok: false,
          error: "TikTok not connected (missing token/open_id).",
          userMessage: "TikTok isn’t connected yet. Reconnect TikTok on the Connect page.",
        },
        { status: 200 }
      );
    }

    // 1) Download video bytes (from Supabase public URL)
    const vidRes = await fetch(videoUrl, { cache: "no-store" });
    if (!vidRes.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: `Could not download videoUrl (HTTP ${vidRes.status})`,
          userMessage: "We couldn’t fetch that video link. Try re-uploading via the dropzone.",
        },
        { status: 200 }
      );
    }

    const contentType = vidRes.headers.get("content-type") || "video/mp4";
    const arrayBuffer = await vidRes.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    const size = bytes.byteLength;

    // 2) Build chunk plan that matches TikTok’s expectations
    const plan = buildChunkPlan(size);

    // 3) Init TikTok upload
    const init = await tiktokInitVideoUpload({
      accessToken,
      title: message.slice(0, 150),
      videoSize: size,
      chunkSize: plan.chunkSize,
      totalChunks: plan.totalChunks,
    });

    if (!init.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: init.error,
          userMessage: "TikTok wouldn’t start the upload. This is usually a permissions/scope issue.",
          details: init.details,
          status: init.status,
        },
        { status: 200 }
      );
    }

    // 4) Upload chunks
    const up = await tiktokUploadChunks({
      uploadUrl: init.uploadUrl,
      bytes,
      contentType,
      chunkSize: plan.chunkSize,
      totalChunks: plan.totalChunks,
    });

    if (!up.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: up.error,
          userMessage: "TikTok upload failed. Try again in a minute or try a smaller MP4.",
          details: up.details,
          status: up.status,
        },
        { status: 200 }
      );
    }

    // 5) Optional: fetch status once
    const status = await tiktokFetchStatus({ accessToken, publishId: init.publishId });

    return NextResponse.json(
      {
        ok: true,
        postedId: init.publishId, // publish_id returned immediately
        mode: "video",
        note: "TikTok returns publish_id immediately. Final post_id can appear later after processing/moderation.",
        chunkPlan: { videoSize: size, chunkSize: plan.chunkSize, totalChunks: plan.totalChunks },
        statusCheck: status.details,
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("[tiktok/post] fatal", err);
    return NextResponse.json(
      { ok: false, error: err?.message || "TikTok post route crashed." },
      { status: 200 }
    );
  }
}
