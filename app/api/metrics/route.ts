// app/api/metrics/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";

export const runtime = "nodejs";

type MetricsResponse = {
  ok: boolean;
  organisationId?: string;
  windowDays?: number;
  error?: string;

  kpis?: {
    totalItems: number;
    repliesSent: number;
    postsQueued: number;
    postsPosted: number;
    postsFailed: number;
  };

  breakdowns?: {
    statusCounts: Record<string, number>;
    platformCounts: Record<string, number>;
  };

  charts?: {
    last7Days: { date: string; value: number }[];
  };

  topContent?: {
    id: string;
    status: string;
    platforms: string[];
    message_preview: string;
    created_at: string;
    imageUrl?: string;
    videoUrl?: string;
  }[];

  recommendations?: { title: string; detail: string; tone: "good" | "warn" | "info" }[];
};

function toDateStr(d: Date) {
  return d.toISOString().slice(0, 10);
}

function safeStr(v: any) {
  const s = String(v ?? "").trim();
  return s ? s : "";
}

function safeArr(v: any): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => safeStr(x)).filter(Boolean);
}

function previewText(s: string, n = 140) {
  const t = safeStr(s).replace(/\s+/g, " ").trim();
  if (t.length <= n) return t;
  return t.slice(0, n - 1).trim() + "…";
}

function getVideoUrlFromMeta(meta: any): string | undefined {
  if (!meta || typeof meta !== "object") return undefined;
  // we’ve used meta.video_url in schedule queue
  const v =
    meta.video_url ||
    meta.videoUrl ||
    meta?.coach?.video_url ||
    meta?.coach?.videoUrl ||
    null;
  const s = safeStr(v);
  return s ? s : undefined;
}

async function getSingleTenantOrganisationId(): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from("organisations")
    .select("id")
    .limit(1);

  if (error || !data || data.length === 0) return null;
  return String((data as any)[0].id);
}

