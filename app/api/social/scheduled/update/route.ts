// app/api/social/scheduled/update/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../../lib/supabaseAdmin";

export const runtime = "nodejs";

function okJson(data: any, status = 200) {
  return NextResponse.json(data, { status });
}

function norm(v: any) {
  return String(v || "").trim();
}

function safeArr<T = any>(v: any): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

function safeIso(s: any) {
  const t = String(s || "").trim();
  if (!t) return "";
  const d = new Date(t);
  if (isNaN(d.getTime())) return "";
  return d.toISOString();
}

function isPastIso(iso: string) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return false;
  return d.getTime() < Date.now();
}

/**
 * POST /api/social/scheduled/update
 * Body:
 * {
 *   id: string,
 *   message: string,
 *   scheduled_for: string (ISO),
 *   platforms: string[],
 *   image_url?: string | null,
 *   force_requeue?: boolean
 * }
 *
 * IMPORTANT FIX:
 * - force_requeue now sets status="scheduled" (NOT queued)
 *   because cron dispatch only picks up "scheduled".
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({} as any));

    const id = norm(body?.id);
    const message = norm(body?.message);
    const scheduledFor = safeIso(body?.scheduled_for);
    const platforms = safeArr<string>(body?.platforms)
      .map((p) => norm(p).toLowerCase())
      .filter(Boolean);

    const imageUrlRaw = norm(body?.image_url);
    const image_url = imageUrlRaw ? imageUrlRaw : null;

    const force_requeue = Boolean(body?.force_requeue);

    if (!id) return okJson({ success: false, error: "Missing id" }, 200);
    if (!message) return okJson({ success: false, error: "Message can’t be empty." }, 200);
    if (!scheduledFor) return okJson({ success: false, error: "Missing/invalid scheduled_for" }, 200);
    if (platforms.length === 0) return okJson({ success: false, error: "Pick at least one platform." }, 200);

    if (isPastIso(scheduledFor)) {
      return okJson(
        {
          success: false,
          error:
            "That time is in the past. Scheduled posts won’t fire retroactively. Choose a future time (or use Re-queue +1 min).",
        },
        200
      );
    }

    // Single-tenant: use the most recently created org (more reliable if you accidentally made multiple org rows)
    const { data: org, error: orgErr } = await supabaseAdmin
      .from("organisations")
      .select("id, created_at")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (orgErr || !org?.id) {
      return okJson({ success: false, error: "No organisation found." }, 200);
    }

    const organisationId = String(org.id);

    // Ensure the row exists + belongs to org
    const { data: row, error: readErr } = await supabaseAdmin
      .from("scheduled_posts")
      .select("id, organisation_id, status, meta")
      .eq("id", id)
      .eq("organisation_id", organisationId)
      .maybeSingle();

    if (readErr || !row) {
      return okJson({ success: false, error: "Scheduled post not found." }, 200);
    }

    const nowIso = new Date().toISOString();

    const patch: any = {
      message,
      platforms,
      image_url,
      scheduled_for: scheduledFor,
      updated_at: nowIso,
    };

    if (force_requeue) {
      // ✅ Make it schedulable by cron again
      patch.status = "scheduled";
      patch.posted_at = null;
      patch.error_info = null;

      const meta = (row as any)?.meta && typeof (row as any).meta === "object" ? (row as any).meta : {};
      patch.meta = {
        ...meta,
        requeued_at: nowIso,
        requeued_reason: "manual_edit",
      };
    }

    const { error: upErr } = await supabaseAdmin
      .from("scheduled_posts")
      .update(patch)
      .eq("id", id)
      .eq("organisation_id", organisationId);

    if (upErr) return okJson({ success: false, error: upErr.message }, 200);

    return okJson({ success: true }, 200);
  } catch (e: any) {
    return okJson({ success: false, error: e?.message || "Update failed" }, 200);
  }
}
