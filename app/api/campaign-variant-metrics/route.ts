import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";

export const runtime = "nodejs";

function nOrNull(v: any) {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function iOrNull(v: any) {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  const i = Math.floor(n);
  return i >= 0 ? i : null;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({} as any));

    const variantId = String(body.variantId || "").trim();
    const campaignId = String(body.campaignId || "").trim();

    if (!variantId) {
      return NextResponse.json({ ok: false, error: "Missing variantId" }, { status: 400 });
    }
    if (!campaignId) {
      return NextResponse.json({ ok: false, error: "Missing campaignId" }, { status: 400 });
    }

    const impressions = iOrNull(body.impressions);
    const clicks = iOrNull(body.clicks);
    const leads = iOrNull(body.leads);
    const spend = nOrNull(body.spend);

    // Basic validation (only validate if provided)
    if (impressions !== null && impressions < 0) {
      return NextResponse.json({ ok: false, error: "Impressions must be >= 0" }, { status: 400 });
    }
    if (clicks !== null && clicks < 0) {
      return NextResponse.json({ ok: false, error: "Clicks must be >= 0" }, { status: 400 });
    }
    if (leads !== null && leads < 0) {
      return NextResponse.json({ ok: false, error: "Leads must be >= 0" }, { status: 400 });
    }
    if (spend !== null && spend < 0) {
      return NextResponse.json({ ok: false, error: "Spend must be >= 0" }, { status: 400 });
    }

    // Auto-calc CTR/CPL when possible
    const ctr =
      impressions && clicks !== null && impressions > 0
        ? clicks / impressions
        : null;

    const cpl =
      leads && spend !== null && leads > 0
        ? spend / leads
        : null;

    const source = String(body.source || "").trim() || null;
    const periodStart = String(body.period_start || "").trim() || null;
    const periodEnd = String(body.period_end || "").trim() || null;

    const meta =
      body.meta && typeof body.meta === "object" ? body.meta : null;

    const payload: any = {
      variant_id: variantId,
      campaign_id: campaignId,
      impressions,
      clicks,
      leads,
      spend,
      ctr,
      cpl,
      source,
      period_start: periodStart,
      period_end: periodEnd,
      meta,
      created_at: new Date().toISOString(),
    };

    const { data, error } = await supabaseAdmin
      .from("campaign_variant_metrics")
      .insert(payload)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, record: data }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Failed to log results" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const variantId = String(req.nextUrl.searchParams.get("variantId") || "").trim();
    if (!variantId) return NextResponse.json({ ok: false, error: "Missing variantId" }, { status: 400 });

    const { data, error } = await supabaseAdmin
      .from("campaign_variant_metrics")
      .select("id, variant_id, campaign_id, impressions, clicks, leads, spend, ctr, cpl, source, period_start, period_end, meta, created_at")
      .eq("variant_id", variantId)
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, records: data || [] }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Failed to load variant metrics" }, { status: 500 });
  }
}
