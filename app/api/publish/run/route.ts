// app/api/publish/run/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

export const runtime = "nodejs";

/**
 * Queue Runner v1 (SAFE):
 * - Moves queued posts that are due (scheduled_for <= now) into posted/failed
 * - Does NOT call external APIs yet.
 *
 * Why: you asked for a way to move items out of queued right now,
 * without risking accidental real posting while Threads/TikTok etc are in flux.
 *
 * Later: we swap the “publish simulation” block to your real direct publish function.
 */

type RunBody = {
  organisationId?: string;
  limit?: number;
  mode?: "simulate" | "real";
};

async function getSingleTenantOrganisationId() {
  const { data, error } = await supabaseAdmin.from("organisations").select("id").limit(1);
  if (error) {
    console.error("[publish/run] organisations error", error);
    return null;
  }
  if (!data || data.length === 0) return null;
  return data[0].id as string;
}

function normStatus(s: any) {
  return String(s || "").toLowerCase().trim();
}

export async function POST(req: NextRequest) {
  try {
    const body: RunBody = await req.json().catch(() => ({}));

    let organisationId = String(body.organisationId || "").trim();
    if (!organisationId) {
      const fallback = await getSingleTenantOrganisationId();
      if (fallback) organisationId = fallback;
    }

    if (!organisationId) {
      return NextResponse.json(
        { ok: false, error: "Missing organisationId (and no single-tenant org found)." },
        { status: 200 }
      );
    }

    const limit = Math.min(Math.max(Number(body.limit || 10), 1), 50);

    // IMPORTANT: default to simulate to avoid accidental real posting.
    const mode = (body.mode || "simulate") as "simulate" | "real";

    // Pull queued items due now
    const nowIso = new Date().toISOString();

    const { data: items, error: readErr } = await supabaseAdmin
      .from("scheduled_posts")
      .select("id, organisation_id, message, platforms, image_url, scheduled_for, status, meta")
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

    const results: any[] = [];

    for (const row of list) {
      const id = String((row as any)?.id || "");
      const status = normStatus((row as any)?.status);

      if (!id || status !== "queued") continue;

      const lastAttemptAt = new Date().toISOString();

      try {
        if (mode === "real") {
          /**
           * 🔜 REAL PUBLISH HOOK (next iteration)
           * This is where we will call your existing direct-post publishing logic
           * (the same engine used by Quick Blast / scheduler).
           *
           * For now we keep it disabled by default because you explicitly want
           * stability and controlled demos.
           */
          throw new Error("Real publishing not wired yet (mode=real is disabled in v1).");
        }

        // ✅ SIMULATE success (safe demo mode)
        const nextMeta = {
          ...((row as any)?.meta || {}),
          publish: {
            mode,
            ran_at: lastAttemptAt,
            note: "Simulated publish (safe mode).",
          },
        };

        const { error: upErr } = await supabaseAdmin
          .from("scheduled_posts")
          .update({
            status: "posted",
            posted_at: lastAttemptAt,
            last_attempt_at: lastAttemptAt,
            error_info: null,
            meta: nextMeta,
          })
          .eq("id", id)
          .eq("organisation_id", organisationId);

        if (upErr) throw upErr;

        results.push({ id, ok: true, status: "posted", mode });
      } catch (e: any) {
        const msg = String(e?.message || "Publish failed");

        const nextMeta = {
          ...((row as any)?.meta || {}),
          publish: {
            mode,
            ran_at: lastAttemptAt,
            error: msg,
          },
        };

        await supabaseAdmin
          .from("scheduled_posts")
          .update({
            status: "failed",
            last_attempt_at: lastAttemptAt,
            error_info: msg,
            meta: nextMeta,
          })
          .eq("id", id)
          .eq("organisation_id", organisationId);

        results.push({ id, ok: false, status: "failed", error: msg, mode });
      }
    }

    const okCount = results.filter((r) => r.ok).length;
    const failCount = results.filter((r) => !r.ok).length;

    return NextResponse.json(
      {
        ok: true,
        organisationId,
        processed: results.length,
        posted: okCount,
        failed: failCount,
        mode,
        results,
        note:
          mode === "simulate"
            ? "Safe mode: queued → posted without external posting. Great for demos."
            : "Mode=real requested, but real publish is not wired in v1.",
      },
      { status: 200 }
    );
  } catch (e: any) {
    console.error("[publish/run] fatal", e);
    return NextResponse.json({ ok: false, error: e?.message || "Internal error" }, { status: 200 });
  }
}
