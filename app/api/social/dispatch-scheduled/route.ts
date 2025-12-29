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
        { success: true, dispatched: 0 },
        { status: 200 }
      );
    }

    let dispatchedCount = 0;
    const failures: any[] = [];

    for (const item of items as any[]) {
      const id = item.id;
      const text: string = item.message;
      const platforms: string[] = item.platforms || [];
      const imageUrl: string | null = item.image_url || null;

      const payload: Record<string, any> = {
        post: text,
        platforms,
      };

      if (imageUrl && typeof imageUrl === "string") {
        payload.mediaUrls = [imageUrl];
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
          // ignore parse failures; treat as generic error if not ok
        }

        if (!res.ok || (data && data.status === "error")) {
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
