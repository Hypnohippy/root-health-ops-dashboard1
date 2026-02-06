// app/api/metrics/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";

export const runtime = "nodejs";

type MetricsResponse = {
  ok: boolean;
  organisationId?: string;
  windowDays?: number;
  query?: string;
  from?: string | null;
  to?: string | null;
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

  // ✅ NEW: campaign analytics “coach” view (history-aware)
  campaignInsights?: {
    campaignId: string;
    name: string;
    platform?: string | null;
    objective?: string | null;
    status?: string | null;

    variants: {
      variantId: string;
      ab_group: string | null;
      headline: string | null;
      primary_text_preview: string;
      media_url?: string | null;
      video_url?: string | null;

      latest?: {
        ctr?: number | null;
        cpl?: number | null;
        at?: string | null;
      };

      trend?: {
        ctrDelta?: number | null; // latest - previous
        cplDelta?: number | null; // latest - previous
      };

      coachNote: {
        tone: "good" | "warn" | "info";
        title: string;
        detail: string;
      };
      isWinner?: boolean;
    }[];

    coachSummary: {
      tone: "good" | "warn" | "info";
      title: string;
      detail: string;
    };
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

function parseDateMaybe(input: string | null): Date | null {
  if (!input) return null;
  const s = input.trim();
  if (!s) return null;

  // Accept YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const d = new Date(s + "T00:00:00.000Z");
    return isNaN(d.getTime()) ? null : d;
  }

  // Accept ISO
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

async function getSingleTenantOrganisationId(): Promise<string | null> {
  const { data, error } = await supabaseAdmin.from("organisations").select("id").limit(1);
  if (error || !data || data.length === 0) return null;
  return String((data as any)[0].id);
}

async function fetchScheduledPosts(orgId: string, limit = 800) {
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

function isInWindow(row: any, from: Date | null, to: Date | null) {
  const dStr = row?.scheduled_for || row?.created_at || null;
  if (!dStr) return true;

  const d = new Date(dStr);
  if (isNaN(d.getTime())) return true;

  if (from && d < from) return false;
  if (to && d > to) return false;
  return true;
}

function rowMatchesQuery(row: any, q: string) {
  const needle = q.toLowerCase().trim();
  if (!needle) return true;

  const msg = String(row?.message || "").toLowerCase();
  const campaign = String(row?.campaign_name || "").toLowerCase();
  const objective = String(row?.objective || "").toLowerCase();
  const contentType = String(row?.content_type || "").toLowerCase();
  const platforms = safeArray(row?.platforms).join(" ").toLowerCase();

  return (
    msg.includes(needle) ||
    campaign.includes(needle) ||
    objective.includes(needle) ||
    contentType.includes(needle) ||
    platforms.includes(needle)
  );
}

function toNumOrNull(v: any): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function formatPct(n: number | null | undefined) {
  if (n === null || n === undefined) return "—";
  // assume ctr might be provided as 0.012 or 1.2 depending on user; we’ll display intelligently
  if (n <= 1) return `${Math.round(n * 1000) / 10}%`; // 0.012 => 1.2%
  return `${Math.round(n * 10) / 10}%`; // 1.2 => 1.2%
}

function formatMoney(n: number | null | undefined) {
  if (n === null || n === undefined) return "—";
  return `£${Math.round(n * 100) / 100}`;
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);

    const windowDays = Math.max(7, Math.min(90, Number(url.searchParams.get("windowDays") || "30")));
    const q = (url.searchParams.get("q") || "").trim();

    const organisationId =
      String(url.searchParams.get("organisationId") || "").trim() ||
      (await getSingleTenantOrganisationId());

    if (!organisationId) {
      const out: MetricsResponse = { ok: false, error: "No organisation found for metrics." };
      return NextResponse.json(out, { status: 200 });
    }

    const now = new Date();

    // Default window: last windowDays
    const defaultFrom = new Date(now);
    defaultFrom.setDate(now.getDate() - windowDays);

    // Optional overrides
    const fromOverride = parseDateMaybe(url.searchParams.get("from"));
    const toOverride = parseDateMaybe(url.searchParams.get("to"));

    const from = fromOverride ?? defaultFrom;
    const to = toOverride ?? null;

    const scheduledPosts = await fetchScheduledPosts(organisationId, 800);

    // Apply window + query
    const inWindow = (scheduledPosts || [])
      .filter((r: any) => isInWindow(r, from, to))
      .filter((r: any) => (q ? rowMatchesQuery(r, q) : true));

    const statusCounts: Record<string, number> = {};
    const platformCounts: Record<string, number> = {};

    let postsQueued = 0;
    let postsPosted = 0;
    let postsFailed = 0;

    // campaign scoreboard map (based on scheduled_posts tags)
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

    // last 7 days chart (always last 7 relative to now)
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

    const topContent = (inWindow || [])
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

    if (postsFailed > 0) recs.push({ title: "Fix failures before scaling", tone: "warn", detail: `${postsFailed} items show a failed/error status in your current window. Resolve those first so your effort doesn’t leak.` });
    else recs.push({ title: "Posting reliability looks clean", tone: "good", detail: `No failed/error statuses detected in your current window. Great base for scaling campaigns.` });

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

    // Replies are still 0 until you wire replies in Supabase
    const repliesSent = 0;

    // ✅ NEW: Campaign Insights from campaigns + variants + metrics history
    // We keep it light and stable: only latest + previous metric per variant, then coach notes.

    // 1) load campaigns for org (optional search)
    let campaignsQuery = supabaseAdmin
      .from("campaigns")
      .select("id, organisation_id, name, platform, objective, status, created_at, updated_at")
      .eq("organisation_id", organisationId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (q) {
      // if your Supabase complains about ilike here, tell me and I'll switch to client-side filtering
      campaignsQuery = campaignsQuery.ilike("name", `%${q}%`);
    }

    const { data: campaigns, error: campErr } = await campaignsQuery;
    if (campErr) {
      // Don’t fail the whole metrics page if campaign tables are mid-migration
      console.warn("[api/metrics] campaigns load warning", campErr.message);
    }

    const campaignIds = (campaigns || []).map((c: any) => String(c.id)).filter(Boolean);

    // 2) load variants for those campaigns
    let variants: any[] = [];
    if (campaignIds.length > 0) {
      const { data: vData, error: vErr } = await supabaseAdmin
        .from("campaign_variants")
        .select("id, campaign_id, ab_group, headline, primary_text, media_url, video_url, status, created_at, updated_at")
        .in("campaign_id", campaignIds)
        .order("created_at", { ascending: false });

      if (vErr) {
        console.warn("[api/metrics] campaign_variants load warning", vErr.message);
      } else {
        variants = vData || [];
      }
    }

    // 3) load metrics history for those variants (latest 2 each)
    const variantIds = variants.map((v) => String(v.id)).filter(Boolean);

    let metricsRows: any[] = [];
    if (variantIds.length > 0) {
      const { data: mData, error: mErr } = await supabaseAdmin
        .from("campaign_variant_metrics")
        .select("id, variant_id, ctr, cpl, meta, created_at")
        .in("variant_id", variantIds)
        .order("created_at", { ascending: false })
        .limit(500);

      if (mErr) {
        console.warn("[api/metrics] campaign_variant_metrics load warning", mErr.message);
      } else {
        metricsRows = mData || [];
      }
    }

    const metricsByVariant: Record<string, any[]> = {};
    for (const r of metricsRows) {
      const vid = String(r?.variant_id || "");
      if (!vid) continue;
      if (!metricsByVariant[vid]) metricsByVariant[vid] = [];
      // keep only latest 2
      if (metricsByVariant[vid].length < 2) metricsByVariant[vid].push(r);
    }

    // Helper: determine winner (prefer CPL lowest, else CTR highest)
    function computeWinner(variantSummaries: any[]) {
      const withCpl = variantSummaries.filter((v) => v.latest?.cpl !== null && v.latest?.cpl !== undefined);
      if (withCpl.length >= 1) {
        withCpl.sort((a, b) => (a.latest.cpl ?? 1e9) - (b.latest.cpl ?? 1e9));
        return withCpl[0]?.variantId || null;
      }
      const withCtr = variantSummaries.filter((v) => v.latest?.ctr !== null && v.latest?.ctr !== undefined);
      if (withCtr.length >= 1) {
        withCtr.sort((a, b) => (b.latest.ctr ?? -1) - (a.latest.ctr ?? -1));
        return withCtr[0]?.variantId || null;
      }
      return null;
    }

    const variantsByCampaign: Record<string, any[]> = {};
    for (const v of variants) {
      const cid = String(v?.campaign_id || "");
      if (!cid) continue;
      if (!variantsByCampaign[cid]) variantsByCampaign[cid] = [];
      variantsByCampaign[cid].push(v);
    }

    const campaignInsights: MetricsResponse["campaignInsights"] = (campaigns || [])
      .slice(0, 10)
      .map((c: any) => {
        const cid = String(c.id);
        const vList = (variantsByCampaign[cid] || []).slice(0, 6);

        const variantSummaries = vList.map((v: any) => {
          const vid = String(v.id);
          const m = metricsByVariant[vid] || [];
          const latest = m[0] || null;
          const prev = m[1] || null;

          const latestCtr = latest ? toNumOrNull(latest.ctr) : null;
          const latestCpl = latest ? toNumOrNull(latest.cpl) : null;

          const prevCtr = prev ? toNumOrNull(prev.ctr) : null;
          const prevCpl = prev ? toNumOrNull(prev.cpl) : null;

          const ctrDelta = latestCtr !== null && prevCtr !== null ? latestCtr - prevCtr : null;
          const cplDelta = latestCpl !== null && prevCpl !== null ? latestCpl - prevCpl : null;

          // Coach note per variant
          let tone: "good" | "warn" | "info" = "info";
          let title = "Add results to unlock coaching";
          let detail =
            "This variant has no CTR/CPL history yet. Add one result entry and I’ll start recommending winners.";

          if (latestCtr !== null || latestCpl !== null) {
            // If CPL exists: lower is better
            if (latestCpl !== null) {
              if (cplDelta !== null && cplDelta < 0) {
                tone = "good";
                title = "Cost improving";
                detail = `Latest CPL is ${formatMoney(latestCpl)} (down vs previous). This is a strong candidate to repeat.`;
              } else if (cplDelta !== null && cplDelta > 0) {
                tone = "warn";
                title = "Cost rising";
                detail = `Latest CPL is ${formatMoney(latestCpl)} (up vs previous). Consider changing the hook or audience keywords.`;
              } else {
                tone = "info";
                title = "Cost snapshot";
                detail = `Latest CPL is ${formatMoney(latestCpl)}. Add another datapoint later to see trend.`;
              }
            } else if (latestCtr !== null) {
              // CTR exists: higher is better
              if (ctrDelta !== null && ctrDelta > 0) {
                tone = "good";
                title = "Engagement improving";
                detail = `Latest CTR is ${formatPct(latestCtr)} (up vs previous). Keep this angle and test a stronger headline.`;
              } else if (ctrDelta !== null && ctrDelta < 0) {
                tone = "warn";
                title = "Engagement dropping";
                detail = `Latest CTR is ${formatPct(latestCtr)} (down vs previous). Consider a new opening line (first 10 words).`;
              } else {
                tone = "info";
                title = "Engagement snapshot";
                detail = `Latest CTR is ${formatPct(latestCtr)}. Add another datapoint later to see trend.`;
              }
            }
          }

          return {
            variantId: vid,
            ab_group: v?.ab_group ?? null,
            headline: v?.headline ?? null,
            primary_text_preview: previewText(v?.primary_text, 140),
            media_url: v?.media_url ?? null,
            video_url: v?.video_url ?? null,
            latest: latest
              ? { ctr: latestCtr, cpl: latestCpl, at: String(latest.created_at || "") || null }
              : { ctr: null, cpl: null, at: null },
            trend: { ctrDelta, cplDelta },
            coachNote: { tone, title, detail },
            isWinner: false,
          };
        });

        const winnerId = computeWinner(variantSummaries);
        const withWinner = variantSummaries.map((v: any) => ({
          ...v,
          isWinner: winnerId ? v.variantId === winnerId : false,
        }));

        // Campaign-level summary
        const anyData = withWinner.some((v: any) => (v.latest?.ctr ?? null) !== null || (v.latest?.cpl ?? null) !== null);
        const winner = withWinner.find((v: any) => v.isWinner);

        let campTone: "good" | "warn" | "info" = "info";
        let campTitle = "No results logged yet";
        let campDetail =
          "This campaign is ready for history tracking. Add CTR/CPL results for variants to identify what to repeat.";

        if (anyData && winner) {
          campTone = "good";
          campTitle = "Winner identified";
          const bits: string[] = [];
          if (winner.latest?.cpl !== null && winner.latest?.cpl !== undefined) bits.push(`CPL ${formatMoney(winner.latest.cpl)}`);
          if (winner.latest?.ctr !== null && winner.latest?.ctr !== undefined) bits.push(`CTR ${formatPct(winner.latest.ctr)}`);
          campDetail = `Variant ${winner.ab_group || "?"} is currently strongest (${bits.join(" · ") || "has data"}). Repeat this angle and test 1 new headline + 1 new hook.`;
        } else if (anyData) {
          campTone = "info";
          campTitle = "Some signal, not enough trend";
          campDetail = "You’ve logged at least one result. Add a second datapoint per variant to see trends and get confident recommendations.";
        }

        return {
          campaignId: cid,
          name: String(c?.name || "Untitled"),
          platform: c?.platform ?? null,
          objective: c?.objective ?? null,
          status: c?.status ?? null,
          variants: withWinner,
          coachSummary: { tone: campTone, title: campTitle, detail: campDetail },
        };
      });

    const out: MetricsResponse = {
      ok: true,
      organisationId,
      windowDays,
      query: q || undefined,
      from: fromOverride ? fromOverride.toISOString() : null,
      to: toOverride ? toOverride.toISOString() : null,

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
      campaignInsights,
      recommendations: recs,
    };

    return NextResponse.json(out, { status: 200 });
  } catch (err: any) {
    console.error("[api/metrics] error", err);
    return NextResponse.json({ ok: false, error: err?.message || "Metrics API failed" }, { status: 200 });
  }
}
