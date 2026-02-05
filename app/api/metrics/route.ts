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

function safeArray(input: any): string[] {
  if (!Array.isArray(input)) return [];
  return input.map((x) => String(x || "").trim()).filter(Boolean);
}

function safeStatus(input: any) {
  return String(input || "—").trim() || "—";
}

function previewText(input: any, max = 120) {
  const s = String(input || "").replace(/\s+/g, " ").trim();
  if (!s) return "(no message stored yet)";
  return s.length > max ? s.slice(0, max) + "…" : s;
}

function pickVideoUrl(row: any): string | undefined {
  // some of your code stores video in meta.video_url
  const meta = row?.meta;
  const fromMeta =
    meta && typeof meta === "object" ? String(meta?.video_url || meta?.videoUrl || "").trim() : "";
  return fromMeta ? fromMeta : undefined;
}

async function getSingleTenantOrganisationId(): Promise<string | null> {
  // If you later add auth, replace this with session/org lookup.
  const { data, error } = await supabaseAdmin.from("organisations").select("id").limit(1);
  if (error || !data || data.length === 0) return null;
  return String((data as any)[0].id);
}

async function fetchScheduledPosts(orgId: string, limit = 250) {
  // Your table columns have varied over time, so we try "full" first, then fallback.
  const base = supabaseAdmin.from("scheduled_posts");

  const fullSelect =
    "id, organisation_id, message, platforms, image_url, scheduled_for, status, error_info, posted_at, created_at, meta";

  const minimalSelect = "id, platforms, image_url, scheduled_for, status, error_info, posted_at, created_at";

  // attempt 1: full schema
  {
    const q = base
      .select(fullSelect)
      .eq("organisation_id", orgId)
      .order("scheduled_for", { ascending: false })
      .limit(limit);

    const { data, error } = await q;
    if (!error && Array.isArray(data)) return { data, used: "full" as const };
  }

  // attempt 2: minimal schema (for tables missing org/message/meta)
  {
    const q = base.select(minimalSelect).order("scheduled_for", { ascending: false }).limit(limit);
    const { data, error } = await q;
    if (error) throw error;
    return { data: data || [], used: "minimal" as const };
  }
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const windowDays = Math.max(7, Math.min(90, Number(url.searchParams.get("windowDays") || "30")));

    const organisationId =
      String(url.searchParams.get("organisationId") || "").trim() ||
      (await getSingleTenantOrganisationId());

    if (!organisationId) {
      const out: MetricsResponse = { ok: false, error: "No organisation found for metrics." };
      return NextResponse.json(out, { status: 200 });
    }

    const now = new Date();
    const windowStart = new Date(now);
    windowStart.setDate(now.getDate() - windowDays);

    // --- Pull data (scheduled posts) -----------------------------------------
    const { data: scheduledPosts } = await fetchScheduledPosts(organisationId, 500);

    // filter to window if we can
    const inWindow = (scheduledPosts || []).filter((r: any) => {
      const dStr = r?.scheduled_for || r?.created_at || null;
      if (!dStr) return true; // keep if unknown
      const d = new Date(dStr);
      if (isNaN(d.getTime())) return true;
      return d >= windowStart;
    });

    // --- KPIs ---------------------------------------------------------------
    const statusCounts: Record<string, number> = {};
    const platformCounts: Record<string, number> = {};

    let postsQueued = 0;
    let postsPosted = 0;
    let postsFailed = 0;

    for (const row of inWindow) {
      const status = safeStatus(row?.status);
      statusCounts[status] = (statusCounts[status] || 0) + 1;

      const platforms = safeArray(row?.platforms);
      for (const p of platforms) {
        platformCounts[p] = (platformCounts[p] || 0) + 1;
      }

      const s = status.toLowerCase();
      if (s.includes("scheduled") || s.includes("to_post") || s.includes("queued") || s.includes("pending")) postsQueued++;
      if (s.includes("posted")) postsPosted++;
      if (s.includes("failed") || s.includes("error")) postsFailed++;
    }

    // Replies are a separate system; right now we don’t have your “replies” table schema,
    // so we keep this as 0 until you tell me where replies live in Supabase.
    const repliesSent = 0;

    // --- Chart: last 7 days counts -----------------------------------------
    const byDay: Record<string, number> = {};
    const days: string[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      const k = toDateStr(d);
      days.push(k);
      byDay[k] = 0;
    }

    for (const row of inWindow) {
      const dStr = row?.scheduled_for || row?.created_at || null;
      if (!dStr) continue;
      const d = new Date(dStr);
      if (isNaN(d.getTime())) continue;
      const k = toDateStr(d);
      if (k in byDay) byDay[k] += 1;
    }

    const last7Days = days.map((date) => ({ date, value: byDay[date] || 0 }));

    // --- Top content (most recent) -----------------------------------------
    const topContent = (scheduledPosts || [])
      .slice(0, 12)
      .map((row: any) => ({
        id: String(row?.id || ""),
        status: safeStatus(row?.status),
        platforms: safeArray(row?.platforms),
        message_preview: previewText(row?.message),
        created_at: String(row?.created_at || row?.scheduled_for || ""),
        imageUrl: row?.image_url ? String(row.image_url) : undefined,
        videoUrl: pickVideoUrl(row),
      }))
      .filter((x) => x.id);

    // --- Recommendations (coach style, no fluff) -----------------------------
    const recs: MetricsResponse["recommendations"] = [];

    // Consistency
    const total7 = last7Days.reduce((s, p) => s + p.value, 0);
    if (total7 >= 7) {
      recs.push({
        title: "Strong consistency",
        tone: "good",
        detail: `You created ${total7} items in the last 7 days. Keep cadence steady — consistency beats intensity.`,
      });
    } else if (total7 >= 3) {
      recs.push({
        title: "Good momentum",
        tone: "info",
        detail: `You created ${total7} items in the last 7 days. Consider a simple rhythm: 3 posts/week + 1 short “story” post.`,
      });
    } else {
      recs.push({
        title: "Low output (easy win)",
        tone: "warn",
        detail: `Only ${total7} items in the last 7 days. The fastest lift is consistency: pick 2 fixed days and post something small.`,
      });
    }

    // Reliability
    if (postsFailed > 0) {
      recs.push({
        title: "Fix failures before scaling",
        tone: "warn",
        detail: `${postsFailed} items show a failed/error status in the last ${windowDays} days. Resolve those first so your effort doesn’t leak.`,
      });
    } else {
      recs.push({
        title: "Posting reliability looks clean",
        tone: "good",
        detail: `No failed/error statuses detected in the last ${windowDays} days. Great base for scaling campaigns.`,
      });
    }

    // Channel focus
    const platformSorted = Object.entries(platformCounts).sort((a, b) => b[1] - a[1]);
    const topPlatform = platformSorted[0]?.[0];
    if (topPlatform) {
      recs.push({
        title: "Channel focus",
        tone: "info",
        detail: `Most activity is on ${topPlatform}. If results are good there, repeat the winning format before spreading effort wider.`,
      });
    } else {
      recs.push({
        title: "Connect + post to generate signal",
        tone: "info",
        detail: "No platform activity detected yet. Once a few posts land, this page will start making meaningful recommendations.",
      });
    }

    const out: MetricsResponse = {
      ok: true,
      organisationId,
      windowDays,
      kpis: {
        totalItems: inWindow.length,
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
      recommendations: recs,
    };

    return NextResponse.json(out, { status: 200 });
  } catch (err: any) {
    console.error("[api/metrics] error", err);
    const out: MetricsResponse = {
      ok: false,
      error: err?.message || "Metrics API failed",
    };
    return NextResponse.json(out, { status: 200 });
  }
}
