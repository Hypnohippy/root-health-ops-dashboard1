// app/api/social/quick-blast/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

export const runtime = "nodejs";

// Use same secret as cron security
const CRON_SECRET = (process.env.CRON_SECRET || "").trim();

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
  "email",
  "whatsapp",
];

async function getSingleTenantOrganisationId() {
  const { data, error } = await supabaseAdmin.from("organisations").select("id").limit(1);
  if (error) {
    console.error("[quick-blast] organisations error", error);
    return null;
  }
  if (!data || data.length === 0) return null;
  return data[0].id as string;
}

function originFromReq(req: NextRequest) {
  return new URL(req.url).origin;
}

// Match the “uuid-like” check used in your log-event route (safe, permissive)
function safeUuidLike(s: any) {
  const v = String(s || "").trim();
  if (!v) return null;
  if (!/^[0-9a-fA-F-]{16,}$/.test(v)) return null;
  return v;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));

    const message: string = (body?.message ?? "").toString();
    const platformsRaw: any[] = Array.isArray(body?.platforms) ? body.platforms : [];

    const organisationIdFromBody =
      typeof body?.organisationId === "string" && body.organisationId.trim()
        ? body.organisationId.trim()
        : null;

    const imageUrl =
      typeof body?.imageUrl === "string" && body.imageUrl.trim() ? body.imageUrl.trim() : "";

    const videoUrl =
      typeof body?.videoUrl === "string" && body.videoUrl.trim() ? body.videoUrl.trim() : "";

    // ✅ Optional Growth Lab tracking (client should send this)
    const experimentId = safeUuidLike(body?.experimentId || body?.experiment_id);

    if (!message.trim()) {
      return NextResponse.json({ success: false, error: "Message is required." }, { status: 200 });
    }

    const platforms = platformsRaw
      .map((p) => String(p || "").toLowerCase().trim())
      .filter(Boolean);

    if (platforms.length === 0) {
      return NextResponse.json({ success: false, error: "Choose at least one platform." }, { status: 200 });
    }

    const invalid = platforms.filter((p) => !ALLOWED_PLATFORMS.includes(p));
    if (invalid.length > 0) {
      return NextResponse.json(
        { success: false, error: `Unsupported platform(s): ${invalid.join(", ")}`, allowed: ALLOWED_PLATFORMS },
        { status: 200 }
      );
    }

    const organisationId = organisationIdFromBody || (await getSingleTenantOrganisationId());
    if (!organisationId) {
      return NextResponse.json(
        { success: false, error: "No organisation found. Create an organisation row first (or pass organisationId)." },
        { status: 200 }
      );
    }

    const nowIso = new Date().toISOString();

    // ✅ For Quick Blast, we still “queue” into scheduled_posts but with scheduled_for = now.
    // publish/now reads meta.video_url and will deliver video properly.
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

        // ✅ Carry experiment ID through the pipeline (safe + optional)
        ...(experimentId ? { experiment_id: experimentId } : {}),
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
        { success: false, error: "Could not queue post for dispatch.", details: (insErr as any)?.message || insErr || null },
        { status: 200 }
      );
    }

    // ✅ Log Growth Lab event: "queued from quick blast" (optional)
    // This creates the audit trail for the experiment → post attempts.
    if (experimentId) {
      try {
        const contentPreview = String(message || "").slice(0, 400);

        const rows = platforms.map((p) => ({
          organisation_id: organisationId,
          experiment_id: experimentId,
          platform: p,
          action: "queued",
          ok: true, // queued successfully
          external_post_id: String(created.id), // scheduled_posts.id (internal id)
          content_preview: contentPreview || null,
          meta: {
            source: "quick_blast",
            scheduled_post_id: created.id,
            has_image: !!imageUrl,
            has_video: !!videoUrl,
          },
        }));

        const { error: logErr } = await supabaseAdmin.from("growth_experiment_events").insert(rows);
        if (logErr) {
          console.warn("[quick-blast] growth_experiment_events insert failed", logErr);
          // do not fail the whole request
        }
      } catch (e) {
        console.warn("[quick-blast] growth log-event crashed", e);
        // do not fail the whole request
      }
    }

    // Trigger dispatcher immediately (optional)
    let dispatchJson: any = null;

    if (CRON_SECRET) {
      try {
        const origin = originFromReq(req);
        const dispatchUrl = `${origin}/api/social/dispatch-scheduled`;

        const res = await fetch(dispatchUrl, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${CRON_SECRET}`,
          },
          cache: "no-store",
        });

        dispatchJson = await res.json().catch(() => null);
      } catch (e) {
        console.warn("[quick-blast] dispatch trigger failed", e);
      }
    }

    return NextResponse.json(
      {
        success: true,
        queued: true,
        organisationId,
        scheduledPostId: created.id,
        experimentId: experimentId || null,
        note: CRON_SECRET ? "Queued and triggered dispatcher." : "Queued. CRON_SECRET not set; cron will pick it up.",
        dispatch: dispatchJson,
        userMessage: "Sent.",
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("[quick-blast] unexpected error", err);
    return NextResponse.json({ success: false, error: err?.message || "Quick Blast crashed." }, { status: 200 });
  }
}
