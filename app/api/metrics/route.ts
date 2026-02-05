// app/api/metrics/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";

export const runtime = "nodejs";

function safeStr(x: any) {
  return String(x ?? "").trim();
}

function safeArr(x: any): string[] {
  if (Array.isArray(x)) return x.map((v) => safeStr(v)).filter(Boolean);
  if (typeof x === "string" && x.trim()) return x.split(",").map((v) => v.trim()).filter(Boolean);
  return [];
}

function toDateStr(d: Date) {
  return d.toISOString().slice(0, 10);
}

async function getSingleTenantOrganisationId(): Promise<string | null> {
  const { data, error } = await supabaseAdmin.from("organisations").select("id").limit(1);
  if (error || !data || data.length === 0) return null;
  return String((data as any)[0].id);
}

type ScheduledPostRow = {
  id: string;
  organisation_id: string;
  message: string | null;
  platforms: any; // text[] most likely
  image_url: string | null;
  created_at?: string | null; // may or may not exist
};

type PostEventRow = {
  id?: string;
  organisation_id?: string | null;
  created_at?: string | null;

  // These differ by schema, so we’ll detect:
  scheduled_post_id?: string | null;
  post_id?: string | null;
  scheduledPostId?: string | null;

  // Status can live in different fields:
  status?: string | null;
  event_type?: string | null;
  type?: string | null;
  name?: string | null;
  state?: string | null;

  // Optional message/detail:
  error?: string | null;
  message?: string | null;

  [key: string]: any;
};

function pickPostId(e: PostEventRow): string | null {
  return (
    safeStr(e.scheduled_post_id) ||
    safeStr((e as any).scheduled_posts_id) ||
    safeStr((e as any).scheduled_postid) ||
    safeStr(e.post_id) ||
    safeStr((e as any).postId) ||
    safeStr(e.scheduledPostId) ||
    null
  );
}

function pickEventStatus(e: PostEventRow): string {
  const raw =
    safeStr(e.status) ||
    safeStr((e as any).post_status) ||
    safeStr(e.state) ||
    safeStr((e as any).result) ||
    safeStr(e.event_type) ||
    safeStr(e.type) ||
    safeStr(e.name);

  if (!raw) return "—";

  // Normalize common ones to a nice compact set
  const s = raw.toLowerCase();

  if (s.includes("posted") || s.includes("published")) return "posted";
  if (s.includes("sent")) return "sent";
  if (s.includes("to_post") || s.includes("queue") || s.includes("queued")) return "to_post";
  if (s.includes("approved")) return "approved";
  if (s.includes("pending")) return "pending";
  if (s.includes("fail") || s.includes("error")) return "failed";

  return raw;
}

