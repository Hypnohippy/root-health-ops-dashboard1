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

  const user_id =
    input.user_id ?? input.userId ?? input.id ?? input.uid ?? null;
  const name =
    input.name ??
    input.full_name ??
    input.fullName ??
    input.display_name ??
    null;
  const email = input.email ?? null;

  const out: CreatedBy = {
    user_id: user_id ? String(user_id) : null,
    name: name ? String(name) : null,
    email: email ? String(email) : null,
  };

  if (!out.user_id && !out.name && !out.email) return null;
  return out;
}

function isMissingColumnError(err: any) {
  const msg = String(err?.message || err?.hint || "").toLowerCase();
  // Postgres / Supabase style messages typically include “column ... does not exist”
  return msg.includes("does not exist") && msg.includes("column");
}

function safeString(v: any) {
  const s = String(v ?? "").trim();
  return s ? s : null;
}

function safeArrayStrings(v: any) {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => String(x ?? "").trim())
    .filter(Boolean);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({} as any));

    const message: string | undefined = body.message;
    const platformsRaw: any = body.platforms;
    const imageUrl: string | undefined = body.imageUrl;
    const scheduledAt: string | undefined = body.scheduledAt;
    const organisationId: string | undefined = body.organisationId;

    // Optional series / sequence fields
    const sequenceId: string | undefined = body.sequenceId || body.sequence_id;
    const metaIncoming: any = body.meta;

    // “Coach analytics” fields (optional)
    const campaignId =
      body.campaignId ||
      body.campaign_id ||
      metaIncoming?.campaign_id ||
      metaIncoming?.campaignId;

    const campaignName =
      body.campaignName ||
      body.campaign_name ||
      metaIncoming?.campaign_name ||
      metaIncoming?.campaignName;

    const goal = body.goal || metaIncoming?.goal; // awareness | bookings | dms | clicks | retention
    const ctaType = body.ctaType || body.cta_type || metaIncoming?.cta_type || metaIncoming?.ctaType;
    const hookType = body.hookType || body.hook_type || metaIncoming?.hook_type || metaIncoming?.hookType;
    const topic = body.topic || metaIncoming?.topic;
    const audience = body.audience || metaIncoming?.audience;

    // Created-by accepted in multiple shapes
    const createdBy =
      normalizeCreatedBy(body.createdBy) ||
      normalizeCreatedBy(body.created_by) ||
      normalizeCreatedBy(metaIncoming?.created_by) ||
      normalizeCreatedBy(metaIncoming?.createdBy) ||
      normalizeCreatedBy(metaIncoming?.poster) ||
      null;

    // 1) Basic validation
    if (!message || typeof message !== "string" || !message.trim()) {
      return NextResponse.json(
        { success: false, error: "Message is required." },
        { status: 200 }
      );
    }

    const platforms = safeArrayStrings(platformsRaw);
    if (platforms.length === 0) {
      return NextResponse.json(
        { success: false, error: "At least one platform is required." },
        { status: 200 }
      );
    }

    if (!scheduledAt) {
      return NextResponse.json(
        { success: false, error: "A scheduledAt date is required." },
        { status: 200 }
      );
    }

    const date = new Date(scheduledAt);
    if (isNaN(date.getTime())) {
      return NextResponse.json(
        { success: false, error: "Scheduled date/time is invalid." },
        { status: 200 }
      );
    }

    if (!organisationId) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Missing organisation context while scheduling. Please contact support if this persists.",
        },
        { status: 200 }
      );
    }

    // 2) Merge meta safely (do not wipe existing meta)
    const metaMerged: any =
      metaIncoming && typeof metaIncoming === "object" ? { ...metaIncoming } : {};

    // Stamp created_by if present
    if (createdBy) {
      metaMerged.created_by = {
        user_id: createdBy.user_id ?? null,
        name: createdBy.name ?? null,
        email: createdBy.email ?? null,
      };
    }

    // Always store “coach analytics” inside meta (so it works even before columns exist)
    // (This makes Metrics coaching possible immediately.)
    metaMerged.coach = {
      ...(metaMerged.coach && typeof metaMerged.coach === "object"
        ? metaMerged.coach
        : {}),
      campaign_id: safeString(campaignId),
      campaign_name: safeString(campaignName),
      goal: safeString(goal),
      cta_type: safeString(ctaType),
      hook_type: safeString(hookType),
      topic: safeString(topic),
      audience: safeString(audience),
    };

    // 3) Build base insert payload (known existing columns)
    const baseInsertPayload: Record<string, any> = {
      organisation_id: organisationId,
      message: message.trim(),
      platforms,
      image_url: imageUrl || null,
      scheduled_for: date.toISOString(),
      status: "scheduled",
      meta: Object.keys(metaMerged).length ? metaMerged : null,
    };

    // Only set if provided (existing in your DB already)
    if (sequenceId && typeof sequenceId === "string" && sequenceId.trim()) {
      baseInsertPayload.sequence_id = sequenceId.trim();
    }

    // If meta includes series info, store it neatly too (existing in your file)
    if (metaMerged && typeof metaMerged === "object") {
      if (typeof metaMerged.part === "number") baseInsertPayload.series_part = metaMerged.part;
      if (typeof metaMerged.total === "number") baseInsertPayload.series_total = metaMerged.total;
    }

    // 4) Try “enhanced insert” (only works if you added those columns)
    const enhancedInsertPayload: Record<string, any> = {
      ...baseInsertPayload,
      campaign_id: safeString(campaignId),
      campaign_name: safeString(campaignName),
      goal: safeString(goal),
      cta_type: safeString(ctaType),
      hook_type: safeString(hookType),
      topic: safeString(topic),
      audience: safeString(audience),
    };

    // Remove nulls so we don’t write meaningless values
    Object.keys(enhancedInsertPayload).forEach((k) => {
      if (enhancedInsertPayload[k] === null || enhancedInsertPayload[k] === undefined) {
        delete enhancedInsertPayload[k];
      }
    });

    let inserted: any = null;

    // Attempt 1: enhanced insert
    {
      const { data, error } = await supabaseAdmin
        .from("scheduled_posts")
        .insert(enhancedInsertPayload)
        .select()
        .single();

      if (!error && data) {
        inserted = data;
      } else if (error && isMissingColumnError(error)) {
        // Attempt 2: fallback to base insert (no extra columns)
        const retry = await supabaseAdmin
          .from("scheduled_posts")
          .insert(baseInsertPayload)
          .select()
          .single();

        if (retry.error || !retry.data) {
          console.error("[schedule] insert error (fallback failed)", retry.error);
          return NextResponse.json(
            {
              success: false,
              error: `Could not save your scheduled post (DB: ${
                (retry.error as any)?.message ||
                JSON.stringify(retry.error) ||
                "unknown error"
              }).`,
            },
            { status: 200 }
          );
        }

        inserted = retry.data;
      } else {
        console.error("[schedule] insert error", error);
        return NextResponse.json(
          {
            success: false,
            error: `Could not save your scheduled post (DB: ${
              (error as any)?.message || JSON.stringify(error) || "unknown error"
            }).`,
          },
          { status: 200 }
        );
      }
    }

    // 5) Try to log an event (won’t break if table/columns differ)
    // We’ll log per-platform events so Metrics can show “what worked where”.
    try {
      const postId = inserted?.id || inserted?.post_id || null;
      if (postId) {
        const rows = platforms.map((p) => ({
          organisation_id: organisationId,
          post_id: postId,
          platform: p,
          event_type: "scheduled",
        }));

        const ev = await supabaseAdmin.from("post_events").insert(rows);
        if (ev.error) {
          // If post_events table doesn’t match, just skip quietly
          // (we don’t want scheduling to fail because analytics is mid-build)
          console.warn("[schedule] post_events insert skipped", ev.error?.message || ev.error);
        }
      }
    } catch (e) {
      console.warn("[schedule] post_events insert skipped (exception)", e);
    }

    return NextResponse.json(
      { success: true, scheduled: true, item: inserted },
      { status: 200 }
    );
  } catch (err) {
    console.error("[schedule] unexpected error", err);
    return NextResponse.json(
      { success: false, error: "Internal server error in /api/social/schedule." },
      { status: 200 }
    );
  }
}
