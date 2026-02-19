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

async function claimScheduledPost(id: string) {
  const nowIso = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from("scheduled_posts")
    .update({ status: "pending", updated_at: nowIso })
    .eq("id", id)
    .in("status", ["queued", "scheduled"])
    .select("id, organisation_id, platforms")
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data;
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
        results.push({ id, ok: false, error: e?.message || "Publish crashed (re-queued)" });
      }
    }

    return NextResponse.json({ success: true, processed: results.length, now: nowIso, results });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || "Dispatch failed" }, { status: 500 });
  }
}
