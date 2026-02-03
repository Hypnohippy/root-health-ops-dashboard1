// app/api/social/quick-blast/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

export const runtime = "nodejs";

/**
 * ✅ Browser test helper
 * Open /api/social/quick-blast in the browser to confirm the file deployed.
 */
export async function GET() {
  return NextResponse.json({
    ok: true,
    route: "app/api/social/quick-blast/route.ts",
    version: "2026-02-03-ig-ready-wait-v3-typed",
    note: "Fixes TS build error + waits for FINISHED (image+video) + retries publish if not ready.",
  });
}

type Platform = "instagram" | "facebook" | "threads" | "linkedin" | "tiktok";

type IgFailure = {
  ok: false;
  status: number;
  error: string;
  details: any | null;
};

type IgSuccess = {
  ok: true;
  status: number;
  postedId: string | null;
  details: any | null;
};

type IgPublishResult = IgFailure | IgSuccess;

/**
 * Single-tenant fallback (your current build/testing mode)
 */
async function getSingleTenantOrganisationId(): Promise<string | null> {
  const { data, error } = await supabaseAdmin.from("organisations").select("id").limit(1);
  if (error || !data || data.length === 0) return null;
  return String((data as any)[0].id);
}

async function getInstagramConnection(organisationId: string) {
  const { data, error } = await supabaseAdmin
    .from("social_accounts")
    .select("platform,page_id,page_name,page_access_token,is_active,token_expires_at,updated_at")
    .eq("organisation_id", organisationId)
    .eq("platform", "instagram")
    .limit(1);

  if (error) return { ok: false as const, error: error.message, row: null };

  const row = Array.isArray(data) && data.length > 0 ? (data[0] as any) : null;

  if (!row) {
    return { ok: false as const, error: "Instagram is not connected for this organisation.", row: null };
  }

  if (row.is_active === false) {
    return { ok: false as const, error: "Instagram is marked inactive. Reconnect Instagram.", row };
  }

  const igUserId = String(row.page_id || "").trim();
  const accessToken = String(row.page_access_token || "").trim();

  if (!igUserId || !accessToken) {
    return {
      ok: false as const,
      error: "Instagram connection exists but is missing page_id or page_access_token. Reconnect Instagram.",
      row,
    };
  }

  const exp = row.token_expires_at ? new Date(String(row.token_expires_at)) : null;
  if (exp && !isNaN(exp.getTime()) && exp.getTime() < Date.now()) {
    return {
      ok: false as const,
      error: "Instagram token is expired in Supabase. Disconnect + reconnect Instagram.",
      row,
    };
  }

  return { ok: true as const, igUserId, accessToken, row };
}

async function igCreateContainer(args: {
  accessToken: string;
  igUserId: string;
  caption: string;
  imageUrl?: string | null;
  videoUrl?: string | null;
}) {
  const hasVideo = !!(args.videoUrl && args.videoUrl.trim());
  const hasImage = !!(args.imageUrl && args.imageUrl.trim());

  if (!hasVideo && !hasImage) {
    return { ok: false, status: 400, error: "Instagram requires an image or a video URL for this post.", details: null };
  }

  const url = new URL(`https://graph.facebook.com/v24.0/${args.igUserId}/media`);
  url.searchParams.set("access_token", args.accessToken);
  url.searchParams.set("caption", args.caption);

  if (hasVideo) {
    url.searchParams.set("media_type", "REELS");
    url.searchParams.set("video_url", args.videoUrl!.trim());
  } else {
    url.searchParams.set("image_url", args.imageUrl!.trim());
  }

  const res = await fetch(url.toString(), { method: "POST" });
  const json = await res.json().catch(() => null);

  if (!res.ok) {
    const friendly =
      json?.error?.error_user_msg ||
      json?.error?.message ||
      "Instagram container creation failed.";
    return { ok: false, status: res.status, error: String(friendly), details: json };
  }

  const creationId = json?.id;
  if (!creationId) {
    return { ok: false, status: 500, error: "Instagram did not return a creation id.", details: json };
  }

  return { ok: true, status: 200, creationId: String(creationId), details: json };
}

/**
 * ✅ Wait until container is ready (FINISHED) — for BOTH images and videos.
 */
async function igWaitUntilReady(args: {
  accessToken: string;
  creationId: string;
  isVideo: boolean;
}) {
  const maxAttempts = args.isVideo ? 12 : 10; // give images a bit more headroom too
  const delayMs = args.isVideo ? 5000 : 2500;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const url = new URL(`https://graph.facebook.com/v24.0/${args.creationId}`);
    url.searchParams.set("fields", "status_code");
    url.searchParams.set("access_token", args.accessToken);

    const res = await fetch(url.toString(), { method: "GET", cache: "no-store" });
    const json = await res.json().catch(() => null);

    if (!res.ok) {
      const friendly =
        json?.error?.error_user_msg ||
        json?.error?.message ||
        "Instagram status check failed.";
      return { ok: false, status: res.status, error: String(friendly), details: json };
    }

    const statusCode = String(json?.status_code || "").toUpperCase();

    if (statusCode === "FINISHED") {
      return { ok: true, status: 200, statusCode, details: json };
    }

    if (statusCode === "ERROR") {
      return { ok: false, status: 400, error: "Instagram reported processing ERROR for this media.", details: json };
    }

    await new Promise((r) => setTimeout(r, delayMs));
  }

  return {
    ok: false,
    status: 408,
    error: "Instagram is still processing the media. Wait a moment and try again.",
    details: null,
  };
}

