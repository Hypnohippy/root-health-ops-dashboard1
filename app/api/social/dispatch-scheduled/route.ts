// app/api/social/dispatch-scheduled/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

export const runtime = "nodejs";

const CRON_SECRET = (process.env.CRON_SECRET || "").trim();
const DISPATCH_DISABLED = (process.env.DISPATCH_DISABLED || "").trim() === "1";

function norm(v: any) {
  return String(v || "").trim();
}

function originFromReq(req: NextRequest) {
  return new URL(req.url).origin;
}

function isAuthorized(req: NextRequest) {
  if (!CRON_SECRET) return true;
  const auth = norm(req.headers.get("authorization"));
  return auth === `Bearer ${CRON_SECRET}`;
}

function safeUuidLike(s: any) {
  const v = String(s || "").trim();
  if (!v) return null;
  if (!/^[0-9a-fA-F-]{16,}$/.test(v)) return null;
  return v;
}

function extractExternalPostId(r: any): string | null {
  const v = String(r?.id || r?.post_id || r?.postId || r?.details?.id || "").trim();
  return v || null;
}

function extractFriendlyErrorFromPublishResult(r: any): string | null {
  if (!r) return null;

  const um = String(r?.userMessage || "").trim();
  if (um) return um;

  const metaUserMsg = r?.details?.error?.error_user_msg || r?.error?.error_user_msg;
  if (metaUserMsg) return String(metaUserMsg);

  const metaTitle = r?.details?.error?.error_user_title || r?.error?.error_user_title;
  const metaMessage = r?.details?.error?.message || r?.error?.message;
  if (metaTitle && metaMessage) return `${metaTitle}: ${metaMessage}`;
  if (metaMessage) return String(metaMessage);

  const err = r?.error;
  if (typeof err === "string" && err.trim()) return err.trim();
  if (err && typeof err === "object" && (err as any)?.message) return String((err as any).message);

  const reason = String(r?.reason || "").trim();
  if (reason) return reason;

  return null;
}

async function claimScheduledPost(id: string) {
  const nowIso = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from("scheduled_posts")
    .update({ status: "pending", updated_at: nowIso })
    .eq("id", id)
    .in("status", ["queued", "scheduled"])
    // ✅ include meta + message so we can log experiment events cleanly
    .select("id, organisation_id, platforms, meta, message")
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data as any;
}

async function markBackToQueued(id: string, note: string) {
  const nowIso = new Date().toISOString();

  const { data: current } = await supabaseAdmin
    .from("scheduled_posts")
    .select("meta")
    .eq("id", id)
    .maybeSingle();

  const meta = current?.meta && typeof current.meta === "object" ? (current.meta as any) : {};

  const { error } = await supabaseAdmin
    .from("scheduled_posts")
    .update({
      status: "queued",
      updated_at: nowIso,
      meta: { ...meta, dispatch_error: note, dispatch_error_at: nowIso },
    })
    .eq("id", id);

  if (error) console.error("[dispatch] failed to set back to queued", error);
}

/**
 * ✅ Log “published” outcome back to Growth Lab (science reflection loop)
 * Uses scheduled_posts.meta.experiment_id that you already persist in Quick Blast / Schedule.
 */
