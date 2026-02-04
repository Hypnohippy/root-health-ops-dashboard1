// app/api/tiktok/post/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

export const runtime = "nodejs";

type SocialAccountRow = {
  organisation_id: string;
  platform: string;
  page_id: string | null; // for TikTok we store open_id here
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
  return /\.(mp4|mov|webm)(\?.*)?$/i.test(u) || u.includes(".mp4") || u.includes(".mov") || u.includes(".webm");
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
      post_info: {
        title: args.title,
      },
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
    const msg =
      json?.error?.message ||
      json?.message ||
      `TikTok init failed (HTTP ${res.status}).`;
    return { ok: false as const, status: res.status, error: msg, details: json };
  }

  // TikTok responses are usually nested under data
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

  return { ok: true as const, status: 200, publishId: String(publishId), uploadUrl: String(uploadUrl), details: json };
}

async function tiktokUploadChunks(args: {
  uploadUrl: string;
  bytes: Uint8Array;
  contentType: string;
  chunkSize: number;
}) {
  const total = args.bytes.byteLength;
  const chunkSize = Math.max(1, args.chunkSize);

  let start = 0;
  let part = 0;

  while (start < total) {
    const endExclusive = Math.min(total, start + chunkSize);
    const endInclusive = endExclusive - 1;

    const chunk = args.bytes.slice(start, endExclusive);

    const putRes = await fetch(args.uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": args.contentType || "video/mp4",
        "Content-Length": String(chunk.byteLength),
        // TikTok expects Content-Range for chunked uploads
        "Content-Range": `bytes ${start}-${endInclusive}/${total}`,
      },
      body: chunk as any,
      cache: "no-store",
    });

    if (!putRes.ok) {
      const text = await putRes.text().catch(() => "");
      return {
        ok: false as const,
        status: putRes.status,
        error: `TikTok upload failed on chunk ${part} (HTTP ${putRes.status})`,
        details: text,
      };
    }

    part += 1;
    start = endExclusive;

    // tiny pause can help avoid edge throttles
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

  // This endpoint can return useful status info even when not "ok" in a strict sense,
  // but we’ll keep it simple:
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

    // NOTE: we store open_id in page_id (as your connect flow already does)
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

    // 1) Download the video bytes (from your Supabase public URL)
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

    // 2) Init TikTok upload (chunked)
    const CHUNK = 10 * 1024 * 1024; // 10MB chunks (safe default)
    const chunkSize = Math.min(CHUNK, size);
    const totalChunks = Math.max(1, Math.ceil(size / chunkSize));

    const init = await tiktokInitVideoUpload({
      accessToken,
      title: message.slice(0, 150),
      videoSize: size,
      chunkSize,
      totalChunks,
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

    // 3) Upload bytes to the upload_url
    const up = await tiktokUploadChunks({
      uploadUrl: init.uploadUrl,
      bytes,
      contentType,
      chunkSize,
    });

    if (!up.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: up.error,
          userMessage: "TikTok upload failed. Try a smaller MP4, or try again in a minute.",
          details: up.details,
          status: up.status,
        },
        { status: 200 }
      );
    }

    // 4) Fetch status once (you can poll again if you want)
    const status = await tiktokFetchStatus({ accessToken, publishId: init.publishId });

    return NextResponse.json(
      {
        ok: true,
        postedId: init.publishId, // publish_id (TikTok returns post_id later after processing/moderation)
        mode: "video",
        note: "TikTok returns publish_id immediately. Final post_id can appear later after processing/moderation.",
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
