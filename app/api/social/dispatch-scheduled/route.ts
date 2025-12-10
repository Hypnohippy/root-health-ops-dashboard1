// app/api/social/dispatch-scheduled/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

const AYRSHARE_API_KEY = process.env.AYRSHARE_API_KEY;

export async function GET(req: NextRequest) {
  if (!AYRSHARE_API_KEY) {
    console.error("Missing AYRSHARE_API_KEY");
    return NextResponse.json(
      { success: false, error: "Missing social engine key." },
      { status: 200 }
    );
  }

  try {
    const now = new Date().toISOString();

    // 1) Find due scheduled posts (limit to avoid stampede)
    const { data: items, error } = await supabaseAdmin
      .from("content_items")
      .select(
        "id, organisation_id, text, platforms, image_url, scheduled_for, status"
      )
      .eq("status", "scheduled")
      .lte("scheduled_for", now)
      .order("scheduled_for", { ascending: true })
      .limit(20);

    if (error) {
      console.error("[dispatch-scheduled] fetch error", error);
      return NextResponse.json(
        { success: false, error: "DB error fetching scheduled items." },
        { status: 200 }
      );
    }

    if (!items || items.length === 0) {
      return NextResponse.json(
        { success: true, dispatched: 0 },
        { status: 200 }
      );
    }

    let dispatchedCount = 0;
    const failures: any[] = [];

    for (const item of items) {
      const { id, text, platforms, image_url } = item as any;

      const payload: Record<string, any> = {
        post: text,
        platforms,
      };

      if (image_url && typeof image_url === "string") {
        payload.mediaUrls = [image_url];
      }

      try {
        const res = await fetch("https://api.ayrshare.com/api/post", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${AYRSHARE_API_KEY}`,
          },
          body: JSON.stringify(payload),
        });

        let data: any = null;
        try {
          data = await res.json();
        } catch {
          // ignore parse failures, treat as generic error if not ok
        }

        if (!res.ok || data?.status === "error") {
          console.error(
            "[dispatch-scheduled] Ayrshare error for item",
            id,
            res.status,
            data
          );
          failures.push({
            id,
            statusCode: res.status,
          });

          // mark as failed
          await supabaseAdmin
            .from("content_items")
            .update({
              status: "failed",
              error_info: data || { statusCode: res.status },
            })
            .eq("id", id);

          continue;
        }

        // mark as sent
        await supabaseAdmin
          .from("content_items")
          .update({
            status: "sent",
            posted_at: new Date().toISOString(),
          })
          .eq("id", id);

        dispatchedCount += 1;
      } catch (e) {
        console.error("[dispatch-scheduled] exception posting item", id, e);
        failures.push({ id, error: String(e) });

        await supabaseAdmin
          .from("content_items")
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
