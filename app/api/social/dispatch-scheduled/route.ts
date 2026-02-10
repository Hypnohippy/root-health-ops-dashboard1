// app/api/social/dispatch-scheduled/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

export const runtime = "nodejs";

// Vercel Cron convention: Authorization: Bearer <CRON_SECRET>
const CRON_SECRET = (process.env.CRON_SECRET || "").trim();

// Kill switch
const DISPATCH_DISABLED = (process.env.DISPATCH_DISABLED || "").trim() === "1";

function norm(v: any) {
  return String(v || "").trim();
}

function mask(s: string) {
  if (!s) return "";
  if (s.length <= 4) return "*".repeat(s.length);
  return `${s.slice(0, 2)}***${s.slice(-2)}`;
}

function originFromReq(req: NextRequest) {
  return new URL(req.url).origin;
}

function isAuthorized(req: NextRequest) {
  // If no secret set, allow (dev/beta mode)
  if (!CRON_SECRET) return { ok: true as const, via: "open" as const };

  const auth = norm(req.headers.get("authorization"));
  if (auth === `Bearer ${CRON_SECRET}`) return { ok: true as const, via: "header" as const };

  // ✅ Allow browser/manual trigger: ?secret=
  const got = norm(req.nextUrl.searchParams.get("secret"));
  if (got && got === CRON_SECRET) return { ok: true as const, via: "query" as const };

  return { ok: false as const, via: "none" as const, auth, got };
}

async function claimScheduledPost(id: string) {
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
  return data;
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
    const auth = isAuthorized(req);
    if (!auth.ok) {
      return NextResponse.json(
        {
          success: false,
          error: "Unauthorized",
          debug: {
            hasCronSecret: !!CRON_SECRET,
            expected: { len: CRON_SECRET.length, masked: mask(CRON_SECRET) },
            gotHeader: auth.auth ? { len: auth.auth.length, masked: mask(auth.auth) } : null,
            gotQuery: auth.got ? { len: auth.got.length, masked: mask(auth.got) } : null,
          },
        },
        { status: 401 }
      );
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
      } catch (e: any) {
        await markBackToScheduled(id, e?.message || "Publish crashed");
        results.push({ id, ok: false, error: e?.message || "Publish crashed (re-queued)" });
      }
    }

    return NextResponse.json({
      success: true,
      authorizedVia: auth.via,
      processed: results.length,
      results,
    });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || "Dispatch failed" }, { status: 500 });
  }
}
