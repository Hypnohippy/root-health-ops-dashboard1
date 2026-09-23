import { requireOrganisation, accessErrorResponse, publishingHeaders } from "@/lib/tenantAuth";
// app/api/publish/run/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

export const runtime = "nodejs";

/**
 * Queue Runner v2 (REAL):
 * - Finds queued posts that are due (scheduled_for <= now)
 * - For each item, calls /api/publish/now (your real publisher)
 * - /api/publish/now writes dispatch results into scheduled_posts.error_info.results
 *
 * Added:
 * - GET support so you can run it from the browser:
 *   /api/publish/run?mode=real&limit=10
 */

type ProviderId =
  | "facebook"
  | "instagram"
  | "tiktok"
  | "linkedin"
  | "google"
  | "email"
  | "whatsapp"
  | "threads";

type RunMode = "simulate" | "real";

function norm(v: any) {
  return String(v ?? "").trim();
}

function toPlatformList(raw: any): ProviderId[] {
  return (Array.isArray(raw) ? raw : [])
    .map((p: any) => String(p || "").toLowerCase().trim())
    .filter(Boolean) as ProviderId[];
}

function originFromReq(req: NextRequest) {
  return process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || req.nextUrl.origin;
}

async function runOnce(req: NextRequest, opts: { organisationId?: string; limit?: number; mode?: RunMode }) {
  let organisationId: string;
  try {
    ({ organisationId } = await requireOrganisation(opts.organisationId));
  } catch (error) {
    return accessErrorResponse(error) || NextResponse.json({ error: "Authorization failed" }, { status: 500 });
  }

  const limit = Math.min(Math.max(Number(opts.limit || 10), 1), 50);
  const mode: RunMode = (opts.mode || "simulate") as RunMode;

  const nowIso = new Date().toISOString();

  // Pull queued items due now
  const { data: items, error: readErr } = await supabaseAdmin
    .from("scheduled_posts")
    .select("id, organisation_id, platforms, scheduled_for, status")
    .eq("organisation_id", organisationId)
    .eq("status", "queued")
    .lte("scheduled_for", nowIso)
    .order("scheduled_for", { ascending: true })
    .limit(limit);

  if (readErr) {
    console.error("[publish/run] read error", readErr);
    return NextResponse.json({ ok: false, error: "DB read error." }, { status: 200 });
  }

  const list = Array.isArray(items) ? items : [];
  if (list.length === 0) {
    return NextResponse.json(
      { ok: true, organisationId, processed: 0, note: "No queued items due right now." },
      { status: 200 }
    );
  }

  const origin = originFromReq(req);
  const results: any[] = [];

  for (const row of list) {
    const id = norm((row as any)?.id);
    const platforms = toPlatformList((row as any)?.platforms);

    if (!id) continue;

    try {
      if (mode === "simulate") {
        // ✅ Safe demo: mark as posted but DO NOT attempt dispatch
        // (This will not create dispatch results)
        const at = new Date().toISOString();
        const { error: upErr } = await supabaseAdmin
          .from("scheduled_posts")
          .update({
            status: "posted",
            posted_at: at,
            last_attempt_at: at,
            error_info: null,
            meta: {
              publish: { mode: "simulate", ran_at: at, note: "Simulated publish (no external posting)." },
            },
          })
          .eq("id", id)
          .eq("organisation_id", organisationId);

        if (upErr) throw upErr;

        results.push({ id, ok: true, mode: "simulate", note: "Marked posted (simulated). No dispatch results created." });
        continue;
      }

      // ✅ REAL mode: call your real publisher
      // /api/publish/now writes dispatch results into the scheduled_posts row
      const pubRes = await fetch(`${origin}/api/publish/now?organisationId=${encodeURIComponent(organisationId)}`, {
        method: "POST",
        headers: publishingHeaders(req),
        cache: "no-store",
        body: JSON.stringify({
          id,
          platforms: platforms.length ? platforms : ["linkedin"], // fallback just in case
        }),
      });

      const pubJson: any = await pubRes.json().catch(() => null);

      results.push({
        id,
        ok: !!pubJson?.success,
        mode: "real",
        summary: pubJson?.summary || null,
        results: pubJson?.results || null,
        error: pubJson?.error || null,
      });
    } catch (e: any) {
    const denied = accessErrorResponse(e);
    if (denied) return denied;
      const msg = String(e?.message || "Runner failed");

      // Write a runner-level failure so UI has *something* to show
      await supabaseAdmin
        .from("scheduled_posts")
        .update({
          status: "failed",
          last_attempt_at: new Date().toISOString(),
          error_info: {
            runner_error: msg,
          },
          meta: {
            publish: { mode: "real", error: msg },
          },
        })
        .eq("id", id)
        .eq("organisation_id", organisationId);

      results.push({ id, ok: false, mode: "real", error: msg });
    }
  }

  const okCount = results.filter((r) => r.ok).length;
  const failCount = results.filter((r) => !r.ok).length;

  return NextResponse.json(
    {
      ok: true,
      organisationId,
      processed: results.length,
      posted_ok: okCount,
      failed: failCount,
      mode,
      results,
      note:
        mode === "real"
          ? "Real runner executed: it called /api/publish/now for each due item."
          : "Simulated runner executed: no external posting and no dispatch results.",
    },
    { status: 200 }
  );
}

// ✅ GET: make it easy to trigger in the browser
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const mode = (url.searchParams.get("mode") || "simulate") as RunMode;
  const limit = Number(url.searchParams.get("limit") || 10) || 10;
  const organisationId = url.searchParams.get("organisationId") || "";
  return runOnce(req, { organisationId, limit, mode });
}

// ✅ POST: keep API-style usage too
export async function POST(req: NextRequest) {
  const body: any = await req.json().catch(() => ({}));
  return runOnce(req, {
    organisationId: body.organisationId || "",
    limit: body.limit || 10,
    mode: (body.mode || "simulate") as RunMode,
  });
}
