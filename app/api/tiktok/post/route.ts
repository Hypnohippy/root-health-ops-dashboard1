import { requirePublishingOrganisation, accessErrorResponse } from "@/lib/tenantAuth";
// app/api/tiktok/post/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

export const runtime = "nodejs";

const TIKTOK_CLIENT_KEY = process.env.TIKTOK_CLIENT_KEY || "";
const TIKTOK_CLIENT_SECRET = process.env.TIKTOK_CLIENT_SECRET || "";
const TIKTOK_REDIRECT_URI = process.env.TIKTOK_REDIRECT_URI || "";

type SocialAccountRow = {
  organisation_id: string;
  platform: string;
  page_id: string | null;
  page_name: string | null;
  is_active: boolean | null;
  page_access_token: string | null;
  token_expires_at: string | null;
  meta: any | null; // refresh_token stored here
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

async function loadTikTokAccount(organisationId: string): Promise<SocialAccountRow | null> {
  const { data, error } = await supabaseAdmin
    .from("social_accounts")
    .select("organisation_id, platform, page_id, page_name, is_active, page_access_token, token_expires_at, meta")
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

async function refreshTikTokToken(refreshToken: string) {
  // TikTok OAuth token endpoint (v2)
  const url = "https://open.tiktokapis.com/v2/oauth/token/";
  const form = new URLSearchParams();
  form.set("client_key", TIKTOK_CLIENT_KEY);
  form.set("client_secret", TIKTOK_CLIENT_SECRET);
  form.set("grant_type", "refresh_token");
  form.set("refresh_token", refreshToken);
  if (TIKTOK_REDIRECT_URI) form.set("redirect_uri", TIKTOK_REDIRECT_URI);

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
    cache: "no-store",
  });

  const json: any = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, json };
}

async function tiktokInitInboxVideoUpload(args: { accessToken: string; videoSize: number }) {
  const res = await fetch("https://open.tiktokapis.com/v2/post/publish/inbox/video/init/", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${args.accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      source_info: {
        source: "FILE_UPLOAD",
        video_size: args.videoSize,
        chunk_size: args.videoSize,
        total_chunk_count: 1,
      },
    }),
    cache: "no-store",
  });

  const json: any = await res.json().catch(() => null);

  if (!res.ok) {
    const msg = json?.error?.message || json?.message || `TikTok init failed (HTTP ${res.status}).`;
    return { ok: false as const, status: res.status, error: msg, details: json };
  }

  const publishId = json?.data?.publish_id || null;
  const uploadUrl = json?.data?.upload_url || null;

  if (!publishId || !uploadUrl) {
    return { ok: false as const, status: 500, error: "TikTok init did not return publish_id/upload_url.", details: json };
  }

  return { ok: true as const, status: 200, publishId: String(publishId), uploadUrl: String(uploadUrl), details: json };
}

async function tiktokUploadSinglePut(args: { uploadUrl: string; bytes: Uint8Array; contentType: string }) {
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
    return { ok: false as const, status: putRes.status, error: `TikTok upload failed (HTTP ${putRes.status})`, details: text };
  }

  return { ok: true as const, status: putRes.status };
}

