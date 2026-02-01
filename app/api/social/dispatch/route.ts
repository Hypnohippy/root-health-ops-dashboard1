// app/api/social/quick-blast/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

const DISPATCH_SECRET = process.env.DISPATCH_SECRET;

// Platforms your UI supports
const ALLOWED_PLATFORMS = [
  "facebook",
  "instagram",
  "linkedin",
  "threads",
  "tiktok",
  "reddit",
  "twitter",
  "youtube",
  "google",
];

async function getSingleTenantOrganisationId() {
  const { data, error } = await supabaseAdmin
    .from("organisations")
    .select("id")
    .limit(1);

  if (error) {
    console.error("[quick-blast] organisations error", error);
    return null;
  }
  if (!data || data.length === 0) return null;
  return data[0].id as string;
}

function originFromReq(req: NextRequest) {
  // Works on Vercel + local
  const url = new URL(req.url);
  return url.origin;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));

    const message: string = (body?.message ?? "").toString();
    const platformsRaw: any[] = Array.isArray(body?.platforms) ? body.platforms : [];

    // Optional: allow caller to pass organisationId, otherwise single-tenant fallback
    const organisationIdFromBody =
      typeof body?.organisationId === "string" && body.organisationId.trim()
        ? body.organisationId.trim()
        : null;

    // Media
    const imageUrl =
      typeof body?.imageUrl === "string" && body.imageUrl.trim()
        ? body.imageUrl.trim()
        : "";

    const videoUrl =
      typeof body?.videoUrl === "string" && body.videoUrl.trim()
        ? body.videoUrl.trim()
        : "";

    if (!message.trim()) {
      return NextResponse.json(
        { success: false, error: "Message is required." },
        { status: 200 }
      );
    }

    // Normalize + validate platforms
    const platforms = platformsRaw
      .map((p) => String(p || "").toLowerCase().trim())
      .filter(Boolean);

    if (platforms.length === 0) {
      return NextResponse.json(
        { success: false, error: "Choose at least one platform." },
        { status: 200 }
      );
    }

    const invalid = platforms.filter((p) => !ALLOWED_PLATFORMS.includes(p));
    if (invalid.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: `Unsupported platform(s): ${invalid.join(", ")}`,
          allowed: ALLOWED_PLATFORMS,
        },
        { status: 200 }
      );
    }

    const organisationId =
      organisationIdFromBody || (await getSingleTenantOrganisationId());

    if (!organisationId) {
      return NextResponse.json(
        {
          success: false,
          error:
            "No organisation found. Create an organisation row first (or pass organisationId).",
        },
        { status: 200 }
      );
    }

    // Create ONE scheduled_posts row (your dispatcher already understands platforms array)
    // Store image in image_url; store video in meta.video_url (keeps schema stable)
    const nowIso = new Date().toISOString();

    const insertPayload: any = {
      organisation_id: organisationId,
      message,
      platforms,
      image_url: imageUrl || null,
      scheduled_for: nowIso,
      status: "scheduled",
      meta: {
        source: "quick_blast",
        created_at: nowIso,
        ...(videoUrl ? { video_url: videoUrl } : {}),
      },
    };

    const { data: created, error: insErr } = await supabaseAdmin
      .from("scheduled_posts")
      .insert(insertPayload)
      .select("id")
      .single();

    if (insErr || !created?.id) {
      console.error("[quick-blast] scheduled_posts insert error", insErr);
      return NextResponse.json(
        {
          success: false,
          error: "Could not queue post for dispatch.",
          details: (insErr as any)?.message || insErr || null,
        },
        { status: 200 }
      );
    }

    // Trigger dispatcher immediately (no Ayrshare here, no Make here).
    // If DISPATCH_SECRET is not set, cron will still pick it up within a minute.
    let dispatchJson: any = null;

    if (DISPATCH_SECRET) {
      try {
        const origin = originFromReq(req);
        const dispatchUrl = `${origin}/api/social/dispatch-scheduled?secret=${encodeURIComponent(
          DISPATCH_SECRET
        )}`;

        const res = await fetch(dispatchUrl, {
          method: "GET",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
        });

        dispatchJson = await res.json().catch(() => null);
      } catch (e) {
        // Don’t fail the request if dispatch call itself errors;
        // the cron will still process it.
        console.warn("[quick-blast] dispatch trigger failed", e);
      }
    }

    return NextResponse.json(
      {
        success: true,
        queued: true,
        organisationId,
        scheduledPostId: created.id,
        note: DISPATCH_SECRET
          ? "Queued and triggered dispatcher."
          : "Queued. Dispatcher secret not set; cron will pick it up shortly.",
        dispatch: dispatchJson, // may be null; UI can ignore
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("[quick-blast] unexpected error", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Quick Blast crashed." },
      { status: 200 }
    );
  }
}
