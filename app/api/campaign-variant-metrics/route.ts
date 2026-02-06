// app/api/campaign-variant-metrics/route.ts
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
  return String(data[0].id);
}

function toNumberOrNull(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function GET(req: NextRequest) {
  try {
    const orgId =
      (req.nextUrl.searchParams.get("organisationId") || "").trim() ||
      (await getOrganisationId());

    if (!orgId) {
      return NextResponse.json({ ok: false, error: "No organisation found." }, { status: 200 });
    }

    const q = (req.nextUrl.searchParams.get("q") || "").trim();
    const campaignId = (req.nextUrl.searchParams.get("campaignId") || "").trim();
    const variantId = (req.nextUrl.searchParams.get("variantId") || "").trim();

    const limit = Math.max(
      1,
      Math.min(500, Number(req.nextUrl.searchParams.get("limit") || "50"))
    );

    // Date filtering (optional)
    const from = (req.nextUrl.searchParams.get("from") || "").trim(); // ISO date/time or YYYY-MM-DD
    const to = (req.nextUrl.searchParams.get("to") || "").trim();

    // Join: metrics -> variants -> campaigns (so search works)
    let query = supabaseAdmin
      .from("campaign_variant_metrics")
      .select(
        `
        id, ctr, cpl, meta, created_at, variant_id,
        campaign_variants (
          id, ab_group, headline, primary_text, campaign_id,
          campaigns ( id, organisation_id, name, platform, objective )
        )
      `
      )
      .order("created_at", { ascending: false })
      .limit(limit);

    if (variantId) query = query.eq("variant_id", variantId);
    if (campaignId) query = query.eq("campaign_variants.campaign_id", campaignId);

    // ensure org scope via joined campaigns table
    query = query.eq("campaign_variants.campaigns.organisation_id", orgId);

    if (from) query = query.gte("created_at", from);
    if (to) query = query.lte("created_at", to);

    if (q) {
      // Search across campaign name + variant headline/primary_text
      // (Supabase supports ilike on joined fields in many setups; if yours complains, tell me and I'll adjust.)
      query = query.or(
        [
          `campaign_variants.headline.ilike.%${q}%`,
          `campaign_variants.primary_text.ilike.%${q}%`,
          `campaign_variants.campaigns.name.ilike.%${q}%`,
        ].join(",")
      );
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 200 });
    }

    return NextResponse.json({ ok: true, organisationId: orgId, records: data || [] }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Failed to load metrics history" }, { status: 200 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));

    const orgId = String(body.organisationId || "").trim() || (await getOrganisationId());
    if (!orgId) return NextResponse.json({ ok: false, error: "No organisation found." }, { status: 200 });

    const variantId = String(body.variantId || "").trim();
    if (!variantId) return NextResponse.json({ ok: false, error: "Missing variantId" }, { status: 200 });

    // Guard: ensure variant belongs to org (prevents cross-org writes)
    const { data: vRow, error: vErr } = await supabaseAdmin
      .from("campaign_variants")
      .select(`id, campaign_id, campaigns ( id, organisation_id )`)
      .eq("id", variantId)
      .maybeSingle();

    if (vErr || !vRow) {
      return NextResponse.json({ ok: false, error: "Variant not found." }, { status: 200 });
    }

    const vOrg = (vRow as any)?.campaigns?.organisation_id;
    if (!vOrg || String(vOrg) !== orgId) {
      return NextResponse.json({ ok: false, error: "Variant does not belong to this organisation." }, { status: 200 });
    }

    const ctr = toNumberOrNull(body.ctr);
    const cpl = toNumberOrNull(body.cpl);

    if (ctr === null && cpl === null) {
      return NextResponse.json(
        { ok: false, error: "Provide at least one metric: ctr or cpl" },
        { status: 200 }
      );
    }

    const payload: any = {
      variant_id: variantId,
      ctr,
      cpl,
      meta: body.meta && typeof body.meta === "object" ? body.meta : null,
      created_at: new Date().toISOString(),
    };

    const { data, error } = await supabaseAdmin
      .from("campaign_variant_metrics")
      .insert(payload)
      .select()
      .single();

    if (error || !data) {
      return NextResponse.json({ ok: false, error: error?.message || "Failed to save metric row" }, { status: 200 });
    }

    return NextResponse.json({ ok: true, saved: data }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Failed to save metric row" }, { status: 200 });
  }
}
