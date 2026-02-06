import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";

export const runtime = "nodejs";

async function getOrganisationId(): Promise<string | null> {
  const forced = (process.env.NEXT_PUBLIC_SINGLE_ORG_ID || "").trim();
  if (forced) return forced;

  const { data, error } = await supabaseAdmin
    .from("organisations")
    .select("id")
    .order("created_at", { ascending: true })
    .limit(1);

  if (error || !data || data.length === 0) return null;
  return String((data as any)[0].id);
}

function toNumOrNull(v: any): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "string" && v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function calcCtr(clicks: number | null, impressions: number | null, fallbackCtr: number | null) {
  if (fallbackCtr !== null) return fallbackCtr;
  if (clicks === null || impressions === null) return null;
  if (impressions <= 0) return null;
  return clicks / impressions;
}

function calcCpl(spend: number | null, leads: number | null, fallbackCpl: number | null) {
  if (fallbackCpl !== null) return fallbackCpl;
  if (spend === null || leads === null) return null;
  if (leads <= 0) return null;
  return spend / leads;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));

    const organisationId = await getOrganisationId();
    if (!organisationId) {
      return NextResponse.json({ ok: false, error: "No organisation found." }, { status: 200 });
    }

    const campaignId = String(body.campaignId || "").trim();
    const variantId = String(body.variantId || "").trim();
    if (!campaignId) return NextResponse.json({ ok: false, error: "Missing campaignId." }, { status: 200 });
    if (!variantId) return NextResponse.json({ ok: false, error: "Missing variantId." }, { status: 200 });

    // Validate campaign belongs to org
    const { data: campaign, error: cErr } = await supabaseAdmin
      .from("campaigns")
      .select("id, organisation_id")
      .eq("id", campaignId)
      .single();

    if (cErr || !campaign) {
      return NextResponse.json({ ok: false, error: cErr?.message || "Campaign not found." }, { status: 200 });
    }

    if (String((campaign as any).organisation_id) !== organisationId) {
      return NextResponse.json({ ok: false, error: "Campaign does not belong to this organisation." }, { status: 200 });
    }

    // Validate variant belongs to campaign
    const { data: variant, error: vErr } = await supabaseAdmin
      .from("campaign_variants")
      .select("id, campaign_id")
      .eq("id", variantId)
      .single();

    if (vErr || !variant) {
      return NextResponse.json({ ok: false, error: vErr?.message || "Variant not found." }, { status: 200 });
    }

    if (String((variant as any).campaign_id) !== campaignId) {
      return NextResponse.json({ ok: false, error: "Variant does not belong to this campaign." }, { status: 200 });
    }

    const impressions = toNumOrNull(body.impressions);
    const clicks = toNumOrNull(body.clicks);
    const leads = toNumOrNull(body.leads);
    const spend = toNumOrNull(body.spend);

    const ctrProvided = toNumOrNull(body.ctr);
    const cplProvided = toNumOrNull(body.cpl);

    const ctr = calcCtr(clicks, impressions, ctrProvided);
    const cpl = calcCpl(spend, leads, cplProvided);

    const source = String(body.source || "").trim() || null;
    const period_start = String(body.period_start || "").trim() || null;
    const period_end = String(body.period_end || "").trim() || null;

    const payload: any = {
      campaign_id: campaignId,
      variant_id: variantId,
      impressions,
      clicks,
      leads,
      spend,
      ctr,
      cpl,
      source,
      period_start,
      period_end,
      meta: body.meta && typeof body.meta === "object" ? body.meta : null,
      created_at: new Date().toISOString(),
    };

    const { data: inserted, error: iErr } = await supabaseAdmin
      .from("campaign_variant_metrics")
      .insert(payload)
      .select("id, variant_id, campaign_id, ctr, cpl, created_at")
      .single();

    if (iErr || !inserted) {
      return NextResponse.json({ ok: false, error: iErr?.message || "Failed to log results." }, { status: 200 });
    }

    return NextResponse.json({ ok: true, record: inserted }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Failed to log results." }, { status: 200 });
  }
}
