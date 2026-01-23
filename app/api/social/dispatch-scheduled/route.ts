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
      .limit(20);

    if (error) {
      console.error("[dispatch-scheduled] fetch error", error);
      return NextResponse.json(
        { success: false, error: "DB error fetching scheduled posts." },
        { status: 200 }
      );
    }

    if (!items || items.length === 0) {
      return NextResponse.json(
        { success: true, scanned: 0, due: 0, dispatched: 0, failed: 0, failures: [] },
        { status: 200 }
      );
    }

    const failures: any[] = [];
    let dispatchedCount = 0;

    // 2) Dispatch each due item via YOUR social engine (Quick Blast)
    for (const item of items as any[]) {
      const id = item.id as string;
      const organisationId = String(item.organisation_id || "").trim();
      const message: string = String(item.message || "");
      const platforms: string[] = Array.isArray(item.platforms) ? item.platforms : [];
      const imageUrl: string = item.image_url ? String(item.image_url) : "";

      try {
        const qbRes = await fetch(`${baseUrl(req)}/api/social/quick-blast?organisationId=${encodeURIComponent(organisationId)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          body: JSON.stringify({
            message,
            platforms,
            imageUrl: imageUrl || undefined,
          }),
        });

        const qbJson: any = await qbRes.json().catch(() => null);

        const ok = !!qbJson?.success && Array.isArray(qbJson?.results) && qbJson.results.every((r: any) => r?.ok || r?.skipped);

        if (!ok) {
          // Mark failed (and store error_info)
          await supabaseAdmin
            .from("scheduled_posts")
            .update({
              status: "failed",
              error_info: qbJson || { error: "Quick Blast failed", status: qbRes.status },
            })
            .eq("id", id);

          failures.push({
            id,
            organisationId,
            statusCode: qbRes.status,
            error: qbJson,
          });

          continue;
        }

        // Mark sent only when Quick Blast actually succeeded
        await supabaseAdmin
          .from("scheduled_posts")
          .update({
            status: "sent",
            posted_at: new Date().toISOString(),
            error_info: qbJson, // keep proof of results (optional but useful)
          })
          .eq("id", id);

        dispatchedCount += 1;
      } catch (e: any) {
        console.error("[dispatch-scheduled] exception dispatching item", id, e);

        await supabaseAdmin
          .from("scheduled_posts")
          .update({
            status: "failed",
            error_info: { error: String(e?.message || e) },
          })
          .eq("id", id);

        failures.push({ id, organisationId, error: String(e?.message || e) });
      }
    }

    return NextResponse.json(
      {
        success: failures.length === 0,
        scanned: items.length,
        due: items.length,
        dispatched: dispatchedCount,
        failed: failures.length,
        failures,
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("[dispatch-scheduled] fatal error", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Internal error running dispatcher." },
      { status: 200 }
    );
  }
}