function withinLastNDays(iso: string, days: number) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return false;
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return d.getTime() >= cutoff;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const windowDays = Math.max(7, Math.min(365, Number(searchParams.get("days") || 30)));

    const orgFromQuery = safeStr(searchParams.get("organisationId"));
    const organisationId = orgFromQuery || (await getSingleTenantOrganisationId());

    if (!organisationId) {
      const out: MetricsResponse = {
        ok: false,
        error: "No organisation found (missing organisationId).",
      };
      return NextResponse.json(out, { status: 200 });
    }

    // ----------------------------
    // 1) Load scheduled_posts
    // ----------------------------
    const cutoffIso = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();

    // Some schemas may not have created_at; we’ll try it first, then fallback.
    let posts: any[] = [];

    {
      const attempt = await supabaseAdmin
        .from("scheduled_posts")
        .select("id, organisation_id, message, platforms, image_url, status, scheduled_for, created_at, meta")
        .eq("organisation_id", organisationId)
        .gte("scheduled_for", cutoffIso)
        .order("scheduled_for", { ascending: false })
        .limit(500);

      if (!attempt.error) {
        posts = (attempt.data as any[]) || [];
      } else {
        // fallback: remove created_at
        const fallback = await supabaseAdmin
          .from("scheduled_posts")
          .select("id, organisation_id, message, platforms, image_url, status, scheduled_for, meta")
          .eq("organisation_id", organisationId)
          .gte("scheduled_for", cutoffIso)
          .order("scheduled_for", { ascending: false })
          .limit(500);

        if (fallback.error) {
          const out: MetricsResponse = {
            ok: false,
            organisationId,
            windowDays,
            error: fallback.error.message || "Could not load scheduled_posts",
          };
          return NextResponse.json(out, { status: 200 });
        }

        posts = (fallback.data as any[]) || [];
      }
    }

    // ----------------------------
    // 2) Load post_events (optional but powerful)
    // ----------------------------
    // If table is missing or schema differs, we just treat as empty.
    let events: any[] = [];
    try {
      const ev = await supabaseAdmin
        .from("post_events")
        .select("id, organisation_id, post_id, platform, event_type, created_at")
        .eq("organisation_id", organisationId)
        .gte("created_at", cutoffIso)
        .order("created_at", { ascending: false })
        .limit(2000);

      if (!ev.error) events = (ev.data as any[]) || [];
    } catch {
      events = [];
    }

    // ----------------------------
    // 3) Derive KPIs / breakdowns
    // ----------------------------
    const statusCounts: Record<string, number> = {};
    const platformCounts: Record<string, number> = {};

    // 7 day activity (by scheduled_for)
    const byDay: Record<string, number> = {};
    const today = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      byDay[toDateStr(d)] = 0;
    }

    let postsQueued = 0;

    for (const row of posts) {
      const status = safeStr(row?.status || "—") || "—";
      const platforms = safeArr(row?.platforms);

      statusCounts[status] = (statusCounts[status] || 0) + 1;

      for (const p of platforms) {
        platformCounts[p] = (platformCounts[p] || 0) + 1;
      }

      const s = status.toLowerCase();
      if (
        s.includes("scheduled") ||
        s.includes("to_post") ||
        s.includes("queued") ||
        s.includes("pending")
      ) {
        postsQueued += 1;
      }

      const scheduledFor = safeStr(row?.scheduled_for);
      if (scheduledFor) {
        const key = toDateStr(new Date(scheduledFor));
        if (key in byDay) byDay[key] += 1;
      }
    }

    // Posted/failed derived from post_events (best source of truth once you log)
    const postedEvents = events.filter((e) => String(e?.event_type || "").toLowerCase() === "posted");
    const failedEvents = events.filter((e) => {
      const t = String(e?.event_type || "").toLowerCase();
      return t === "failed" || t === "error";
    });

    // If you haven’t started logging post_events, these will be 0 (and Metrics page already hints that)
    const postsPosted = postedEvents.length;
    const postsFailed = failedEvents.length;

    const totalItems = posts.length;
    const repliesSent = 0; // (we’ll wire this once you show me where replies live in Supabase)

    // Last 7 days chart data
    const last7Days = Object.entries(byDay).map(([date, value]) => ({ date, value }));

    // Top content (most recent scheduled items)
    const topContent = posts.slice(0, 10).map((p) => {
      const createdAt = safeStr(p?.created_at) || safeStr(p?.scheduled_for) || new Date().toISOString();
      const meta = p?.meta;
      return {
        id: safeStr(p?.id),
        status: safeStr(p?.status || "—") || "—",
        platforms: safeArr(p?.platforms),
        message_preview: previewText(safeStr(p?.message)),
        created_at: createdAt,
        imageUrl: safeStr(p?.image_url) || undefined,
        videoUrl: getVideoUrlFromMeta(meta),
      };
    });

    // ----------------------------
    // 4) Coach-style recommendations (simple rules, real signal)
    // ----------------------------
    const recommendations: MetricsResponse["recommendations"] = [];

    // A) If there’s queue but no posted events logged -> remind user what’s missing
    if (postsQueued > 0 && postsPosted === 0) {
      recommendations.push({
        tone: "warn",
        title: "You’re scheduling, but publish tracking is off",
        detail:
          "You have queued/scheduled posts, but no ‘posted’ events logged yet. Next upgrade: log publish attempts into post_events so this page can coach you on what worked.",
      });
    }

    // B) If failures exist -> advise tightening workflow
    if (postsFailed > 0) {
      recommendations.push({
        tone: "warn",
        title: "Delivery issues detected",
        detail:
          "Some publish attempts failed in this window. Focus on one platform for the next 3 posts, keep the media format consistent, and improve reliability before scaling campaigns.",
      });
    }

    // C) If activity is very low in last 7 days
    const last7Total = last7Days.reduce((s, d) => s + (d.value || 0), 0);
    if (last7Total === 0 && totalItems > 0) {
      recommendations.push({
        tone: "info",
        title: "Quiet week",
        detail:
          "No activity in the last 7 days. If your goal is steady growth, aim for 3 posts/week: one educational, one story, one CTA.",
      });
    }

    // D) Platform concentration insight
    const sortedPlatforms = Object.entries(platformCounts).sort((a, b) => b[1] - a[1]);
    if (sortedPlatforms.length > 0) {
      const [topPlatform, topCount] = sortedPlatforms[0];
      const totalPlatformItems = sortedPlatforms.reduce((s, [, v]) => s + v, 0) || 1;
      const share = Math.round((topCount / totalPlatformItems) * 100);

      if (share >= 70) {
        recommendations.push({
          tone: "info",
          title: "You’re concentrated on one channel",
          detail: `${topPlatform} accounts for ~${share}% of your output. That’s fine for focus — but once consistent, test a second channel with 1–2 posts/week to widen reach.`,
        });
      } else {
        recommendations.push({
          tone: "good",
          title: "Healthy channel mix",
          detail: "Your posting is distributed across platforms. Keep this up, then optimise by campaign (goal + CTA) rather than platform alone.",
        });
      }
    } else {
      recommendations.push({
        tone: "info",
        title: "No platform breakdown yet",
        detail:
          "Once scheduled_posts contains platforms on each post (and you log post_events), you’ll see what worked where and get campaign coaching.",
      });
    }

    const out: MetricsResponse = {
      ok: true,
      organisationId,
      windowDays,
      kpis: {
        totalItems,
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
    };

    return NextResponse.json(out, { status: 200 });
  } catch (err: any) {
    const out: MetricsResponse = {
      ok: false,
      error: err?.message || "Metrics route crashed",
    };
    return NextResponse.json(out, { status: 200 });
  }
}
