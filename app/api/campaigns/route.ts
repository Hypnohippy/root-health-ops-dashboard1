// app/api/campaigns/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";

export const runtime = "nodejs";

async function getOrganisationId(): Promise<string | null> {
  // Optional: force a specific org via env var (useful in beta)
  const forced = (process.env.NEXT_PUBLIC_SINGLE_ORG_ID || "").trim();
  if (forced) return forced;

  // Otherwise, take the first org (single-tenant beta mode)
  const { data, error } = await supabaseAdmin
    .from("organisations")
    .select("id")
    .order("created_at", { ascending: true })
    .limit(1);

  if (error || !data || data.length === 0) return null;
  return String(data[0].id);
}

export async function GET(req: NextRequest) {
  try {
    const organisationId = await getOrganisationId();
    if (!organisationId) {
      return NextResponse.json(
        { ok: false, error: "No organisation found." },
        { status: 400 }
      );
    }

    const url = new URL(req.url);
    const platform = (url.searchParams.get("platform") || "").trim();
    const objective = (url.searchParams.get("objective") || "").trim();
    const status = (url.searchParams.get("status") || "").trim();

    // 1) Load campaigns
    let q = supabaseAdmin
      .from("campaigns")
      .select(
        "id, organisation_id, name, platform, objective, status, budget_daily, start_date, end_date, url, utm_source, utm_medium, utm_campaign, meta, created_at, updated_at"
      )
      .eq("organisation_id", organisationId)
      .order("created_at", { ascending: false });

    if (platform) q = q.eq("platform", platform);
    if (objective) q = q.eq("objective", objective);
    if (status) q = q.eq("status", status);

    const { data: campaigns, error: cErr } = await q;

    if (cErr) {
      return NextResponse.json(
        { ok: false, error: cErr.message },
        { status: 500 }
      );
    }

    const ids = (campaigns || []).map((c: any) => c.id).filter(Boolean);

    // 2) Load variants for those campaigns
    let variants: any[] = [];
    if (ids.length > 0) {
      const { data: vData, error: vErr } = await supabaseAdmin
        .from("campaign_variants")
        .select(
          "id, campaign_id, ab_group, headline, primary_text, status, media_url, video_url, meta, created_at, updated_at"
        )
        .in("campaign_id", ids)
        .order("created_at", { ascending: true });

      if (vErr) {
        return NextResponse.json(
          { ok: false, error: vErr.message },
          { status: 500 }
        );
      }

      variants = vData || [];
    }

    const variantsByCampaign: Record<string, any[]> = {};
    for (const v of variants) {
      const k = String(v.campaign_id || "");
      if (!k) continue;
      if (!variantsByCampaign[k]) variantsByCampaign[k] = [];
      variantsByCampaign[k].push(v);
    }

    const out = (campaigns || []).map((c: any) => ({
      ...c,
      variants: variantsByCampaign[String(c.id)] || [],
    }));

    return NextResponse.json({
      ok: true,
      organisationId,
      campaigns: out,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Failed to load campaigns" },
      { status: 500 }
    );
  }
}
