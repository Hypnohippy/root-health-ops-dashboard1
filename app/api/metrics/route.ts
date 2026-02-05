// app/api/metrics/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

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

function safeString(x: any) {
  return typeof x === "string" ? x : x == null ? "" : String(x);
}

function normalizePlatforms(raw: any): string[] {
  if (Array.isArray(raw)) return raw.map((x) => safeString(x).toLowerCase().trim()).filter(Boolean);

  // Sometimes platforms can be stored as JSON string or comma string
  const s = safeString(raw).trim();
  if (!s) return [];

  try {
    const parsed = JSON.parse(s);
    if (Array.isArray(parsed)) {
      return parsed.map((x) => safeString(x).toLowerCase().trim()).filter(Boolean);
    }
  } catch {
    // ignore
  }

  // comma-separated fallback
  return s
    .split(",")
    .map((x) => x.toLowerCase().trim())
    .filter(Boolean);
}

function classifyStatus(statusRaw: any) {
  const s = safeString(statusRaw).toLowerCase().trim();

  const posted = s.includes("posted");
  const failed = s.includes("failed") || s.includes("error");
  const queued =
    s.includes("scheduled") ||
    s.includes("to_post") ||
    s.includes("queued") ||
    s.includes("pending");

  return { posted, failed, queued, status: s || "—" };
}

async function getSingleTenantOrganisationId(): Promise<string | null> {
  // If you’re truly single-tenant, this is safe and convenient.
  // If you become multi-tenant, pass ?organisationId= in the request.
  const { data, error } = await supabaseAdmin.from("organisations").select("id").limit(1);
  if (error || !data || data.length === 0) return null;
  return String((data as any)[0].id);
}

