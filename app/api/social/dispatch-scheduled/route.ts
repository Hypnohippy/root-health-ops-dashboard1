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

function resolveOrgIdFromEnvOrItem(itemOrgId: string | null) {
  const pinned = (process.env.SINGLE_TENANT_ORG_ID || "").trim();
  if (pinned) return pinned;
  return (itemOrgId || "").trim();
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

    if (!items || items.length === 0) {
      return NextResponse.json(
        { success: true, scanned: 0, due: 0, dispatched: 0, failed: 0, failures: [] },
        { status: 200 }
      );
    }

    let dispatchedCount = 0;
    const failures: any[] = [];

    for (const item of items as any[]) {
      const id = String(item.id || "");
      const itemOrgId = item.organisation_id ? String(item.organisation_id) : null;

      const organisationId = resolveOrgIdFromEnvOrItem(itemOrgId);

      const message: string = String(item.message || "").trim();
      const platforms: string[] = Array.isArray(item.platforms) ? item.platforms : [];
      const imageUrl: string | null = item.image_url ? String(item.image_url) : null;

      if (!id || !organisationId || !message || platforms.length === 0) {
        failures.push({
          id,
          error: "Invalid scheduled_post row (missing id/org/message/platforms).",
        });

        await supabaseAdmin
          .from("scheduled_posts")
          .update({
            status: "failed",
            error_info: { error: "Invalid row data" },
          })
          .eq("id", id);

        continue;
      }

      try {
        // 2) Dispatch using YOUR internal posting endpoint (direct posting)
        const postRes = await fetch(
          `${baseUrl(req)}/api/social/quick-blast?organisationId=${encodeURIComponent(
            organisationId
          )}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              message,
              platforms,
              imageUrl: imageUrl || undefined,
            }),
            cache: "no-store",
          }
        );

        const postJson: any = await postRes.json().catch(() => null);

        // We only mark as SENT if:
        // - response ok
        // - and "summary.failed" is 0
        const failed = Number(postJson?.summary?.failed || 0);
        const ok = Number(postJson?.summary?.ok || 0);

        if (!postRes.ok || !postJson || failed > 0 || ok === 0) {
          const errorInfo = postJson || { status: postRes.status, error: "Posting failed" };

          failures.push({
            id,
            statusCode: postRes.status,
            error: errorInfo,
          });

          await supabaseAdmin
            .from("scheduled_posts")
            .update({
              status: "failed",
              error_info: errorInfo,
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
        console.error("[dispatch-scheduled] exception posting item", id, e);

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
        success: true,
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