async function igPublishOnce(args: {
  accessToken: string;
  igUserId: string;
  creationId: string;
}): Promise<IgPublishResult> {
  const url = new URL(`https://graph.facebook.com/v24.0/${args.igUserId}/media_publish`);
  url.searchParams.set("creation_id", args.creationId);
  url.searchParams.set("access_token", args.accessToken);

  const res = await fetch(url.toString(), { method: "POST" });
  const json = await res.json().catch(() => null);

  if (!res.ok) {
    const friendly =
      json?.error?.error_user_msg ||
      json?.error?.message ||
      "Instagram publish failed.";
    return { ok: false, status: res.status, error: String(friendly), details: json };
  }

  return { ok: true, status: 200, postedId: json?.id ? String(json.id) : null, details: json };
}

/**
 * ✅ Retry publish if IG says "media not ready".
 * This matches your exact error: code 9007 / subcode 2207027 / "Media ID is not available".
 */
async function igPublishWithRetry(args: {
  accessToken: string;
  igUserId: string;
  creationId: string;
  isVideo: boolean;
}): Promise<IgPublishResult> {
  const maxPublishAttempts = 6;
  const delayMs = args.isVideo ? 5000 : 2500;

  for (let i = 1; i <= maxPublishAttempts; i++) {
    const out = await igPublishOnce(args);
    if (out.ok) return out;

    const msg = String(out?.error || "").toLowerCase();
    const detailsMsg = String((out as any)?.details?.error?.message || "").toLowerCase();
    const userMsg = String((out as any)?.details?.error?.error_user_msg || "").toLowerCase();

    const notReady =
      msg.includes("not ready") ||
      userMsg.includes("not ready") ||
      detailsMsg.includes("media id is not available") ||
      detailsMsg.includes("not available");

    if (!notReady) return out;

    await new Promise((r) => setTimeout(r, delayMs));
  }

  // ✅ IMPORTANT: return shape MUST include details to satisfy TS and avoid build failure
  return {
    ok: false,
    status: 400,
    error: "The media is still not ready to publish. Wait 10–30 seconds and try again.",
    details: null,
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({} as any));

    const message: string = String(body?.message ?? "");
    const imageUrl: string = String(body?.imageUrl ?? "");
    const videoUrl: string = String(body?.videoUrl ?? "");

    const platformsRaw: any[] = Array.isArray(body?.platforms) ? body.platforms : [];
    const platforms = platformsRaw
      .map((p) => String(p || "").toLowerCase().trim())
      .filter(Boolean) as Platform[];

    const organisationIdFromBody = String(body?.organisationId ?? body?.organisation_id ?? "").trim();
    const organisationId = organisationIdFromBody || (await getSingleTenantOrganisationId());

    if (!message.trim()) {
      return NextResponse.json({ success: false, error: "Message is required." }, { status: 200 });
    }

    if (!organisationId) {
      return NextResponse.json(
        { success: false, error: "No organisationId available. Refresh dashboard and try again." },
        { status: 200 }
      );
    }

    if (platforms.length === 0) {
      return NextResponse.json({ success: false, error: "No platforms selected." }, { status: 200 });
    }

    const results: any[] = [];

    for (const p of platforms) {
      if (p !== "instagram") {
        results.push({
          platform: p,
          ok: false,
          skipped: true,
          status: 200,
          error: `Quick Blast route currently publishes to Instagram only. ${p} skipped.`,
        });
        continue;
      }

      const conn = await getInstagramConnection(organisationId);
      if (!conn.ok) {
        results.push({
          platform: "instagram",
          ok: false,
          status: 400,
          mode: videoUrl ? "video" : imageUrl ? "image" : "text",
          error: conn.error,
          details: conn.row || null,
        });
        continue;
      }

      const created = await igCreateContainer({
        accessToken: conn.accessToken,
        igUserId: conn.igUserId,
        caption: message,
        imageUrl: imageUrl || null,
        videoUrl: videoUrl || null,
      });

      if (!(created as any).ok) {
        results.push({
          platform: "instagram",
          ok: false,
          status: (created as any).status,
          mode: videoUrl ? "video" : imageUrl ? "image" : "text",
          error: (created as any).error,
          details: (created as any).details ?? null,
        });
        continue;
      }

      const creationId = String((created as any).creationId || "");
      const isVideo = !!(videoUrl && videoUrl.trim());

      const ready = await igWaitUntilReady({
        accessToken: conn.accessToken,
        creationId,
        isVideo,
      });

      if (!ready.ok) {
        results.push({
          platform: "instagram",
          ok: false,
          status: ready.status,
          mode: isVideo ? "video" : imageUrl ? "image" : "text",
          error: ready.error,
          details: ready.details ?? null,
        });
        continue;
      }

      const published = await igPublishWithRetry({
        accessToken: conn.accessToken,
        igUserId: conn.igUserId,
        creationId,
        isVideo,
      });

      if (!published.ok) {
        results.push({
          platform: "instagram",
          ok: false,
          status: published.status,
          mode: isVideo ? "video" : imageUrl ? "image" : "text",
          error: published.error,
          details: published.details ?? null,
        });
        continue;
      }

      results.push({
        platform: "instagram",
        ok: true,
        status: 200,
        postedId: published.postedId,
        mode: isVideo ? "video" : imageUrl ? "image" : "text",
        details: published.details ?? null,
      });
    }

    const attempted = results.length;
    const ok = results.filter((r) => r.ok).length;
    const failed = results.filter((r) => !r.ok && !r.skipped).length;
    const skipped = results.filter((r) => r.skipped).length;

    return NextResponse.json(
      {
        success: ok > 0 && failed === 0,
        organisationId,
        results,
        summary: { attempted, ok, failed, skipped },
        userMessage:
          ok > 0
            ? "Instagram sent ✅"
            : failed > 0
            ? "Instagram didn’t send. See the error details."
            : "No posts sent from this route.",
      },
      { status: 200 }
    );
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || "Quick Blast crashed." },
      { status: 200 }
    );
  }
}