function buildRecommendations(args: {
  total: number;
  posted: number;
  queued: number;
  failed: number;
  platformCounts: Record<string, number>;
}): { title: string; detail: string; tone: "good" | "warn" | "info" }[] {
  const recs: { title: string; detail: string; tone: "good" | "warn" | "info" }[] = [];

  if (args.total === 0) {
    recs.push({
      title: "Start with one simple weekly rhythm",
      detail: "You have no scheduled items yet. Try 3 posts this week: 1 helpful tip, 1 story-style reflection, 1 invitation question.",
      tone: "info",
    });
    return recs;
  }

  if (args.posted === 0 && args.total > 0) {
    recs.push({
      title: "You’ve planned content — now convert it into momentum",
      detail: "You have scheduled items but nothing marked as posted yet. Once you begin logging publish outcomes, this dashboard will start coaching what worked and where.",
      tone: "warn",
    });
  } else {
    recs.push({
      title: "Momentum is building",
      detail: `You have ${args.posted} item(s) marked as posted. Keep a steady cadence — consistency usually beats intensity.`,
      tone: "good",
    });
  }

  if (args.failed > 0) {
    recs.push({
      title: "Reduce failures first (quick win)",
      detail: `You have ${args.failed} failed item(s). Fixing repeat failure causes (media link type, token expiry, platform rules) is the fastest way to improve results.`,
      tone: "warn",
    });
  }

  const platforms = Object.entries(args.platformCounts).sort((a, b) => b[1] - a[1]);
  if (platforms.length >= 1) {
    const [topName, topCount] = platforms[0];
    const totalPlatforms = platforms.reduce((s, [, v]) => s + v, 0) || 1;
    const share = Math.round((topCount / totalPlatforms) * 100);

    if (share >= 70) {
      recs.push({
        title: "Channel mix is concentrated",
        detail: `${share}% of your items are going to ${topName}. If that’s intentional, great. If not, test a second channel for the next 5 posts and compare results.`,
        tone: "info",
      });
    } else {
      recs.push({
        title: "Nice spread across channels",
        detail: "You’re not relying on just one platform — that’s healthy for long-term growth.",
        tone: "good",
      });
    }
  }

  if (args.queued > 0 && args.posted > 0) {
    recs.push({
      title: "Turn your best post into a repeatable template",
      detail: "When you spot a post that performs well, reuse its structure (hook → one insight → gentle question) and rotate the topic weekly.",
      tone: "info",
    });
  }

  return recs.slice(0, 6);
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);

    const windowDays = Math.max(7, Math.min(180, Number(url.searchParams.get("windowDays") || "30") || 30));

    // Optional org (future multi-tenant). If omitted, we do a safe single-tenant fallback.
    let organisationId = safeString(url.searchParams.get("organisationId")).trim();
    if (!organisationId) {
      organisationId = (await getSingleTenantOrganisationId()) || "";
    }

    // Pull scheduled_posts
    // IMPORTANT: your table columns view didn’t show organisation_id/message,
    // but earlier you did have them. So we:
    // 1) Try selecting “known” columns
    // 2) If Supabase rejects a column, fallback to select("*")
    const sinceIso = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();

    let rows: any[] = [];
    try {
      const q = supabaseAdmin
        .from("scheduled_posts")
        .select("id, organisation_id, message, platforms, image_url, video_url, scheduled_for, status, error_info, posted_at, created_at")
        .gte("scheduled_for", sinceIso)
        .order("scheduled_for", { ascending: false });

      const { data, error } = organisationId
        ? await q.eq("organisation_id", organisationId)
        : await q;

      if (error) throw error;
      rows = (data as any[]) || [];
    } catch {
      const q2 = supabaseAdmin
        .from("scheduled_posts")
        .select("*")
        .gte("scheduled_for", sinceIso)
        .order("scheduled_for", { ascending: false });

      const { data: data2, error: error2 } = organisationId
        ? await q2.eq("organisation_id", organisationId)
        : await q2;

      if (error2) {
        console.error("[metrics] scheduled_posts query error", error2);
        return NextResponse.json(
          { ok: false, organisationId, windowDays, error: (error2 as any)?.message || "Failed reading scheduled_posts" } satisfies MetricsResponse,
          { status: 200 }
        );
      }
      rows = (data2 as any[]) || [];
    }

    // Try post_events count for repliesSent if it exists (optional)
    let repliesSent = 0;
    try {
      const pe = supabaseAdmin
        .from("post_events")
        .select("id, event_type, organisation_id", { count: "exact", head: true })
        .eq("event_type", "reply_sent");

      const { count } = organisationId ? await pe.eq("organisation_id", organisationId) : await pe;
      repliesSent = Number(count || 0);
    } catch {
      // If post_events doesn’t exist / not used, keep 0
      repliesSent = 0;
    }

    const statusCounts: Record<string, number> = {};
    const platformCounts: Record<string, number> = {};

    let postsQueued = 0;
    let postsPosted = 0;
    let postsFailed = 0;

    // 7-day chart window (activity)
    const today = new Date();
    const byDay: Record<string, number> = {};
    const dayKeys: string[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const k = toDateStr(d);
      dayKeys.push(k);
      byDay[k] = 0;
    }

    for (const r of rows) {
      const st = classifyStatus(r?.status);
      statusCounts[st.status] = (statusCounts[st.status] || 0) + 1;

      if (st.queued) postsQueued++;
      if (st.posted) postsPosted++;
      if (st.failed) postsFailed++;

      const plats = normalizePlatforms(r?.platforms);
      for (const p of plats) platformCounts[p] = (platformCounts[p] || 0) + 1;

      // Activity date source (best effort)
      const dtRaw = r?.created_at || r?.scheduled_for || r?.posted_at || null;
      if (dtRaw) {
        const d = new Date(dtRaw);
        if (!isNaN(d.getTime())) {
          const k = toDateStr(d);
          if (k in byDay) byDay[k] += 1;
        }
      }
    }

    const totalItems = rows.length;

    const last7Days = dayKeys.map((k) => ({ date: k, value: byDay[k] || 0 }));

    const topContent = rows.slice(0, 12).map((r) => {
      const msg = safeString(r?.message || "");
      const preview = msg
        ? msg.replace(/\s+/g, " ").trim().slice(0, 140)
        : "(no message column found in scheduled_posts)";

      const plats = normalizePlatforms(r?.platforms);
      const createdAt = safeString(r?.created_at || r?.scheduled_for || r?.posted_at || "");

      return {
        id: safeString(r?.id),
        status: safeString(r?.status || "—"),
        platforms: plats,
        message_preview: preview,
        created_at: createdAt,
        imageUrl: safeString(r?.image_url || ""),
        videoUrl: safeString(r?.video_url || ""),
      };
    });

    const recommendations = buildRecommendations({
      total: totalItems,
      posted: postsPosted,
      queued: postsQueued,
      failed: postsFailed,
      platformCounts,
    });

    const out: MetricsResponse = {
      ok: true,
      organisationId: organisationId || undefined,
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
    console.error("[metrics] unexpected error", err);
    return NextResponse.json(
      { ok: false, error: err?.message || "Metrics route crashed" } satisfies MetricsResponse,
      { status: 200 }
    );
  }
}