async function logPublishOutcomeToExperiment(params: {
  organisationId: string | null;
  scheduledPostId: string;
  scheduledPostMeta: any;
  message: string | null;
  publishJson: any;
  ok: boolean;
}) {
  try {
    const orgId = safeUuidLike(params.organisationId);
    if (!orgId) return;

    const meta = params.scheduledPostMeta && typeof params.scheduledPostMeta === "object" ? params.scheduledPostMeta : {};
    const expId = safeUuidLike(meta?.experiment_id || meta?.experimentId);
    if (!expId) return; // only log when linked to an experiment

    const contentPreview = String(params.message || "").slice(0, 400);

    // publish/now commonly returns { results: [{ platform, ok, id?, error? ...}], summary: ... }
    const perPlatform = Array.isArray(params.publishJson?.results) ? params.publishJson.results : [];

    // Fallback if publishJson has no per-platform list
    const attempts =
      perPlatform.length > 0
        ? perPlatform
        : [
            {
              platform: null,
              ok: params.ok,
              error: !params.ok ? (params.publishJson?.error || "Publish failed") : null,
            },
          ];

    const rows = attempts.map((r: any) => ({
      organisation_id: orgId,
      experiment_id: expId,
      platform: String(r?.platform || "").trim() || null,
      action: "published",
      ok: !!r?.ok,
      external_post_id: extractExternalPostId(r) || null,
      content_preview: contentPreview || null,
      meta: {
        source: "dispatch_scheduled",
        scheduled_post_id: params.scheduledPostId,
        summary: params.publishJson?.summary || null,
        publish_error: !r?.ok ? extractFriendlyErrorFromPublishResult(r) : null,
        raw: r || null,
      },
    }));

    const { error } = await supabaseAdmin.from("growth_experiment_events").insert(rows);
    if (error) {
      console.warn("[dispatch] growth_experiment_events insert failed", error);
    }
  } catch (e) {
    console.warn("[dispatch] logPublishOutcomeToExperiment crashed", e);
  }
}

export async function GET(req: NextRequest) {
  try {
    if (!isAuthorized(req)) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    if (DISPATCH_DISABLED) {
      return NextResponse.json({ success: true, disabled: true, message: "Dispatch disabled" });
    }

    const nowIso = new Date().toISOString();

    const { data: due, error } = await supabaseAdmin
      .from("scheduled_posts")
      .select("id, organisation_id, scheduled_for, status")
      .in("status", ["queued", "scheduled"])
      .lte("scheduled_for", nowIso)
      .order("scheduled_for", { ascending: true })
      .limit(10);

    if (error) throw new Error(error.message);

    const origin = originFromReq(req);
    const results: any[] = [];

    for (const row of due || []) {
      const id = norm((row as any)?.id);
      if (!id) continue;

      const claimed = await claimScheduledPost(id);
      if (!claimed) {
        results.push({ id, skipped: true, reason: "Already claimed by another run" });
        continue;
      }

      const organisationId = norm((claimed as any).organisation_id);
      const platforms = Array.isArray((claimed as any).platforms) ? (claimed as any).platforms : [];

      try {
        const publishRes = await fetch(
          `${origin}/api/publish/now?organisationId=${encodeURIComponent(organisationId)}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            cache: "no-store",
            body: JSON.stringify({ id, platforms }),
          }
        );

        const publishJson = await publishRes.json().catch(() => null);

        const ok = publishRes.ok && !!publishJson?.success;

        // ✅ Most important change: return a meaningful error + include publishJson
        const err =
          publishJson?.error ||
          publishJson?.error_info?.error ||
          publishJson?.results?.find?.((r: any) => r && r.ok === false)?.error ||
          publishJson?.results?.find?.((r: any) => r && r.ok === false)?.userMessage ||
          (!ok ? "Publish failed (no error returned)" : null);

        // ✅ NEW: log the real publish outcome to Growth Lab (if experiment_id exists in meta)
        await logPublishOutcomeToExperiment({
          organisationId,
          scheduledPostId: id,
          scheduledPostMeta: (claimed as any)?.meta || null,
          message: (claimed as any)?.message || null,
          publishJson,
          ok,
        });

        results.push({
          id,
          ok,
          httpStatus: publishRes.status,
          summary: publishJson?.summary || null,
          error: err,
          publish: publishJson || null, // ✅ so you can SEE the per-platform failures in QB response
        });
      } catch (e: any) {
        await markBackToQueued(id, e?.message || "Publish crashed");

        // We can also log a “published=false” outcome if experiment is linked (optional)
        try {
          await logPublishOutcomeToExperiment({
            organisationId,
            scheduledPostId: id,
            scheduledPostMeta: (claimed as any)?.meta || null,
            message: (claimed as any)?.message || null,
            publishJson: { success: false, error: e?.message || "Publish crashed" },
            ok: false,
          });
        } catch {}

        results.push({ id, ok: false, error: e?.message || "Publish crashed (re-queued)" });
      }
    }

    return NextResponse.json({ success: true, processed: results.length, now: nowIso, results });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || "Dispatch failed" }, { status: 500 });
  }
}
