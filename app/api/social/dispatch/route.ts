// app/api/social/dispatch/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

const AYRSHARE_API_KEY = process.env.AYRSHARE_API_KEY;
const DISPATCH_SECRET = process.env.DISPATCH_SECRET;

type ScheduledRow = {
  id: string;
  organisation_id: string;
  message: string;
  platforms: string[];
  image_url: string | null;
  scheduled_for: string;
  status: string;
  meta: any;
};
const AYRSHARE_ALLOWED = new Set([
  "facebook",
  "instagram",
  "linkedin",
  "threads",
  "tiktok",
  "reddit",
  "gmb",
]);

function mapPlatformsToAyrshare(input: string[]) {
  return (input || [])
    .map((p) => (p === "google" ? "gmb" : p)) // <- important
    .filter((p) => AYRSHARE_ALLOWED.has(p));
}

function isAuthorized(req: NextRequest) {
  // ✅ Vercel Cron sets this header
  const isVercelCron = req.headers.get("x-vercel-cron") === "1";
  if (isVercelCron) return true;

  // ✅ Manual trigger via secret
  const secret = req.nextUrl.searchParams.get("secret") || "";
  if (DISPATCH_SECRET && secret === DISPATCH_SECRET) return true;

  return false;
}

async function postViaAyrshare(args: {
  message: string;
  platforms: string[];
  imageUrl?: string | null;
}) {
  if (!AYRSHARE_API_KEY) throw new Error("Missing AYRSHARE_API_KEY");

  const payload: Record<string, any> = {
    post: args.message,
    platforms: args.platforms,
  };

  if (args.imageUrl && args.imageUrl.trim()) {
    payload.mediaUrls = [args.imageUrl.trim()];
  }

  const res = await fetch("https://app.ayrshare.com/api/post", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${AYRSHARE_API_KEY}`,
    },
    body: JSON.stringify(payload),
  });

  const txt = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(txt);
  } catch {
    // non-json response
  }

  return { ok: res.ok, status: res.status, json, raw: txt };
}

export async function GET(req: NextRequest) {
  try {
    if (!isAuthorized(req)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const nowIso = new Date().toISOString();

    const { data, error } = await supabaseAdmin
      .from("scheduled_posts")
      .select(
        "id, organisation_id, message, platforms, image_url, scheduled_for, status, meta"
      )
      .eq("status", "scheduled")
      .lte("scheduled_for", nowIso)
      .order("scheduled_for", { ascending: true })
      .limit(25);

    if (error) {
      console.error("[dispatch] select error", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows = (data || []) as ScheduledRow[];
    if (rows.length === 0) {
      return NextResponse.json(
        { success: true, dispatched: 0, failed: 0, failures: [] },
        { status: 200 }
      );
    }

    let dispatched = 0;
    let failed = 0;
    const failures: any[] = [];

    for (const row of rows) {
      // ✅ Atomic lock: only grab it if it's still scheduled
      const { data: locked, error: lockErr } = await supabaseAdmin
        .from("scheduled_posts")
        .update({ status: "processing" })
        .eq("id", row.id)
        .eq("status", "scheduled")
        .select("id")
        .maybeSingle();

      if (lockErr) {
        failed++;
        failures.push({ id: row.id, error: `Lock error: ${lockErr.message}` });
        continue;
      }

      // If it's null, someone else already grabbed it
      if (!locked?.id) {
        continue;
      }

      try {
        const result = await postViaAyrshare({
          message: row.message,
          platforms: mapPlatformsToAyrshare(row.platforms),

          imageUrl: row.image_url,
        });

        if (!result.ok) {
          failed++;
          failures.push({
            id: row.id,
            statusCode: result.status,
            error: result.json || result.raw,
          });

          await supabaseAdmin
            .from("scheduled_posts")
            .update({
              status: "failed",
              error_info: result.json || { raw: result.raw },
            })
            .eq("id", row.id);

          continue;
        }

        dispatched++;

        await supabaseAdmin
          .from("scheduled_posts")
          .update({
            status: "posted",
            posted_at: new Date().toISOString(),
            meta: {
              ...(row.meta || {}),
              ayrshare: result.json || { raw: result.raw },
            },
          })
          .eq("id", row.id);
      } catch (e: any) {
        failed++;
        failures.push({ id: row.id, error: e?.message || "Unknown error" });

        await supabaseAdmin
          .from("scheduled_posts")
          .update({
            status: "failed",
            error_info: { message: e?.message || "Unknown error" },
          })
          .eq("id", row.id);
      }
    }

    return NextResponse.json(
      { success: true, dispatched, failed, failures },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("[dispatch] unexpected error", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
