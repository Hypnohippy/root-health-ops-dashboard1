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
    version: "2026-02-03-ig-from-supabase-v1",
    note: "Instagram publishing now uses Supabase social_accounts token instead of IG_ACCESS_TOKEN env var.",
  });
}

type Platform = "instagram" | "facebook" | "threads" | "linkedin" | "tiktok";

/**
 * Single-tenant fallback (your current build/testing mode)
 * If the frontend doesn’t pass organisationId, we use the first org in the table.
 */
async function getSingleTenantOrganisationId(): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from("organisations")
    .select("id")
    .limit(1);

  if (error || !data || data.length === 0) return null;
  return String(data[0].id);
}

async function getInstagramConnection(organisationId: string) {
  const { data, error } = await supabaseAdmin
    .from("social_accounts")
    .select(
      "platform,page_id,page_name,page_access_token,is_active,token_expires_at,updated_at"
    )
    .eq("organisation_id", organisationId)
    .eq("platform", "instagram")
    .limit(1);

  if (error) {
    return { ok: false as const, error: error.message, row: null };
  }

  const row = Array.isArray(data) && data.length > 0 ? (data[0] as any) : null;
  if (!row) {
    return {
      ok: false as const,
      error: "Instagram is not connected for this organisation.",
      row: null,
    };
  }

  if (row.is_active === false) {
    return {
      ok: false as const,
      error: "Instagram is marked inactive. Reconnect Instagram.",
      row,
    };
  }

  const igUserId = String(row.page_id || "").trim();
  const accessToken = String(row.page_access_token || "").trim();

  if (!igUserId || !accessToken) {
    return {
      ok: false as const,
      error:
        "Instagram connection exists but is missing page_id or page_access_token. Reconnect Instagram.",
      row,
    };
  }

  // Optional expiry check if you store it
  const exp = row.token_expires_at ? new Date(String(row.token_expires_at)) : null;
  if (exp && !isNaN(exp.getTime()) && exp.getTime() < Date.now()) {
    return {
      ok: false as const,
      error: "Instagram token is expired in Supabase. Disconnect + reconnect Instagram.",
      row,
    };
  }

  return {
    ok: true as const,
    igUserId,
    accessToken,
    row,
  };
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
    return {
      ok: false,
      status: 400,
      error: "Instagram requires an image or a video URL for this post.",
    };
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
    return { ok: false, status: res.status, error: friendly, details: json };
  }

  const creationId = json?.id;
  if (!creationId) {
    return {
      ok: false,
      status: 500,
      error: "Instagram did not return a creation id.",
      details: json,
    };
  }

  return { ok: true, status: 200, creationId, details: json };
}

async function igWaitUntilReady(args: { accessToken: string; creationId: string }) {
  const maxAttempts = 12;
  const delayMs = 5000;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const url = new URL(`https://graph.facebook.com/v24.0/${args.creationId}`);
    url.searchParams.set("fields", "status_code");
    url.searchParams.set("access_token", args.accessToken);

    const res = await fetch(url.toString(), { method: "GET" });
    const json = await res.json().catch(() => null);

    if (!res.ok) {
      const friendly =
        json?.error?.error_user_msg ||
        json?.error?.message ||
        "Instagram status check failed.";
      return { ok: false, status: res.status, error: friendly, details: json };
    }

    const statusCode = String(json?.status_code || "").toUpperCase();

    if (statusCode === "FINISHED") {
      return { ok: true, status: 200, statusCode, details: json };
    }

    if (statusCode === "ERROR") {
      return {
        ok: false,
        status: 400,
        error: "Instagram reported processing ERROR for this media.",
        details: json,
      };
    }

    await new Promise((r) => setTimeout(r, delayMs));
  }

  return {
    ok: false,
    status: 408,
    error: "Instagram is still processing the video. Wait ~1 minute and try again.",
  };
}

async function igPublish(args: { accessToken: string; igUserId: string; creationId: string }) {
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
    return { ok: false, status: res.status, error: friendly, details: json };
  }

  return { ok: true, status: 200, postedId: json?.id || null, details: json };
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

    // ✅ Instagram only for now (others explicitly skipped to avoid platform-wide changes)
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

      if (!created.ok) {
        results.push({
          platform: "instagram",
          ok: false,
          status: created.status,
          mode: videoUrl ? "video" : imageUrl ? "image" : "text",
          error: created.error,
          details: created.details,
        });
        continue;
      }

      const creationId = String(created.creationId || "");
      const isVideo = !!(videoUrl && videoUrl.trim());

      if (isVideo) {
        const ready = await igWaitUntilReady({
          accessToken: conn.accessToken,
          creationId,
        });

        if (!ready.ok) {
          results.push({
            platform: "instagram",
            ok: false,
            status: ready.status,
            mode: "video",
            error: ready.error,
            details: ready.details,
          });
          continue;
        }
      }

      const published = await igPublish({
        accessToken: conn.accessToken,
        igUserId: conn.igUserId,
        creationId,
      });

      if (!published.ok) {
        results.push({
          platform: "instagram",
          ok: false,
          status: published.status,
          mode: isVideo ? "video" : imageUrl ? "image" : "text",
          error: published.error,
          details: published.details,
        });
        continue;
      }

      results.push({
        platform: "instagram",
        ok: true,
        status: 200,
        postedId: published.postedId,
        mode: isVideo ? "video" : imageUrl ? "image" : "text",
        details: published.details,
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