function latestByCreatedAt(rows: PostEventRow[]) {
  const sorted = rows
    .slice()
    .sort((a, b) => {
      const at = a.created_at ? new Date(a.created_at).getTime() : 0;
      const bt = b.created_at ? new Date(b.created_at).getTime() : 0;
      return bt - at;
    });

  return sorted[0] || null;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    const orgFromQuery = safeStr(searchParams.get("organisationId"));
    const days = Math.max(7, Math.min(365, Number(searchParams.get("days") || "90")));
    const organisationId = orgFromQuery || (await getSingleTenantOrganisationId());

    if (!organisationId) {
      return NextResponse.json({ ok: false, error: "No organisation found." }, { status: 200 });
    }

    const since = new Date();
    since.setDate(since.getDate() - days);

    // --- Pull scheduled_posts (the content backbone) -------------------------
    const sp = await supabaseAdmin
      .from("scheduled_posts")
      .select("*")
      .eq("organisation_id", organisationId)
      .order("id", { ascending: false })
      .limit(2000);

    if (sp.error) {
      return NextResponse.json(
        {
          ok: false,
          error: sp.error.message,
          hint: "Could not read scheduled_posts.",
        },
        { status: 200 }
      );
    }

    const scheduled = (sp.data || []) as ScheduledPostRow[];

    // --- Pull post_events (status + operational history) ---------------------
    const pe = await supabaseAdmin
      .from("post_events")
      .select("*")
      .eq("organisation_id", organisationId)
      .gte("created_at", since.toISOString())
      .order("created_at", { ascending: false })
      .limit(5000);

    // If post_events is empty or errors, we still return usable data
    const events = pe.error ? ([] as PostEventRow[]) : ((pe.data || []) as PostEventRow[]);

    // --- Group events by scheduled_post_id/post_id ---------------------------
    const eventsByPostId: Record<string, PostEventRow[]> = {};
    for (const e of events) {
      const pid = pickPostId(e);
      if (!pid) continue;
      if (!eventsByPostId[pid]) eventsByPostId[pid] = [];
      eventsByPostId[pid].push(e);
    }

    // --- Build breakdowns + last7 activity ---------------------------------
    const statusCounts: Record<string, number> = {};
    const platformCounts: Record<string, number> = {};
    const failuresByPlatform: Record<string, number> = {};

    let postsTotal = scheduled.length;
    let postsQueued = 0;
    let postsPosted = 0;
    let postsFailed = 0;
    let repliesSent = 0; // placeholder for later (when you log reply events)

    // last 7 days activity
    const last7: Record<string, number> = {};
    const today = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      last7[toDateStr(d)] = 0;
    }

    const normalized = scheduled.map((p) => {
      const postId = safeStr(p.id);
      const platforms = safeArr((p as any).platforms);
      const message = safeStr((p as any).message);
      const imageUrl = safeStr((p as any).image_url);

      // Compute status from latest event (fallback to "to_post" if none)
      const latestEvent = latestByCreatedAt(eventsByPostId[postId] || []);
      const status = latestEvent ? pickEventStatus(latestEvent) : "to_post";

      // created_at might not exist on scheduled_posts — so use latest event time or blank
      const createdAt =
        safeStr((p as any).created_at) ||
        safeStr((latestEvent as any)?.created_at) ||
        "";

      // optional scheduled_at (not visible in your screenshot)
      const scheduledAt = safeStr((p as any).scheduled_at) || "";

      return {
        id: postId,
        platforms,
        message_preview: message.slice(0, 160),
        status,
        created_at: createdAt,
        scheduled_at: scheduledAt,
        imageUrl: imageUrl || "",
        videoUrl: safeStr((p as any).video_url || ""),
        latestEvent,
      };
    });

    for (const item of normalized) {
      const status = safeStr(item.status) || "—";
      statusCounts[status] = (statusCounts[status] || 0) + 1;

      for (const plat of item.platforms) {
        if (!plat) continue;
        platformCounts[plat] = (platformCounts[plat] || 0) + 1;
      }

      const s = status.toLowerCase();

      if (s.includes("to_post") || s.includes("queued") || s.includes("pending") || s.includes("scheduled")) postsQueued++;
      if (s.includes("posted") || s.includes("published")) postsPosted++;
      if (s.includes("failed") || s.includes("error") || s.includes("fail")) {
        postsFailed++;
        for (const plat of item.platforms) {
          failuresByPlatform[plat] = (failuresByPlatform[plat] || 0) + 1;
        }
      }
      if (s === "sent") repliesSent++;

      // activity: use created_at if parseable (fallback to latest event created_at)
      const dt = item.created_at ? new Date(item.created_at) : null;
      if (dt && !isNaN(dt.getTime())) {
        const key = toDateStr(dt);
        if (key in last7) last7[key] += 1;
      }
    }

    const last7Days = Object.entries(last7).map(([date, value]) => ({ date, value }));

    // --- Recommendations (simple now, powerful later) ------------------------
    const recs: { title: string; detail: string; tone?: "good" | "warn" | "info" }[] = [];

    if (postsQueued > postsPosted) {
      recs.push({
        title: "Backlog building",
        detail: `Queued/pending is outpacing posted (${postsQueued} vs ${postsPosted}). Suggest a “Clear approvals” push + scheduled cadence.`,
        tone: "warn",
      });
    } else {
      recs.push({
        title: "Cadence looks healthy",
        detail: `Good flow: posted (${postsPosted}) is keeping up with queued/pending (${postsQueued}).`,
        tone: "good",
      });
    }

    const totalFailures = Object.values(failuresByPlatform).reduce((a, b) => a + b, 0);
    if (totalFailures > 0) {
      const worst = Object.entries(failuresByPlatform).sort((a, b) => b[1] - a[1])[0];
      recs.push({
        title: "Fix the noisiest failure channel",
        detail: `${worst[0]} has ${worst[1]} failures in the last ${days} days. Likely token expiry, permissions, or media rules.`,
        tone: "warn",
      });
    } else {
      recs.push({
        title: "Reliability looks strong",
        detail: `No failures detected (from post_events) in the last ${days} days.`,
        tone: "good",
      });
    }

    // top content: most recent, prioritise posted
    const topContent = normalized
      .slice()
      .sort((a, b) => {
        const ap = a.status.toLowerCase().includes("posted") ? 2 : a.status.toLowerCase().includes("to_post") ? 1 : 0;
        const bp = b.status.toLowerCase().includes("posted") ? 2 : b.status.toLowerCase().includes("to_post") ? 1 : 0;
        if (bp !== ap) return bp - ap;

        const at = a.created_at ? new Date(a.created_at).getTime() : 0;
        const bt = b.created_at ? new Date(b.created_at).getTime() : 0;
        return bt - at;
      })
      .slice(0, 20)
      .map((x) => ({
        id: x.id,
        status: x.status,
        created_at: x.created_at,
        scheduled_at: x.scheduled_at,
        message_preview: x.message_preview,
        platforms: x.platforms,
        imageUrl: x.imageUrl,
        videoUrl: x.videoUrl,
      }));

    return NextResponse.json(
      {
        ok: true,
        organisationId,
        windowDays: days,
        kpis: {
          totalItems: postsTotal,
          repliesSent,
          postsQueued,
          postsPosted,
          postsFailed,
        },
        breakdowns: {
          statusCounts,
          platformCounts,
          failuresByPlatform,
        },
        charts: {
          last7Days,
        },
        topContent,
        recommendations: recs,
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("[api/metrics] crashed", err);
    return NextResponse.json({ ok: false, error: err?.message || "Metrics route crashed" }, { status: 200 });
  }
}
