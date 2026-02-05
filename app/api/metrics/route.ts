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
  platforms: any;
  image_url: string | null;
  video_url?: string | null; // might exist
  created_at?: string | null; // might exist
  scheduled_at?: string | null; // might exist
};

type PostEventRow = {
  id?: string;
  organisation_id?: string | null;
  post_id?: string | null;
  platform?: string | null;
  event_type?: string | null;
  created_at?: string | null; // might exist
  [key: string]: any;
};

function normalizeEventType(s: string) {
  const t = (s || "").toLowerCase().trim();
  if (!t) return "—";
  if (t.includes("posted") || t.includes("published")) return "posted";
  if (t.includes("sent")) return "sent";
  if (t.includes("queued") || t.includes("to_post") || t.includes("pending")) return "to_post";
  if (t.includes("approved")) return "approved";
  if (t.includes("fail") || t.includes("error")) return "failed";
  return s || "—";
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

    // --- scheduled_posts -----------------------------------------------------
    const sp = await supabaseAdmin
      .from("scheduled_posts")
      .select("*")
      .eq("organisation_id", organisationId)
      .order("id", { ascending: false })
      .limit(2000);

    if (sp.error) {
      return NextResponse.json(
        { ok: false, error: sp.error.message, hint: "Could not read scheduled_posts." },
        { status: 200 }
      );
    }

    const scheduled = (sp.data || []) as ScheduledPostRow[];

    // --- post_events (empty right now, but we wire it properly) --------------
    const pe = await supabaseAdmin
      .from("post_events")
      .select("*")
      .eq("organisation_id", organisationId)
      .gte("created_at", since.toISOString())
      .order("id", { ascending: false })
      .limit(5000);

    const events = pe.error ? ([] as PostEventRow[]) : ((pe.data || []) as PostEventRow[]);

    // Group events by post_id
    const eventsByPostId: Record<string, PostEventRow[]> = {};
    for (const e of events) {
      const pid = safeStr(e.post_id);
      if (!pid) continue;
      if (!eventsByPostId[pid]) eventsByPostId[pid] = [];
      eventsByPostId[pid].push(e);
    }

    // last 7 days activity window
    const last7: Record<string, number> = {};
    const today = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      last7[toDateStr(d)] = 0;
    }

    const statusCounts: Record<string, number> = {};
    const platformCounts: Record<string, number> = {};

    let postsTotal = scheduled.length;
    let postsQueued = 0;
    let postsPosted = 0;
    let postsFailed = 0;
    let repliesSent = 0; // later, when you log reply events

    const normalized = scheduled.map((p) => {
      const id = safeStr(p.id);
      const platforms = safeArr((p as any).platforms);
      const message = safeStr((p as any).message);
      const imageUrl = safeStr((p as any).image_url);
      const videoUrl = safeStr((p as any).video_url || "");

      // If events exist for this post id, latest event decides status.
      // If no events, it’s effectively queued/pending.
      const ev = (eventsByPostId[id] || [])[0] || null;
      const status = ev ? normalizeEventType(safeStr(ev.event_type)) : "to_post";

      const createdAt =
        safeStr((p as any).created_at) ||
        safeStr((p as any).scheduled_at) ||
        safeStr(ev?.created_at) ||
        "";

      return {
        id,
        status,
        platforms,
        message_preview: message.slice(0, 180),
        created_at: createdAt,
        imageUrl,
        videoUrl,
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
      if (s === "to_post" || s.includes("queued") || s.includes("pending")) postsQueued++;
      if (s === "posted") postsPosted++;
      if (s === "failed") postsFailed++;
      if (s === "sent") repliesSent++;

      const dt = item.created_at ? new Date(item.created_at) : null;
      if (dt && !isNaN(dt.getTime())) {
        const key = toDateStr(dt);
        if (key in last7) last7[key] += 1;
      }
    }

    const last7Days = Object.entries(last7).map(([date, value]) => ({ date, value }));

    const recommendations: { title: string; detail: string; tone: "good" | "warn" | "info" }[] = [];

    if (postsTotal === 0) {
      recommendations.push({
        title: "No posts yet",
        detail: "Create your first Scheduled post or send a Quick Blast to start building momentum.",
        tone: "info",
      });
    } else {
      recommendations.push({
        title: "Output momentum",
        detail: `You have ${postsTotal} scheduled items. Keep a steady cadence: 3–5 posts/week is a strong baseline.`,
        tone: "good",
      });

      if (events.length === 0) {
        recommendations.push({
          title: "Unlock ‘Posted / Failed’ tracking",
          detail:
            "Your post_events table is empty, so we can’t confirm what actually posted yet. Next step: write one event row per platform when posting happens.",
          tone: "warn",
        });
      } else {
        recommendations.push({
          title: "Tracking is live",
          detail: `post_events has ${events.length} rows in the last ${days} days — your status analytics will now be accurate.`,
          tone: "good",
        });
      }
    }

    // Top content (recent)
    const topContent = normalized.slice(0, 20);

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
        },
        charts: {
          last7Days,
        },
        topContent,
        recommendations,
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("[api/metrics] crashed", err);
    return NextResponse.json({ ok: false, error: err?.message || "Metrics route crashed" }, { status: 200 });
  }
}
