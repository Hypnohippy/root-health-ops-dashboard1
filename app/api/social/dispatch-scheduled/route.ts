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

function toMillis(v: any): number {
  if (!v) return NaN;
  // If it's already an ISO string or timestamp-like, Date can usually parse it.
  const ms = Date.parse(String(v));
  return ms;
}

type ScheduledRow = {
  id: string;
  organisation_id: string | null;
  message: string | null;
  platforms: any;
  image_url: string | null;
  scheduled_for: any;
  status: string | null;
};

async function postViaQuickBlast(args: {
  req: NextRequest;
  organisationId: string;
  message: string;
  platforms: string[];
  imageUrl?: string;
}) {
  const url = `${baseUrl(args.req)}/api/social/quick-blast?organisationId=${encodeURIComponent(
    args.organisationId
  )}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({
      message: args.message,
      platforms: args.platforms,
      imageUrl: args.imageUrl || "",
    }),
  });

  const json: any = await res.json().catch(() => null);
  return { ok: res.ok && !!json, status: res.status, json };
}

export async function GET(req: NextRequest) {
  try {
    const nowMs = Date.now();

    // 1) Fetch "scheduled-ish" posts WITHOUT relying on DB time comparison
    //    (this avoids issues if scheduled_for is stored as text or without timezone)
    const { data: items, error } = await supabaseAdmin
      .from("scheduled_posts")
      .select(
        "id, organisation_id, message, platforms, image_url, scheduled_for, status"
      )
      // Accept a few common “scheduled” status names to be safe
      .in("status", ["scheduled", "queue", "queued", "pending"])
      .order("scheduled_for", { ascending: true })
      .limit(50);

    if (error) {
      console.error("[dispatch-scheduled] fetch error", error);
      return NextResponse.json(
        { success: false, error: "DB error fetching scheduled posts." },
        { status: 200 }
      );
    }

    const rows: ScheduledRow[] = (items ?? []) as any;

    // 2) Filter due in code
    const due = rows.filter((r) => {
      const ms = toMillis(r.scheduled_for);
      if (!Number.isFinite(ms)) return false; // ignore unparseable dates
      return ms <= nowMs;
    });

    if (due.length === 0) {
      return NextResponse.json(
        {
          success: true,
          scanned: rows.length,
          due: 0,
          dispatched: 0,
          failed: 0,
          note:
            "No due scheduled posts matched. If you see past posts in UI, check scheduled_for format + status values in DB.",
        },
        { status: 200 }
      );
    }

    let dispatchedCount = 0;
    const failures: any[] = [];

    for (const item of due) {
      const id = String(item.id);
      const organisationId = String(item.organisation_id || "").trim();
      const message = String(item.message || "").trim();

      const platforms: string[] = Array.isArray(item.platforms)
        ? item.platforms.map((p: any) => String(p || "").toLowerCase().trim()).filter(Boolean)
        : [];

      const imageUrl = item.image_url ? String(item.image_url).trim() : "";

      if (!organisationId || !message || platforms.length === 0) {
        failures.push({
          id,
          error: "Missing organisation_id, message, or platforms on scheduled_post row.",
        });

        await supabaseAdmin
          .from("scheduled_posts")
          .update({
            status: "failed",
            error_info: {
              error:
                "Missing organisation_id, message, or platforms on scheduled_post row.",
            },
          })
          .eq("id", id);

        continue;
      }

      try {
        // Mark in-progress (prevents double-send if cron overlaps)
        await supabaseAdmin
          .from("scheduled_posts")
          .update({ status: "sending" })
          .eq("id", id);

        const out = await postViaQuickBlast({
          req,
          organisationId,
          message,
          platforms,
          imageUrl: imageUrl || undefined,
        });

        if (!out.ok) {
          console.error("[dispatch-scheduled] quick-blast error", id, out.status, out.json);

          failures.push({
            id,
            statusCode: out.status,
            error: out.json,
          });

          await supabaseAdmin
            .from("scheduled_posts")
            .update({
              status: "failed",
              error_info: out.json || { statusCode: out.status },
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

        failures.push({ id, error: String(e?.message || e) });

        await supabaseAdmin
          .from("scheduled_posts")
          .update({
            status: "failed",
            error_info: { error: String(e?.message || e) },
          })
          .eq("id", id);
      }
    }

    return NextResponse.json(
      {
        success: true,
        scanned: rows.length,
        due: due.length,
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
