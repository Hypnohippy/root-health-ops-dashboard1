// app/api/tiktok/post/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

export const runtime = "nodejs";

type SocialAccountRow = {
  organisation_id: string;
  platform: string;
  page_id: string | null; // we store open_id here (not required for upload init, but keep for your model)
  page_name: string | null;
  is_active: boolean | null;
  page_access_token: string | null; // TikTok user access token
  token_expires_at: string | null;
};

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

async function loadTikTokAccount(
  organisationId: string
): Promise<SocialAccountRow | null> {
  const { data, error } = await supabaseAdmin
    .from("social_accounts")
    .select(
      "organisation_id, platform, page_id, page_name, is_active, page_access_token, token_expires_at"
    )
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

async function tiktokInitInboxVideoUpload(args: {
  accessToken: string;
  videoSize: number;
}) {
  // ✅ Correct endpoint per TikTok docs
  const res = await fetch(
    "https://open.tiktokapis.com/v2/post/publish/inbox/video/init/",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${args.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        source_info: {
          source: "FILE_UPLOAD",
          video_size: args.videoSize,
          chunk_size: args.videoSize, // ✅ single-chunk upload
          total_chunk_count: 1, // ✅ single-chunk upload
        },
      }),
      cache: "no-store",
    }
  );

  const json: any = await res.json().catch(() => null);

  if (!res.ok) {
    const msg =
      json?.error?.message ||
      json?.message ||
      `TikTok init failed (HTTP ${res.status}).`;
    return { ok: false as const, status: res.status, error: msg, details: json };
  }

  const publishId = json?.data?.publish_id || null;
  const uploadUrl = json?.data?.upload_url || null;

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

async function tiktokUploadSinglePut(args: {
  uploadUrl: string;
  bytes: Uint8Array;
  contentType: string;
}) {
  const total = args.bytes.byteLength;
  const endInclusive = Math.max(0, total - 1);

  const putRes = await fetch(args.uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": args.contentType || "video/mp4",
      "Content-Range": `bytes 0-${endInclusive}/${total}`,
    },
    body: args.bytes as any,
    cache: "no-store",
  });

  if (!putRes.ok) {
    const text = await putRes.text().catch(() => "");
    return {
      ok: false as const,
      status: putRes.status,
      error: `TikTok upload failed (HTTP ${putRes.status})`,
      details: text,
    };
  }

  return { ok: true as const, status: putRes.status };
}

async function tiktokFetchStatus(args: { accessToken: string; publishId: string }) {
  const res = await fetch(
    "https://open.tiktokapis.com/v2/post/publish/status/fetch/",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${args.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ publish_id: args.publishId }),
      cache: "no-store",
    }
  );

  const json: any = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, details: json };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({} as any));

    const organisationId = String(
      body?.organisationId ?? body?.organisation_id ?? ""
    ).trim();
    const message = String(body?.message ?? "").trim();
    const videoUrl = String(body?.videoUrl ?? "").trim();

    if (!organisationId) {
      return NextResponse.json(
        {
          ok: false,
          error: "Missing organisationId",
          userMessage: "We couldn’t find your organisation yet.",
        },
        { status: 200 }
      );
    }

    if (!message) {
      return NextResponse.json(
        {
          ok: false,
          error: "Missing message",
          userMessage: "Add a caption/message first.",
        },
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

    if (!accessToken) {
      return NextResponse.json(
        {
          ok: false,
          error: "TikTok not connected (missing access token).",
          userMessage:
            "TikTok isn’t connected yet. Reconnect TikTok on the Connect page.",
        },
        { status: 200 }
      );
    }

    // 1) Download the video bytes (from Supabase public URL)
    const vidRes = await fetch(videoUrl, { cache: "no-store" });
    if (!vidRes.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: `Could not download videoUrl (HTTP ${vidRes.status})`,
          userMessage:
            "We couldn’t fetch that video link. Try re-uploading via the dropzone.",
        },
        { status: 200 }
      );
    }

    const contentType = vidRes.headers.get("content-type") || "video/mp4";
    const arrayBuffer = await vidRes.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    const size = bytes.byteLength;

    // 2) Init TikTok upload (✅ correct endpoint, ✅ single chunk)
    const init = await tiktokInitInboxVideoUpload({
      accessToken,
      videoSize: size,
    });

    if (!init.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: init.error,
          userMessage:
            "TikTok wouldn’t start the upload. This is usually a permissions/scope/audit issue.",
          details: init.details,
          status: init.status,
        },
        { status: 200 }
      );
    }

    // 3) Upload the full file in one PUT
    const up = await tiktokUploadSinglePut({
      uploadUrl: init.uploadUrl,
      bytes,
      contentType,
    });

    if (!up.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: up.error,
          userMessage:
            "TikTok upload failed. Try a smaller MP4, or try again in a minute.",
          details: up.details,
          status: up.status,
        },
        { status: 200 }
      );
    }

    // 4) Status check (TikTok processes async)
    const status = await tiktokFetchStatus({
      accessToken,
      publishId: init.publishId,
    });

    return NextResponse.json(
      {
        ok: true,
        postedId: init.publishId, // publish_id (final post_id can appear later)
        mode: "video",
        note:
          "TikTok creates a draft and returns publish_id immediately. The user may need to finish/confirm inside TikTok. Final visibility depends on app audit + account settings.",
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
