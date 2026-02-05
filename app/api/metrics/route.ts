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
    campaignName?: string;
    contentType?: string;
    objective?: string;
  }[];

  campaignScoreboard?: {
    campaignName: string;
    objective?: string | null;
    posted: number;
    failed: number;
    queued: number;
    total: number;
    lastActivityAt?: string | null;
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
  const meta = row?.meta;
  const fromMeta =
    meta && typeof meta === "object"
      ? String(meta?.video_url || meta?.videoUrl || "").trim()
      : "";
  return fromMeta ? fromMeta : undefined;
}

async function getSingleTenantOrganisationId(): Promise<string | null> {
  const { data, error } = await supabaseAdmin.from("organisations").select("id").limit(1);
  if (error || !data || data.length === 0) return null;
  return String((data as any)[0].id);
}

async function fetchScheduledPosts(orgId: string, limit = 500) {
  const fullSelect =
    "id, organisation_id, message, platforms, image_url, scheduled_for, status, error_info, posted_at, created_at, meta, campaign_name, objective, content_type";
  const { data, error } = await supabaseAdmin
    .from("scheduled_posts")
    .select(fullSelect)
    .eq("organisation_id", orgId)
    .order("scheduled_for", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data || [];
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

    const scheduledPosts = await fetchScheduledPosts(organisationId, 800);

    const inWindow = (scheduledPosts || []).filter((r: any) => {
      const dStr = r?.scheduled_for || r?.created_at || null;
      if (!dStr) return true;
      const d = new Date(dStr);
      if (isNaN(d.getTime())) return true;
      return d >= windowStart;
    });

    const statusCounts: Record<string, number> = {};
    const platformCounts: Record<string, number> = {};

    let postsQueued = 0;
    let postsPosted = 0;
    let postsFailed = 0;

    // campaign scoreboard map
    const camp: Record<
      string,
      { campaignName: string; objective?: string | null; posted: number; failed: number; queued: number; total: number; lastActivityAt?: string | null }
    > = {};

    for (const row of inWindow) {
      const status = safeStatus(row?.status);
      statusCounts[status] = (statusCounts[status] || 0) + 1;

      const platforms = safeArray(row?.platforms);
      for (const p of platforms) platformCounts[p] = (platformCounts[p] || 0) + 1;

      const s = status.toLowerCase();
      const isQueued = s.includes("scheduled") || s.includes("to_post") || s.includes("queued") || s.includes("pending");
      const isPosted = s.includes("posted");
      const isFailed = s.includes("failed") || s.includes("error");

      if (isQueued) postsQueued++;
      if (isPosted) postsPosted++;
      if (isFailed) postsFailed++;

      const cName = String(row?.campaign_name || "").trim() || "Unassigned";
      if (!camp[cName]) {
        camp[cName] = { campaignName: cName, objective: row?.objective ?? null, posted: 0, failed: 0, queued: 0, total: 0, lastActivityAt: null };
      }
      camp[cName].total += 1;
      if (isQueued) camp[cName].queued += 1;
      if (isPosted) camp[cName].posted += 1;
      if (isFailed) camp[cName].failed += 1;

      const ts = String(row?.posted_at || row?.scheduled_for || row?.created_at || "").trim();
      if (ts) {
        if (!camp[cName].lastActivityAt) camp[cName].lastActivityAt = ts;
        else {
          const prev = new Date(camp[cName].lastActivityAt as string);
          const cur = new Date(ts);
          if (!isNaN(cur.getTime()) && !isNaN(prev.getTime()) && cur > prev) camp[cName].lastActivityAt = ts;
        }
      }
    }

    // last 7 days chart
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

    const campaignScoreboard = Object.values(camp)
      .sort((a, b) => b.posted - a.posted || b.total - a.total)
      .slice(0, 10);

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
        campaignName: String(row?.campaign_name || "").trim() || undefined,
        contentType: String(row?.content_type || "").trim() || undefined,
        objective: String(row?.objective || "").trim() || undefined,
      }))
      .filter((x) => x.id);

    // recommendations (coach-style)
    const recs: MetricsResponse["recommendations"] = [];

    const total7 = last7Days.reduce((s, p) => s + p.value, 0);
    if (total7 >= 7) recs.push({ title: "Strong consistency", tone: "good", detail: `You created ${total7} items in the last 7 days. Keep cadence steady — consistency beats intensity.` });
    else if (total7 >= 3) recs.push({ title: "Good momentum", tone: "info", detail: `You created ${total7} items in the last 7 days. Consider a simple rhythm: 3 posts/week + 1 short “story” post.` });
    else recs.push({ title: "Low output (easy win)", tone: "warn", detail: `Only ${total7} items in the last 7 days. The fastest lift is consistency: pick 2 fixed days and post something small.` });

    if (postsFailed > 0) recs.push({ title: "Fix failures before scaling", tone: "warn", detail: `${postsFailed} items show a failed/error status in the last ${windowDays} days. Resolve those first so your effort doesn’t leak.` });
    else recs.push({ title: "Posting reliability looks clean", tone: "good", detail: `No failed/error statuses detected in the last ${windowDays} days. Great base for scaling campaigns.` });

    const best = campaignScoreboard.find((c) => c.campaignName !== "Unassigned" && c.posted > 0);
    if (best) {
      const failRate = best.total > 0 ? Math.round((best.failed / best.total) * 100) : 0;
      recs.push({
        title: "Repeat your winner",
        tone: "good",
        detail: `Top campaign is “${best.campaignName}” (${best.posted} posted, ${best.total} total, ${failRate}% fail rate). Consider repeating the same theme with a new hook.`,
      });
    } else {
      recs.push({
        title: "Assign campaigns for better coaching",
        tone: "info",
        detail: "Most posts are unassigned. Once you tag posts to a campaign, you’ll get “what worked / what to repeat” insights.",
      });
    }

    // Replies are still 0 until we know your replies table in Supabase
    const repliesSent = 0;

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
      breakdowns: { statusCounts, platformCounts },
      charts: { last7Days },
      topContent,
      campaignScoreboard,
      recommendations: recs,
    };

    return NextResponse.json(out, { status: 200 });
  } catch (err: any) {
    console.error("[api/metrics] error", err);
    return NextResponse.json({ ok: false, error: err?.message || "Metrics API failed" }, { status: 200 });
  }
}
