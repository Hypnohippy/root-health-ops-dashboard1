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

    if (!items || items.length === 0) {
      return NextResponse.json({ success: true, dispatched: 0, failed: 0 }, { status: 200 });
    }

    let dispatchedCount = 0;
    const failures: any[] = [];

    for (const item of items as any[]) {
      const id = item.id as string;
      const organisationId = item.organisation_id as string;
      const message: string = String(item.message || "").trim();
      const platforms: string[] = Array.isArray(item.platforms) ? item.platforms : [];
      const imageUrl: string | null = item.image_url || null;

      if (!organisationId || !message || platforms.length === 0) {
        failures.push({ id, error: "Invalid scheduled post record (missing org/message/platforms)" });
        await supabaseAdmin
          .from("scheduled_posts")
          .update({ status: "failed", error_info: { error: "Invalid record" } })
          .eq("id", id);
        continue;
      }

      try {
        // ✅ Post via YOUR own social engine (Quick Blast)
        const res = await fetch(`${baseUrl(req)}/api/social/quick-blast`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            organisationId,
            message,
            platforms,
            imageUrl: imageUrl || undefined,
          }),
          cache: "no-store",
        });

        const data: any = await res.json().catch(() => null);

        const ok = !!data?.success && Array.isArray(data?.results);
        if (!ok) {
          failures.push({ id, statusCode: res.status, error: data || "Quick Blast failed" });

          await supabaseAdmin
            .from("scheduled_posts")
            .update({
              status: "failed",
              error_info: data || { statusCode: res.status },
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
