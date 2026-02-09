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
  return new URL(req.url).origin;
}

async function claimScheduledPost(id: string) {
  // ✅ Atomic claim: only ONE runner can flip scheduled -> sending
  const { data, error } = await supabaseAdmin
    .from("scheduled_posts")
    .update({
      status: "sending",
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("status", "scheduled")
    .select("id, organisation_id, platforms")
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data; // null => already claimed by another run
}

async function markBackToScheduled(id: string, note: string) {
  // If publish crashed in a weird way, you can re-queue instead of losing it
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
    // ✅ Optional secret protection
    if (DISPATCH_SECRET) {
      const got = norm(new URL(req.url).searchParams.get("secret"));
      if (!got || got !== DISPATCH_SECRET) {
        return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
      }
    }

    // ✅ Kill switch
    if (DISPATCH_DISABLED) {
      return NextResponse.json({ success: true, disabled: true, message: "Dispatch disabled" });
    }

    // 1) Find due scheduled posts
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
      const id = norm(row?.id);
      if (!id) continue;

      // 2) Claim it (prevents duplicate posting)
      const claimed = await claimScheduledPost(id);
      if (!claimed) {
        results.push({ id, skipped: true, reason: "Already claimed by another run" });
        continue;
      }

      const organisationId = norm(claimed.organisation_id);
      const platforms = Array.isArray((claimed as any).platforms) ? (claimed as any).platforms : [];

      try {
        // ✅ IMPORTANT: publish/now contract
        // - organisationId must be in querystring
        // - body must contain { id, platforms }
        const publishRes = await fetch(
          `${origin}/api/publish/now?organisationId=${encodeURIComponent(organisationId)}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            cache: "no-store",
            body: JSON.stringify({
              id,
              platforms,
            }),
          }
        );

        const publishJson = await publishRes.json().catch(() => null);

        results.push({
          id,
          ok: publishRes.ok && !!publishJson?.success,
          httpStatus: publishRes.status,
          publish: publishJson,
        });

        // ✅ DO NOT update scheduled_posts status here.
        // publish/now already updates status to "posted" or "failed".
      } catch (e: any) {
        // If publish endpoint crashed before it updated DB, re-queue
        await markBackToScheduled(id, e?.message || "Publish crashed");
        results.push({ id, ok: false, error: e?.message || "Publish crashed (re-queued)" });
      }
    }

    return NextResponse.json({
      success: true,
      processed: results.length,
      results,
      note: "Dispatcher now CLAIMS scheduled posts before calling publish/now, preventing duplicate posting.",
    });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || "Dispatch failed" }, { status: 500 });
  }
}
