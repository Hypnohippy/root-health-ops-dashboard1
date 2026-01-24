// app/api/social/dispatch-scheduled/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

export const runtime = "nodejs";

function safeBaseUrl(appUrl: string) {
  return (appUrl || "").replace(/\/$/, "");
}

function baseUrl(req: NextRequest) {
  const env = process.env.NEXT_PUBLIC_APP_URL || "";
  if (env) return safeBaseUrl(env);
  return req.nextUrl.origin;
}

export async function GET(req: NextRequest) {
  try {
    const nowIso = new Date().toISOString();

    // 1) Find due scheduled posts
    const { data: items, error } = await supabaseAdmin
      .from("scheduled_posts")
      .select(
        "id, organisation_id, message, platforms, image_url, scheduled_for, status"
      )
      .eq("status", "scheduled")
      .lte("scheduled_for", nowIso)
      .order("scheduled_for", { ascending: true })
      .limit(25);

    if (error) {
      console.error("[dispatch-scheduled] fetch error", error);
      return NextResponse.json(
        { success: false, error: "DB error fetching scheduled posts." },
        { status: 200 }
      );
    }

    const scanned = items?.length || 0;

    if (!items || items.length === 0) {
      return NextResponse.json(
        {
          success: true,
          scanned,
          due: 0,
          dispatched: 0,
          failed: 0,
          failures: [],
        },
        { status: 200 }
      );
    }

    let dispatchedCount = 0;
    const failures: any[] = [];
    const dispatches: any[] = [];

    for (const item of items as any[]) {
      const id = String(item.id);
      const organisationId = String(item.organisation_id);
      const message = String(item.message || "");
      const platforms: string[] = Array.isArray(item.platforms)
        ? item.platforms
        : [];
      const imageUrl: string | null = item.image_url || null;

      try {
        // Call YOUR posting engine (Quick Blast uses Supabase social_accounts tokens)
        const url = `${baseUrl(req)}/api/social/quick-blast?organisationId=${encodeURIComponent(
          organisationId
        )}`;

        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message,
            platforms,
            imageUrl: imageUrl || undefined,
            organisationId, // include in body too (belt + braces)
          }),
          cache: "no-store",
        });

        const json: any = await res.json().catch(() => null);

        // quick-blast returns { success: boolean, results, summary... }
        const ok = !!json?.success;

        // Always store what happened (helps debugging forever)
        dispatches.push({
          id,
          organisationId,
          ok,
          platforms,
          summary: json?.summary || null,
          results: json?.results || null,
        });

        if (!ok) {
          failures.push({
            id,
            organisationId,
            error: json?.error || "Dispatch failed",
            details: json,
          });

          // mark failed
          const { error: updErr } = await supabaseAdmin
            .from("scheduled_posts")
            .update({
              status: "failed",
              error_info: json || { error: "Dispatch failed" },
            })
            .eq("id", id);

          if (updErr) {
            console.error("[dispatch-scheduled] FAILED update->failed", id, updErr);
          }

          continue;
        }

        // ✅ Critical: ensure DB update actually succeeds
        const postedAt = new Date().toISOString();
        const { error: updErr } = await supabaseAdmin
          .from("scheduled_posts")
          .update({
            status: "sent",
            posted_at: postedAt,
            error_info: null,
          })
          .eq("id", id);

        if (updErr) {
          console.error("[dispatch-scheduled] update->sent FAILED", id, updErr);

          // If we posted but couldn't update DB, mark it failed so UI doesn't lie
          failures.push({
            id,
            organisationId,
            error: "Posted successfully but failed to update scheduled_posts status to sent.",
            details: { dbError: updErr, quickBlast: json },
          });

          const { error: updErr2 } = await supabaseAdmin
            .from("scheduled_posts")
            .update({
              status: "failed",
              error_info: {
                error:
                  "Posted successfully but failed to update scheduled_posts status to sent.",
                dbError: updErr,
                quickBlast: json,
              },
            })
            .eq("id", id);

          if (updErr2) {
            console.error("[dispatch-scheduled] update->failed ALSO FAILED", id, updErr2);
          }

          continue;
        }

        dispatchedCount += 1;
      } catch (e: any) {
        console.error("[dispatch-scheduled] exception", id, e);

        failures.push({
          id,
          organisationId,
          error: String(e?.message || e),
        });

        const { error: updErr } = await supabaseAdmin
          .from("scheduled_posts")
          .update({
            status: "failed",
            error_info: { error: String(e?.message || e) },
          })
          .eq("id", id);

        if (updErr) {
          console.error("[dispatch-scheduled] exception update->failed FAILED", id, updErr);
        }
      }
    }

    return NextResponse.json(
      {
        success: true,
        scanned,
        due: scanned,
        dispatched: dispatchedCount,
        failed: failures.length,
        failures,
        dispatches,
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("[dispatch-scheduled] fatal error", err);
    return NextResponse.json(
      {
        success: false,
        error: err?.message || "Internal error running dispatcher.",
      },
      { status: 200 }
    );
  }
}
