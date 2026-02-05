// app/api/metrics/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";

export const runtime = "nodejs";

function toDateStr(d: Date) {
  return d.toISOString().slice(0, 10);
}

async function getSingleTenantOrganisationId(): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from("organisations")
    .select("id")
    .limit(1);

  if (error || !data || data.length === 0) return null;
  return String((data as any)[0].id);
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const orgFromQuery = String(searchParams.get("organisationId") || "").trim();
    const organisationId = orgFromQuery || (await getSingleTenantOrganisationId());

    if (!organisationId) {
      return NextResponse.json(
        { ok: false, error: "No organisation found." },
        { status: 200 }
      );
    }

    // last 90 days window (for “historical + current”)
    const since = new Date();
    since.setDate(since.getDate() - 90);

    // posts
    const postsQ = await supabaseAdmin
      .from("posts")
      .select("id, organisation_id, source, title, message, image_url, video_url, platforms, meta, created_at")
      .eq("organisation_id", organisationId)
      .gte("created_at", since.toISOString())
      .order("created_at", { ascending: false })
      .limit(500);

    // events
    const eventsQ = await supabaseAdmin
      .from("post_events")
      .select("id, organisation_id, post_id, platform, event_type, status, detail, created_at")
      .eq("organisation_id", organisationId)
      .gte("created_at", since.toISOString())
      .order("created_at", { ascending: false })
      .limit(2000);

    if (postsQ.error) {
      return NextResponse.json(
        { ok: false, error: postsQ.error.message },
        { status: 200 }
      );
    }

    if (eventsQ.error) {
      return NextResponse.json(
        { ok: false, error: eventsQ.error.message },
        { status: 200 }
      );
    }

    const posts = (postsQ.data || []) as any[];
    const events = (eventsQ.data || []) as any[];

    // --- KPI counts
    const totalPosts = posts.length;

    const countsByEventType: Record<string, number> = {};
    const countsByPlatform: Record<string, number> = {};
    const failuresByPlatform: Record<string, number> = {};
    const last7: Record<string, number> = {};

    // build last 7 days slots
    const today = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      last7[toDateStr(d)] = 0;
    }

    for (const e of events) {
      const t = String(e.event_type || "").trim() || "unknown";
      const p = String(e.platform || "").trim();

      countsByEventType[t] = (countsByEventType[t] || 0) + 1;
      if (p) countsByPlatform[p] = (countsByPlatform[p] || 0) + 1;

      if (String(e.status || "") === "error" && p) {
        failuresByPlatform[p] = (failuresByPlatform[p] || 0) + 1;
      }

      const createdAt = e.created_at ? new Date(e.created_at) : null;
      if (createdAt) {
        const key = toDateStr(createdAt);
        if (key in last7) last7[key] += 1;
      }
    }

    // --- “Top posts” (simple: most events attached)
    const eventsByPost: Record<string, number> = {};
    for (const e of events) {
      const pid = String(e.post_id || "").trim();
      if (!pid) continue;
      eventsByPost[pid] = (eventsByPost[pid] || 0) + 1;
    }

    const topPosts = posts
      .slice()
      .sort((a, b) => (eventsByPost[b.id] || 0) - (eventsByPost[a.id] || 0))
      .slice(0, 10)
      .map((p) => ({
        id: p.id,
        created_at: p.created_at,
        source: p.source,
        title: p.title,
        message_preview: String(p.message || "").slice(0, 140),
        platforms: p.platforms || [],
        event_count: eventsByPost[p.id] || 0,
      }));

    // --- Recommendations (simple but useful)
    const recs: { title: string; detail: string }[] = [];

    const totalFailures = Object.values(failuresByPlatform).reduce((a, b) => a + b, 0);
    if (totalFailures > 0) {
      const worst = Object.entries(failuresByPlatform).sort((a, b) => b[1] - a[1])[0];
      if (worst) {
        recs.push({
          title: "Reduce failures on your noisiest channel",
          detail: `${worst[0]} had ${worst[1]} errors in the last 90 days. Check token freshness + media format rules for that platform.`,
        });
      }
    }

    const posted = countsByEventType["posted"] || 0;
    const queued = countsByEventType["queued"] || countsByEventType["to_post"] || 0;

    if (queued > posted) {
      recs.push({
        title: "You’ve got posts queued up",
        detail: `There are more queued events (${queued}) than posted (${posted}). Encourage the user to review Approvals/Scheduled and push the backlog.`,
      });
    }

    // payload
    return NextResponse.json(
      {
        ok: true,
        organisationId,
        windowDays: 90,
        totals: {
          totalPosts,
          totalEvents: events.length,
        },
        byPlatform: countsByPlatform,
        failuresByPlatform,
        byEventType: countsByEventType,
        last7Days: Object.entries(last7).map(([date, value]) => ({ date, value })),
        topPosts,
        recommendations: recs,
      },
      { status: 200 }
    );
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || "Metrics route crashed" },
      { status: 200 }
    );
  }
}