async function tiktokFetchStatus(args: { accessToken: string; publishId: string }) {
  const res = await fetch("https://open.tiktokapis.com/v2/post/publish/status/fetch/", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${args.accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
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

    const { organisationId } = await requirePublishingOrganisation(req, String(body?.organisationId ?? body?.organisation_id ?? "").trim());
    const message = String(body?.message ?? "").trim();
    const videoUrl = String(body?.videoUrl ?? "").trim();

    if (!organisationId) {
      return NextResponse.json({ ok: false, error: "Missing organisationId", userMessage: "We couldn’t find your organisation yet." }, { status: 200 });
    }

    if (!message) {
      return NextResponse.json({ ok: false, error: "Missing message", userMessage: "Add a caption/message first." }, { status: 200 });
    }

    if (!videoUrl) {
      return NextResponse.json({ ok: false, error: "TikTok requires videoUrl (MP4) to post.", userMessage: "TikTok needs a video. Upload an MP4 and try again." }, { status: 200 });
    }

    if (!looksLikeVideoUrl(videoUrl)) {
      return NextResponse.json({ ok: false, error: "videoUrl must be a direct https MP4/MOV/WEBM link.", userMessage: "That video link doesn’t look like a direct MP4 file link." }, { status: 200 });
    }

    const acct = await loadTikTokAccount(organisationId);
    let accessToken = String(acct?.page_access_token || "").trim();
    const refreshToken = String(acct?.meta?.refresh_token || "").trim();

    if (!accessToken) {
      return NextResponse.json(
        {
          ok: false,
          error: "TikTok not connected (missing access token).",
          userMessage: "TikTok isn’t connected yet. Reconnect TikTok on the Connect page.",
        },
        { status: 200 }
      );
    }

    // 1) Download video bytes
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

    // 2) Init upload (if token invalid, refresh once then retry)
    let init = await tiktokInitInboxVideoUpload({ accessToken, videoSize: size });

    const initErrorCode = init.ok ? "" : String((init as any)?.details?.error?.code || "");
    const initErrorMsg = init.ok ? "" : String((init as any)?.details?.error?.message || (init as any)?.error || "");
    const tokenInvalid =
      !init.ok &&
      (initErrorCode === "access_token_invalid" ||
        initErrorMsg.toLowerCase().includes("access token is invalid") ||
        initErrorMsg.toLowerCase().includes("invalid or not found"));

    if (!init.ok && tokenInvalid && refreshToken && TIKTOK_CLIENT_KEY && TIKTOK_CLIENT_SECRET) {
      const refreshed = await refreshTikTokToken(refreshToken);
      if (refreshed.ok) {
        const newAccess = refreshed.json?.access_token || refreshed.json?.data?.access_token || "";
        const expiresIn = Number(refreshed.json?.expires_in ?? refreshed.json?.data?.expires_in ?? 0) || 0;

        if (newAccess) {
          accessToken = String(newAccess).trim();
          const tokenExpiresAt = expiresIn > 0 ? new Date(Date.now() + expiresIn * 1000).toISOString() : null;

          // save updated token
          await supabaseAdmin
            .from("social_accounts")
            .update({
              page_access_token: accessToken,
              token_expires_at: tokenExpiresAt,
              meta: { ...(acct?.meta || {}), raw_refresh: refreshed.json || null },
              updated_at: new Date().toISOString(),
            } as any)
            .eq("organisation_id", organisationId)
            .eq("platform", "tiktok");

          // retry init after refresh
          init = await tiktokInitInboxVideoUpload({ accessToken, videoSize: size });
        }
      }
    }

    if (!init.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: init.error,
          userMessage:
            "TikTok wouldn’t start the upload. If this keeps happening, it’s usually a TikTok scope/approval issue on the app or the account.",
          details: init.details,
          status: init.status,
        },
        { status: 200 }
      );
    }

    // 3) Upload bytes
    const up = await tiktokUploadSinglePut({ uploadUrl: init.uploadUrl, bytes, contentType });
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

    // 4) Status check
    const status = await tiktokFetchStatus({ accessToken, publishId: init.publishId });

    return NextResponse.json(
      {
        ok: true,
        postedId: init.publishId,
        mode: "video",
        note: "TikTok returns a publish_id quickly. Processing/publishing is async and depends on account/app approval.",
        statusCheck: status.details,
      },
      { status: 200 }
    );
  } catch (err: any) {
    const denied = accessErrorResponse(err);
    if (denied) return denied;
    console.error("[tiktok/post] fatal", err);
    return NextResponse.json({ ok: false, error: err?.message || "TikTok post route crashed." }, { status: 200 });
  }
}
