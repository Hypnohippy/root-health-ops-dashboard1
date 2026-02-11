// app/api/social/dispatch-scheduled/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

export const runtime = "nodejs";

// Vercel Cron will automatically send: Authorization: Bearer <CRON_SECRET>
const CRON_SECRET = (process.env.CRON_SECRET || "").trim();

// Kill switch
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

async function claimScheduledPost(id: string) {
  // ✅ Atomic claim: scheduled -> queued (allowed by your constraint)
  const { data, error } = await supabaseAdmin
    .from("scheduled_posts")
    .update({
      status: "queued",
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("status", "scheduled")
    .select("id, organisation_id, platforms")
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data; // null => already claimed
}

async function markBackToScheduled(id: string, note: string) {
  const { error } = await supabaseAdmin
    .from("scheduled_posts")
    .update({
      status: "scheduled",
      updated_at: new Date().toISOString(),
      meta: { dispatch_error: note, at: new Date().toISOString() },
    })
    .eq("id", id);

  if (error) console.error("[dispatch] failed to re-queue", error);
}

export async function GET(req: NextRequest) {
  try {
    if (!isAuthorized(req)) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    if (DISPATCH_DISABLED) {
      return NextResponse.json({ success: true, disabled: true, message: "Dispatch disabled" });
    }

    const { data: due, error } = await supabaseAdmin
      .from("scheduled_posts")
      .select("id, organisation_id, scheduled_for, status")
      .eq("status", "scheduled")
      .lte("scheduled_for", new Date().toISOString())
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

        results.push({
          id,
          ok: publishRes.ok && !!publishJson?.success,
          httpStatus: publishRes.status,
          publish: publishJson,
        });

        // publish/now will set status to posted/failed
      } catch (e: any) {
        await markBackToScheduled(id, e?.message || "Publish crashed");
        results.push({ id, ok: false, error: e?.message || "Publish crashed (re-queued)" });
      }
    }

    return NextResponse.json({
      success: true,
      processed: results.length,
      results,
      authorizedVia: CRON_SECRET ? "header" : "none",
    });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || "Dispatch failed" }, { status: 500 });
  }
}
