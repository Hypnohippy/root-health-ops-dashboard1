// app/api/social/dispatch-scheduled/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

export const runtime = "nodejs";

const DISPATCH_SECRET = (process.env.DISPATCH_SECRET || "").trim();
const DISPATCH_DISABLED = (process.env.DISPATCH_DISABLED || "").trim() === "1";

function norm(v: any) {
  return String(v || "").trim();
}

function originFromReq(req: NextRequest) {
  const url = new URL(req.url);
  return url.origin;
}

async function claimScheduledPost(id: string) {
  // ✅ Claim atomically so only ONE dispatcher run can send it
  // We only claim if it's still scheduled.
  const { data, error } = await supabaseAdmin
    .from("scheduled_posts")
    .update({
      status: "sending",
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("status", "scheduled")
    .select("*")
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data; // null means someone else already claimed it
}

async function markSent(id: string, metaPatch: any) {
  const { error } = await supabaseAdmin
    .from("scheduled_posts")
    .update({
      status: "sent",
      updated_at: new Date().toISOString(),
      meta: metaPatch,
    })
    .eq("id", id);

  if (error) throw new Error(error.message);
}

async function markFailed(id: string, metaPatch: any) {
  const { error } = await supabaseAdmin
    .from("scheduled_posts")
    .update({
      status: "failed",
      updated_at: new Date().toISOString(),
      meta: metaPatch,
    })
    .eq("id", id);

  if (error) throw new Error(error.message);
}

export async function GET(req: NextRequest) {
  try {
    // ✅ Optional secret protection
    if (DISPATCH_SECRET) {
      const got = norm(new URL(req.url).searchParams.get("secret"));
      if (!got || got !== DISPATCH_SECRET) {
        return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
      }
    }

    // ✅ Kill switch (so you can stop the cron instantly)
    if (DISPATCH_DISABLED) {
      return NextResponse.json({ success: true, disabled: true, message: "Dispatch disabled" });
    }

    // Pull due scheduled posts
    const { data: due, error } = await supabaseAdmin
      .from("scheduled_posts")
      .select("*")
      .eq("status", "scheduled")
      .lte("scheduled_for", new Date().toISOString())
      .order("scheduled_for", { ascending: true })
      .limit(10);

    if (error) throw new Error(error.message);

    const origin = originFromReq(req);
    const results: any[] = [];

    for (const row of due || []) {
      const id = norm(row?.id);
      if (!id) continue;

      // ✅ Claim it (prevents duplicates)
      const claimed = await claimScheduledPost(id);
      if (!claimed) {
        results.push({ id, skipped: true, reason: "Already claimed by another run" });
        continue;
      }

      const organisationId = norm(claimed.organisation_id);
      const message = norm(claimed.message);
      const platforms = Array.isArray(claimed.platforms) ? claimed.platforms : [];
      const imageUrl = claimed.image_url || null;
      const videoUrl = claimed?.meta?.video_url || null;

      try {
        // ✅ Use your existing publisher endpoint
        const publishRes = await fetch(`${origin}/api/publish/now`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          body: JSON.stringify({
            organisationId,
            message,
            platforms,
            imageUrl,
            videoUrl,
            scheduledPostId: id,
          }),
        });

        const publishJson = await publishRes.json().catch(() => null);

        const metaPatch = {
          ...(claimed.meta || {}),
          dispatch: {
            at: new Date().toISOString(),
            ok: publishRes.ok,
            status: publishRes.status,
            result: publishJson,
          },
        };

        if (!publishRes.ok || publishJson?.success === false) {
          await markFailed(id, metaPatch);
          results.push({ id, ok: false, status: publishRes.status, result: publishJson });
          continue;
        }

        await markSent(id, metaPatch);
        results.push({ id, ok: true, status: publishRes.status, result: publishJson });
      } catch (e: any) {
        const metaPatch = {
          ...(claimed.meta || {}),
          dispatch: {
            at: new Date().toISOString(),
            ok: false,
            error: e?.message || "Publish crashed",
          },
        };
        await markFailed(id, metaPatch);
        results.push({ id, ok: false, error: e?.message || "Publish crashed" });
      }
    }

    return NextResponse.json({
      success: true,
      processed: results.length,
      results,
      note: "Idempotent dispatcher: claims scheduled_posts before publishing to prevent duplicates.",
    });
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message || "Dispatch failed" },
      { status: 500 }
    );
  }
}
