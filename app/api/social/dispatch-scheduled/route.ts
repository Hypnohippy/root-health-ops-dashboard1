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
          dispatches: [],
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
        // Call YOUR posting engine (which uses Supabase social_accounts tokens)
        const url = `${baseUrl(
          req
        )}/api/social/quick-blast?organisationId=${encodeURIComponent(
          organisationId
        )}`;

        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message,
            platforms,
            imageUrl: imageUrl || undefined,
            organisationId, // also pass in body (belt + braces)
          }),
          cache: "no-store",
        });

        const json: any = await res.json().catch(() => null);

        const ok = !!json?.success;

        dispatches.push({
          id,
          organisationId,
          ok,
          platforms,
          summary: json?.summary || null,
          results: json?.results || null,
          error: ok ? null : json?.error || "Dispatch failed",
        });

        if (!ok) {
          failures.push({
            id,
            organisationId,
            error: json?.error || "Dispatch failed",
            details: json,
          });

          await supabaseAdmin
            .from("scheduled_posts")
            .update({
              status: "failed",
              error_info: json || { error: "Dispatch failed" },
            })
            .eq("id", id);

          continue;
        }

        await supabaseAdmin
          .from("scheduled_posts")
          .update({
            status: "sent",
            posted_at: new Date().toISOString(),
            error_info: null,
          })
          .eq("id", id);

        dispatchedCount += 1;
      } catch (e: any) {
        console.error("[dispatch-scheduled] exception", id, e);

        const errMsg = String(e?.message || e);

        failures.push({
          id,
          organisationId,
          error: errMsg,
        });

        dispatches.push({
          id,
          organisationId,
          ok: false,
          platforms,
          summary: null,
          results: null,
          error: errMsg,
        });

        await supabaseAdmin
          .from("scheduled_posts")
          .update({
            status: "failed",
            error_info: { error: errMsg },
          })
          .eq("id", id);
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
