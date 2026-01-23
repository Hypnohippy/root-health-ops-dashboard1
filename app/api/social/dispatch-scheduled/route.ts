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

    // 1) Find due scheduled posts (Supabase)
    const { data: items, error } = await supabaseAdmin
      .from("scheduled_posts")
      .select("id, organisation_id, message, platforms, image_url, scheduled_for, status")
      .eq("status", "scheduled")
      .lte("scheduled_for", nowIso)
      .order("scheduled_for", { ascending: true })
      .limit(20);

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
        { success: true, scanned, due: 0, dispatched: 0, failed: 0, failures: [] },
        { status: 200 }
      );
    }

    let dispatchedCount = 0;
    const failures: any[] = [];

    for (const item of items as any[]) {
      const id = String(item.id);
      const organisationId = String(item.organisation_id);
      const message = String(item.message || "");
      const platforms = Array.isArray(item.platforms) ? item.platforms : [];
      const imageUrl = item.image_url ? String(item.image_url) : "";

      // 2) Dispatch using your internal social engine (connected tokens)
      // We reuse /api/social/quick-blast because it already posts via your saved social_accounts
      const dispatchUrl = `${baseUrl(req)}/api/social/quick-blast?organisationId=${encodeURIComponent(
        organisationId
      )}`;

      try {
        const res = await fetch(dispatchUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          body: JSON.stringify({
            message,
            platforms,
            imageUrl: imageUrl || undefined,
          }),
        });

        const data = await res.json().catch(() => null);

        if (!res.ok || !data?.results) {
          failures.push({ id, statusCode: res.status, error: data || "Dispatch failed" });

          await supabaseAdmin
            .from("scheduled_posts")
            .update({
              status: "failed",
              error_info: data || { statusCode: res.status, error: "Dispatch failed" },
            })
            .eq("id", id);

          continue;
        }

        const ok = Array.isArray(data.results) && data.results.every((r: any) => r?.ok || r?.skipped);

        if (!ok) {
          failures.push({ id, statusCode: 200, error: data });

          await supabaseAdmin
            .from("scheduled_posts")
            .update({
              status: "failed",
              error_info: data,
            })
            .eq("id", id);

          continue;
        }

        await supabaseAdmin
          .from("scheduled_posts")
          .update({
            status: "sent",
            posted_at: new Date().toISOString(),
            error_info: data, // keep full results for audit
          })
          .eq("id", id);

        dispatchedCount += 1;
      } catch (e: any) {
        failures.push({ id, error: String(e) });

        await supabaseAdmin
          .from("scheduled_posts")
          .update({
            status: "failed",
            error_info: { error: String(e) },
          })
          .eq("id", id);
      }
    }

    return NextResponse.json(
      {
        success: failures.length === 0,
        scanned,
        due: scanned,
        dispatched: dispatchedCount,
        failed: failures.length,
        failures,
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("[dispatch-scheduled] fatal error", err);
    return NextResponse.json(
      { success: false, error: "Internal error running dispatcher." },
      { status: 200 }
    );
  }
}
