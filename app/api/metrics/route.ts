// app/api/metrics/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";

export const runtime = "nodejs";

function toDateStr(d: Date) {
  return d.toISOString().slice(0, 10);
}

function safeStr(x: any) {
  return String(x ?? "").trim();
}

function safeArr(x: any): string[] {
  if (Array.isArray(x)) return x.map((v) => safeStr(v)).filter(Boolean);
  if (typeof x === "string" && x.trim()) return x.split(",").map((v) => v.trim()).filter(Boolean);
  return [];
}

async function getSingleTenantOrganisationId(): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from("organisations")
    .select("id")
    .limit(1);

  if (error || !data || data.length === 0) return null;
  return String((data as any)[0].id);
}

type ScheduledRow = {
  id?: string;
  organisation_id?: string;
  created_at?: string;
  scheduled_at?: string;
  status?: string; // pending / approved / to_post / sent / posted / failed ...
  platforms?: any; // text[] or string
  platform?: string; // single platform (some schemas do this)
  message?: string;
  text?: string;
  image_url?: string;
  video_url?: string;
  media_url?: string;
  meta?: any; // jsonb
};

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

    // We are using scheduled_posts as the backbone.
    // This query is defensive: if your table has fewer columns, Supabase may error
    // if we select missing columns. So we select "*" and normalize in code.
    const q = await supabaseAdmin
      .from("scheduled_posts")
      .select("*")
      .eq("organisation_id", organisationId)
      .gte("created_at", since.toISOString())
      .order("created_at", { ascending: false })
      .limit(2000);

    if (q.error) {
      return NextResponse.json(
        {
          ok: false,
          error: q.error.message,
          hint:
            "If scheduled_posts doesn’t exist (or has a different name), tell me your table names and I’ll align it.",
        },
        { status: 200 }
      );
    }

    const rows = (q.data || []) as ScheduledRow[];

    // ---- Build KPIs + breakdowns -------------------------------------------
    const statusCounts: Record<string, number> = {};
    const platformCounts: Record<string, number> = {};
    const failuresByPlatform: Record<string, number> = {};

    let postsTotal = rows.length;
    let postsQueued = 0; // to_post / queued / pending
    let postsPosted = 0; // posted
    let postsFailed = 0; // failed/error
    let repliesSent = 0; // optional (if you store replies in scheduled_posts meta)

    // last 7 days activity
    const last7: Record<string, number> = {};
    const today = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      last7[toDateStr(d)] = 0;
    }

    // top content by “recentness + status signal”
    // (later we can do proper engagement ranking when we store engagement metrics)
    const normalized = rows.map((r) => {
      const status = safeStr((r as any).status || (r as any).state || (r as any).post_status || "");
      const createdAt = safeStr((r as any).created_at || (r as any).createdTime || "");
      const scheduledAt = safeStr((r as any).scheduled_at || (r as any).scheduledAt || "");
      const message = safeStr((r as any).message || (r as any).text || "");
      const meta = (r as any).meta || {};
      const platforms =
        safeArr((r as any).platforms).length > 0
          ? safeArr((r as any).platforms)
          : safeStr((r as any).platform)
          ? [safeStr((r as any).platform)]
          : safeArr(meta?.platforms);

      const imageUrl = safeStr((r as any).image_url || meta?.image_url || meta?.imageUrl || "");
      const videoUrl = safeStr((r as any).video_url || meta?.video_url || meta?.videoUrl || meta?.videoUrl || "");

      return {
        id: safeStr((r as any).id || ""),
        status: status || "—",
        created_at: createdAt,
        scheduled_at: scheduledAt,
        message,
        message_preview: message.slice(0, 160),
        platforms,
        imageUrl,
        videoUrl,
        meta,
      };
    });

    for (const item of normalized) {
      statusCounts[item.status] = (statusCounts[item.status] || 0) + 1;

      for (const p of item.platforms) {
        platformCounts[p] = (platformCounts[p] || 0) + 1;
      }

      const s = item.status.toLowerCase();

      // queued-ish
      if (s.includes("to_post") || s.includes("queued") || s.includes("pending") || s.includes("scheduled")) postsQueued++;

      // posted-ish
      if (s.includes("posted") || s.includes("published")) postsPosted++;

      // failed-ish
      if (s.includes("fail") || s.includes("error")) {
        postsFailed++;
        for (const p of item.platforms) {
          failuresByPlatform[p] = (failuresByPlatform[p] || 0) + 1;
        }
      }

      // repliesSent (optional): if you store reply events in meta
      // Example: meta.reply_status === "sent"
      if (safeStr((item.meta as any)?.reply_status).toLowerCase() === "sent") repliesSent++;

      const created = item.created_at ? new Date(item.created_at) : null;
      if (created && !isNaN(created.getTime())) {
        const key = toDateStr(created);
        if (key in last7) last7[key] += 1;
      }
    }

    const last7Days = Object.entries(last7).map(([date, value]) => ({ date, value }));

    // ---- Recommendations (simple but powerful) ------------------------------
    const recs: { title: string; detail: string; tone?: "good" | "warn" | "info" }[] = [];

    const queued = postsQueued;
    const posted = postsPosted;

    if (queued > posted) {
      recs.push({
        title: "Backlog building",
        detail: `You’ve got ${queued} items queued vs ${posted} posted. Nudge users to clear Approvals/Scheduled and keep momentum.`,
        tone: "warn",
      });
    } else {
      recs.push({
        title: "Healthy throughput",
        detail: `Nice — queued (${queued}) is not outpacing posted (${posted}). Keep this cadence.`,
        tone: "good",
      });
    }

    const totalFailures = Object.values(failuresByPlatform).reduce((a, b) => a + b, 0);
    if (totalFailures > 0) {
      const worst = Object.entries(failuresByPlatform).sort((a, b) => b[1] - a[1])[0];
      recs.push({
        title: "Fix your noisiest failure channel",
        detail: `${worst[0]} shows ${worst[1]} failures in the last ${days} days. Most common causes are token expiry + media format rules.`,
        tone: "warn",
      });
    } else {
      recs.push({
        title: "Posting reliability looks strong",
        detail: `No failures detected in the last ${days} days (from scheduled_posts statuses).`,
        tone: "good",
      });
    }

    // “Top content” = most recently posted/queued with multiple platforms
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
      .slice(0, 12);

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
    return NextResponse.json(
      { ok: false, error: err?.message || "Metrics route crashed" },
      { status: 200 }
    );
  }
}
