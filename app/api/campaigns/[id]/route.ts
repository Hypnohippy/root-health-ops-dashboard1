// app/api/campaigns/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

export const runtime = "nodejs";

// Single-tenant org resolver (same pattern you already use)
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

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> } // ✅ Next 16 expects params as a Promise
) {
  try {
    const { id } = await ctx.params;
    const campaignId = String(id || "").trim();
    if (!campaignId) {
      return NextResponse.json({ ok: false, error: "Missing campaign id." }, { status: 400 });
    }

    const orgId =
      (req.nextUrl.searchParams.get("organisationId") || "").trim() ||
      (await getOrganisationId());

    if (!orgId) {
      return NextResponse.json({ ok: false, error: "No organisation found." }, { status: 400 });
    }

    // 1) Load campaign
    const { data: campaign, error: cErr } = await supabaseAdmin
      .from("campaigns")
      .select(
        `
        id, organisation_id, name, platform, objective, status,
        budget_daily, start_date, end_date, landing_url,
        utm_source, utm_medium, utm_campaign,
        meta, created_at, updated_at,
        campaign_variants (
          id, campaign_id, ab_group, headline, primary_text, media_url, video_url, status, meta, created_at, updated_at
        )
      `
      )
      .eq("organisation_id", orgId)
      .eq("id", campaignId)
      .maybeSingle();

    if (cErr) {
      return NextResponse.json({ ok: false, error: cErr.message }, { status: 500 });
    }

    if (!campaign) {
      return NextResponse.json({ ok: false, error: "Campaign not found for this organisation." }, { status: 404 });
    }

    // 2) Pull latest metrics per variant (optional, but powers the coach cards)
    const variantIds = Array.isArray((campaign as any)?.campaign_variants)
      ? (campaign as any).campaign_variants.map((v: any) => v?.id).filter(Boolean)
      : [];

    let latestByVariant: Record<string, { ctr: number | null; cpl: number | null; at: string | null }> = {};

    if (variantIds.length > 0) {
      const { data: metricsRows, error: mErr } = await supabaseAdmin
        .from("campaign_variant_metrics")
        .select("id, variant_id, ctr, cpl, created_at")
        .in("variant_id", variantIds)
        .order("created_at", { ascending: false })
        .limit(500);

      if (!mErr && Array.isArray(metricsRows)) {
        for (const row of metricsRows) {
          const vid = String((row as any)?.variant_id || "").trim();
          if (!vid) continue;
          if (latestByVariant[vid]) continue; // first one wins because sorted DESC
          latestByVariant[vid] = {
            ctr: (row as any)?.ctr ?? null,
            cpl: (row as any)?.cpl ?? null,
            at: (row as any)?.created_at ?? null,
          };
        }
      }
    }

    return NextResponse.json(
      {
        ok: true,
        organisationId: orgId,
        campaign,
        latestByVariant,
      },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Failed to load campaign." }, { status: 500 });
  }
}
