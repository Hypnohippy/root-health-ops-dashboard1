// app/api/social/schedule/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

type CreatedBy = {
  user_id?: string | null;
  name?: string | null;
  email?: string | null;
};

function normalizeCreatedBy(input: any): CreatedBy | null {
  if (!input || typeof input !== "object") return null;

  const user_id = input.user_id ?? input.userId ?? input.id ?? input.uid ?? null;
  const name =
    input.name ?? input.full_name ?? input.fullName ?? input.display_name ?? null;
  const email = input.email ?? null;

  const out: CreatedBy = {
    user_id: user_id ? String(user_id) : null,
    name: name ? String(name) : null,
    email: email ? String(email) : null,
  };

  if (!out.user_id && !out.name && !out.email) return null;
  return out;
}

function s(v: any) {
  const t = String(v ?? "").trim();
  return t || null;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const message: string | undefined = body.message;
    const platforms: string[] | undefined = body.platforms;
    const imageUrl: string | undefined = body.imageUrl;
    const scheduledAt: string | undefined = body.scheduledAt;
    const organisationId: string | undefined = body.organisationId;

    // NEW: campaign/performance columns (all optional)
    const campaignId = s(body.campaignId ?? body.campaign_id);
    const campaignName = s(body.campaignName ?? body.campaign_name);
    const objective = s(body.objective);
    const offer = s(body.offer);
    const audience = s(body.audience);
    const contentPillar = s(body.contentPillar ?? body.content_pillar);
    const contentType = s(body.contentType ?? body.content_type);
    const hook = s(body.hook);
    const cta = s(body.cta);
    const format = s(body.format);
    const source = s(body.source) || "schedule";

    // Existing: optional series / sequence fields
    const sequenceId: string | undefined = body.sequenceId || body.sequence_id;
    const metaIncoming: any = body.meta;

    const createdBy =
      normalizeCreatedBy(body.createdBy) ||
      normalizeCreatedBy(body.created_by) ||
      normalizeCreatedBy(metaIncoming?.created_by) ||
      normalizeCreatedBy(metaIncoming?.createdBy) ||
      normalizeCreatedBy(metaIncoming?.poster) ||
      null;

    if (!message || typeof message !== "string" || !message.trim()) {
      return NextResponse.json({ success: false, error: "Message is required." }, { status: 200 });
    }

    if (!platforms || !Array.isArray(platforms) || platforms.length === 0) {
      return NextResponse.json({ success: false, error: "At least one platform is required." }, { status: 200 });
    }

    if (!scheduledAt) {
      return NextResponse.json({ success: false, error: "A scheduledAt date is required." }, { status: 200 });
    }

    const date = new Date(scheduledAt);
    if (isNaN(date.getTime())) {
      return NextResponse.json({ success: false, error: "Scheduled date/time is invalid." }, { status: 200 });
    }

    if (!organisationId) {
      return NextResponse.json(
        { success: false, error: "Missing organisation context while scheduling. Please contact support if this persists." },
        { status: 200 }
      );
    }

    // Merge meta safely
    const metaMerged: any =
      metaIncoming && typeof metaIncoming === "object" ? { ...metaIncoming } : {};

    if (createdBy) {
      metaMerged.created_by = {
        user_id: createdBy.user_id ?? null,
        name: createdBy.name ?? null,
        email: createdBy.email ?? null,
      };
    }

    const insertPayload: Record<string, any> = {
      organisation_id: organisationId,
      message: message.trim(),
      platforms,
      image_url: imageUrl || null,
      scheduled_for: date.toISOString(),
      status: "scheduled",
      meta: Object.keys(metaMerged).length ? metaMerged : null,

      // NEW columns
      campaign_id: campaignId,
      campaign_name: campaignName,
      objective,
      offer,
      audience,
      content_pillar: contentPillar,
      content_type: contentType,
      hook,
      cta,
      format,
      source,
    };

    if (sequenceId && typeof sequenceId === "string" && sequenceId.trim()) {
      insertPayload.sequence_id = sequenceId.trim();
    }

    if (metaMerged && typeof metaMerged === "object") {
      if (typeof metaMerged.part === "number") insertPayload.series_part = metaMerged.part;
      if (typeof metaMerged.total === "number") insertPayload.series_total = metaMerged.total;
    }

    const { data, error } = await supabaseAdmin
      .from("scheduled_posts")
      .insert(insertPayload)
      .select()
      .single();

    if (error || !data) {
      console.error("[schedule] insert error", error);
      return NextResponse.json(
        { success: false, error: `Could not save your scheduled post (DB: ${(error as any)?.message || "unknown error"}).` },
        { status: 200 }
      );
    }

    return NextResponse.json({ success: true, scheduled: true, item: data }, { status: 200 });
  } catch (err) {
    console.error("[schedule] unexpected error", err);
    return NextResponse.json({ success: false, error: "Internal server error in /api/social/schedule." }, { status: 200 });
  }
}
