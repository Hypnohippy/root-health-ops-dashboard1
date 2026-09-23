import { requireOrganisation, requireOwnedRecord, accessErrorResponse } from "@/lib/tenantAuth";
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

function originFromReq(req: NextRequest) {
  return process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || new URL(req.url).origin;
}

// Match the “uuid-like” check used in your log-event route (safe, permissive)
function safeUuidLike(s: any) {
  const v = String(s || "").trim();
  if (!v) return null;
  if (!/^[0-9a-fA-F-]{16,}$/.test(v)) return null;
  return v;
}

function normaliseMediaUrl(raw: any) {
  const s = String(raw || "").trim();
  if (!s) return "";

  // strip placeholder junk if it ever gets into payloads
  if (s === "PASTE_THE_IMAGE_URL_HERE") return "";
  if (s.toLowerCase().includes("paste_the_image_url_here")) return "";

  // only allow http(s)
  if (!/^https?:\/\//i.test(s)) return "";

  return s;
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

    // ✅ Accept both styles, and clean placeholders/non-http
    const imageUrl = normaliseMediaUrl(body?.imageUrl || body?.image_url);
    const videoUrl = normaliseMediaUrl(body?.videoUrl || body?.video_url);

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

    const { organisationId } = await requireOrganisation(organisationIdFromBody);
    await requireOwnedRecord("growth_experiments", experimentId, organisationId);
    if (!organisationId) {
      return NextResponse.json(
        { success: false, error: "No organisation found. Create an organisation row first (or pass organisationId)." },
        { status: 200 }
      );
    }

    const nowIso = new Date().toISOString();

    // ✅ Quick Blast queues into scheduled_posts with scheduled_for = now
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

    // ✅ Log Growth Lab event (optional)
    if (experimentId) {
      try {
        const contentPreview = String(message || "").slice(0, 400);

        const rows = platforms.map((p) => ({
          organisation_id: organisationId,
          experiment_id: experimentId,
          platform: p,
          action: "queued",
          ok: true,
          external_post_id: String(created.id),
          content_preview: contentPreview || null,
          meta: {
            source: "quick_blast",
            scheduled_post_id: created.id,
            has_image: !!imageUrl,
            has_video: !!videoUrl,
          },
        }));

        const { error: logErr } = await supabaseAdmin.from("growth_experiment_events").insert(rows);
        if (logErr) console.warn("[quick-blast] growth_experiment_events insert failed", logErr);
      } catch (e) {
        console.warn("[quick-blast] growth log-event crashed", e);
      }
    }

    // Trigger dispatcher immediately (optional)
    let dispatchJson: any = null;

    if (CRON_SECRET) {
      try {
        const origin = originFromReq(req);
        const dispatchUrl = `${origin}/api/social/dispatch-scheduled?organisationId=${encodeURIComponent(organisationId)}`;

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
        note: CRON_SECRET ? "Queued and triggered dispatcher." : "Queued. Publishing is unavailable until CRON_SECRET is configured.",
        dispatch: dispatchJson,
        userMessage: "Sent.",
      },
      { status: 200 }
    );
  } catch (err: any) {
    const denied = accessErrorResponse(err);
    if (denied) return denied;
    console.error("[quick-blast] unexpected error", err);
    return NextResponse.json({ success: false, error: err?.message || "Quick Blast crashed." }, { status: 200 });
  }
}
