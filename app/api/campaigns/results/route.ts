// app/api/campaigns/results/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

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
  return String(data[0].id);
}

function n(input: any): number | null {
  if (input === null || input === undefined || input === "") return null;
  const x = Number(input);
  return Number.isFinite(x) ? x : null;
}

export async function GET(req: NextRequest) {
  try {
    const orgId =
      (req.nextUrl.searchParams.get("organisationId") || "").trim() ||
      (await getOrganisationId());
    if (!orgId) return NextResponse.json({ ok: false, error: "No organisation found." }, { status: 400 });

    const campaignId = (req.nextUrl.searchParams.get("campaignId") || "").trim();
    const variantId = (req.nextUrl.searchParams.get("variantId") || "").trim();
    const limit = Math.max(10, Math.min(500, Number(req.nextUrl.searchParams.get("limit") || "200")));

    let q = supabaseAdmin
      .from("campaign_variant_metrics")
      .select("id, organisation_id, campaign_id, variant_id, ctr, cpl, spend, clicks, impressions, leads, source, meta, reported_at, created_at")
      .eq("organisation_id", orgId)
      .order("reported_at", { ascending: false })
      .limit(limit);

    if (campaignId) q = q.eq("campaign_id", campaignId);
    if (variantId) q = q.eq("variant_id", variantId);

    const { data, error } = await q;
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    // Build deltas per variant (CTR Δ, CPL Δ) compared to previous entry
    const rows = (data || []) as any[];
    const lastByVariant: Record<string, any> = {};
    const withDelta = rows.map((r) => {
      const vid = String(r.variant_id || "");
      const prev = vid ? lastByVariant[vid] : null;

      const ctrDelta =
        prev && r.ctr != null && prev.ctr != null ? Number(r.ctr) - Number(prev.ctr) : null;
      const cplDelta =
        prev && r.cpl != null && prev.cpl != null ? Number(r.cpl) - Number(prev.cpl) : null;

      if (vid) lastByVariant[vid] = r;

      return { ...r, ctr_delta: ctrDelta, cpl_delta: cplDelta };
    });

    return NextResponse.json({ ok: true, organisationId: orgId, records: withDelta }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Failed to load results" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const orgId = String(body.organisationId || "").trim() || (await getOrganisationId());
    if (!orgId) return NextResponse.json({ ok: false, error: "No organisation found." }, { status: 400 });

    const campaignId = String(body.campaignId || "").trim();
    const variantId = String(body.variantId || "").trim();
    if (!campaignId) return NextResponse.json({ ok: false, error: "campaignId is required." }, { status: 400 });
    if (!variantId) return NextResponse.json({ ok: false, error: "variantId is required." }, { status: 400 });

    const payload: any = {
      organisation_id: orgId,
      campaign_id: campaignId,
      variant_id: variantId,
      reported_at: body.reported_at ? String(body.reported_at) : new Date().toISOString(),
      source: String(body.source || "manual"),
      ctr: n(body.ctr),
      cpl: n(body.cpl),
      spend: n(body.spend),
      clicks: body.clicks != null ? Math.max(0, Number(body.clicks)) : null,
      impressions: body.impressions != null ? Math.max(0, Number(body.impressions)) : null,
      leads: body.leads != null ? Math.max(0, Number(body.leads)) : null,
      meta: body.meta && typeof body.meta === "object" ? body.meta : null,
    };

    const { data, error } = await supabaseAdmin
      .from("campaign_variant_metrics")
      .insert(payload)
      .select()
      .single();

    if (error || !data) {
      return NextResponse.json({ ok: false, error: error?.message || "Failed to log result" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, record: data }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Failed to log result" }, { status: 500 });
  }
}
