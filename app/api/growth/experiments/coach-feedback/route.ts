// app/api/growth/experiments/coach-feedback/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

function norm(v: any) {
  return String(v ?? "").trim();
}

function safeUuidLike(s: any) {
  const v = String(s || "").trim();
  if (!v) return null;
  if (!/^[0-9a-fA-F-]{16,}$/.test(v)) return null;
  return v;
}

function platformLabel(p?: string | null) {
  const k = String(p || "").toLowerCase();
  if (k === "facebook") return "Facebook";
  if (k === "instagram") return "Instagram";
  if (k === "threads") return "Threads";
  if (k === "linkedin") return "LinkedIn";
  if (k === "tiktok") return "TikTok";
  return p || "Unknown";
}

function nice(s?: string | null) {
  return String(s || "").trim() || "—";
}

function uniq(list: string[]) {
  const out: string[] = [];
  for (const x of list) if (x && !out.includes(x)) out.push(x);
  return out;
}

function top(list: string[], max = 4) {
  return uniq(list.map((x) => x.trim()).filter(Boolean)).slice(0, max);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const experimentId = safeUuidLike(body?.experimentId || body?.experiment_id);

    if (!experimentId) {
      return NextResponse.json({ success: false, error: "Missing experimentId" }, { status: 400 });
    }

    // Experiment
    const expRes = await supabaseAdmin
      .from("growth_experiments")
      .select("*")
      .eq("id", experimentId)
      .maybeSingle();

    if (expRes.error) throw new Error(expRes.error.message);
    const exp = expRes.data;

    if (!exp) {
      return NextResponse.json({ success: false, error: "Experiment not found" }, { status: 404 });
    }

    // Events
    const eventsRes = await supabaseAdmin
      .from("growth_experiment_events")
      .select("platform, ok, action, meta, created_at")
      .eq("experiment_id", experimentId)
      .order("created_at", { ascending: false })
      .limit(80);

    if (eventsRes.error) throw new Error(eventsRes.error.message);
    const events = Array.isArray(eventsRes.data) ? eventsRes.data : [];

    // Outcomes
    const outRes = await supabaseAdmin
      .from("growth_experiment_outcomes")
      .select("metric_name, metric_value, meta, created_at")
      .eq("experiment_id", experimentId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (outRes.error) throw new Error(outRes.error.message);
    const outcomesRaw = Array.isArray(outRes.data) ? outRes.data : [];

    const outcomes = outcomesRaw.map((o: any) => ({
      metric_name: norm(o.metric_name),
      metric_value:
        o.metric_value === null || o.metric_value === undefined ? null : Number(o.metric_value),
      note: o?.meta?.note ? String(o.meta.note) : null,
    }));

    const okCount = events.filter((e: any) => !!e?.ok).length;
    const failCount = events.filter((e: any) => e && e.ok === false).length;

    const platformsOk = uniq(
      events
        .filter((e: any) => !!e?.ok)
        .map((e: any) => platformLabel(e?.platform))
        .filter(Boolean)
    );

    const platformsFailed = uniq(
      events
        .filter((e: any) => e && e.ok === false)
        .map((e: any) => platformLabel(e?.platform))
        .filter(Boolean)
    );

    const attempted = uniq(
      events
        .filter((e: any) => {
          const a = norm(e?.action).toLowerCase();
          return a === "post_attempt" || a === "queued" || a === "posted" || a === "publish";
        })
        .map((e: any) => `${norm(e?.platform)}-${norm(e?.created_at)}`)
    ).length;

    // pull a few recent error strings from meta if present
    const recentErrors: string[] = [];
    for (const ev of events) {
      const m = (ev as any)?.meta;
      const rawErr =
        m?.error ||
        m?.raw?.error ||
        m?.raw?.details?.error?.message ||
        m?.raw?.error?.message ||
        null;
      if (rawErr) recentErrors.push(String(rawErr).slice(0, 180));
      if (recentErrors.length >= 6) break;
    }

    const fmt = String(exp.format || "").toLowerCase();
    const pt = String(exp.pattern_type || "").toLowerCase();
    const plat = platformLabel(exp.platform);

    const keep: string[] = [];
    const change: string[] = [];
    const next: string[] = [];

    if (okCount > 0) {
      keep.push(`You shipped. Keep the same ${plat} rhythm for 2–3 posts before judging this experiment.`);
    } else {
      keep.push(`Keep the experiment small: one idea, one CTA, and if needed—one platform.`);
    }

    if (pt) keep.push(`Keep the core pattern (“${pt}”). Don’t change everything at once.`);

    if (failCount > 0) {
      change.push(
        `Some channels failed (${platformsFailed.join(", ") || "unknown"}). Fix delivery first (reconnect, simplify media, test text-only once).`
      );
    }

    if (fmt === "video") {
      change.push(`If performance is weak, shorten the opening: hook in the first 1–2 lines, then value, then CTA.`);
    }

    if (fmt === "text") {
      change.push(`If engagement is low, try a “one question” CTA instead of a big call-to-action.`);
    }

    const errText = recentErrors.join(" ").toLowerCase();
    if (errText.includes("token") || errText.includes("expired") || errText.includes("oauth")) {
      change.push(`A token/login issue appears in recent errors. Reconnect the platform before testing content.`);
    }
    if (errText.includes("processing") || errText.includes("media")) {
      change.push(`Media processing issues appeared. Try re-uploading and waiting 30–60s, or use image/text as a control test.`);
    }

    const sumMetric = (name: string) =>
      outcomes
        .filter((o) => String(o.metric_name || "").toLowerCase() === name)
        .reduce((acc, o) => acc + (Number.isFinite(o.metric_value as any) ? Number(o.metric_value) : 0), 0);

    const leads = sumMetric("leads");
    const bookings = sumMetric("bookings");
    const dms = sumMetric("dms");

    if (leads > 0 || bookings > 0 || dms > 0) {
      keep.push(`You logged real signals (Leads: ${leads}, Bookings: ${bookings}, DMs: ${dms}). Replicate this once before changing it.`);
      next.push(`Replicate once: same topic + same pattern + same format. Change only ONE variable (hook OR CTA).`);
    } else {
      next.push(`After your next post, log one result (leads/bookings/DMs) 24–72h later. That’s what makes the learning real.`);
      next.push(`Run 2–3 posts total before completing the experiment.`);
    }

    next.push(`Mini science rule: change one variable at a time (hook OR format OR CTA), not all three.`);

    return NextResponse.json(
      {
        success: true,
        experimentId,
        headline: "Here’s what your experiment is telling you (based on your events + results).",
        keep: top(keep, 4),
        change: top(change, 4),
        next: top(next, 4),
        snapshot: {
          postsAttempted: attempted,
          postsOk: okCount,
          postsFailed: failCount,
          platformsOk,
          platformsFailed,
          outcomes,
        },
      },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message || "Coach feedback failed." },
      { status: 500 }
    );
  }
}
