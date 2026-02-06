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

export async function GET(req: NextRequest) {
  try {
    const orgId = (req.nextUrl.searchParams.get("organisationId") || "").trim() || (await getOrganisationId());
    if (!orgId) return NextResponse.json({ error: "No organisation found." }, { status: 400 });

    // Return campaigns + variants in one hit
    const { data, error } = await supabaseAdmin
      .from("campaigns")
      .select(`
        id, organisation_id, name, platform, objective, status,
        budget_daily, start_date, end_date, landing_url,
        utm_source, utm_medium, utm_campaign,
        created_at, updated_at,
        campaign_variants (
          id, campaign_id, ab_group, headline, primary_text, media_url, video_url, status, created_at, updated_at
        )
      `)
      .eq("organisation_id", orgId)
      .order("created_at", { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ records: data || [], organisationId: orgId });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to load campaigns" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const orgId = String(body.organisationId || "").trim() || (await getOrganisationId());
    if (!orgId) return NextResponse.json({ error: "No organisation found." }, { status: 400 });

    const name = String(body.name || "").trim();
    const platform = String(body.platform || "").trim();
    const objective = String(body.objective || "").trim() || null;

    if (!name) return NextResponse.json({ error: "Campaign name is required." }, { status: 400 });
    if (!platform) return NextResponse.json({ error: "Campaign platform is required (e.g. meta/linkedin)." }, { status: 400 });

    const campaignPayload: any = {
      organisation_id: orgId,
      name,
      platform,
      objective,
      status: body.status || "draft",
      budget_daily: body.budget_daily ?? null,
      start_date: body.start_date ?? null,
      end_date: body.end_date ?? null,
      location: body.location ?? null,
      age_min: body.age_min ?? null,
      age_max: body.age_max ?? null,
      audience_keywords: Array.isArray(body.audience_keywords) ? body.audience_keywords : null,
      landing_url: body.landing_url ?? null,
      utm_source: body.utm_source ?? null,
      utm_medium: body.utm_medium ?? null,
      utm_campaign: body.utm_campaign ?? null,
      meta: body.meta && typeof body.meta === "object" ? body.meta : null,
      updated_at: new Date().toISOString(),
    };

    const { data: campaign, error: cErr } = await supabaseAdmin
      .from("campaigns")
      .insert(campaignPayload)
      .select()
      .single();

    if (cErr || !campaign) return NextResponse.json({ error: cErr?.message || "Failed to create campaign" }, { status: 500 });

   const variantsIncoming = Array.isArray(body.variants) ? body.variants : [];
if (variantsIncoming.length > 0) {
  const variantRows = variantsIncoming.map((v: any) => ({
    campaign_id: campaign.id,
    ab_group: String(v.ab_group || "A").toUpperCase(),
    headline: v.headline ?? null,
    primary_text: v.primary_text ?? null,
    media_url: v.media_url ?? null,
    video_url: v.video_url ?? null,
    status: v.status ?? "draft",
    meta: v.meta && typeof v.meta === "object" ? v.meta : null,
    updated_at: new Date().toISOString(),
  }));

  const { error: vErr } = await supabaseAdmin.from("campaign_variants").insert(variantRows);
  if (vErr) {
    return NextResponse.json(
      { error: "Campaign created but variants failed to save", detail: vErr.message, campaign },
      { status: 500 }
    );
  }
}

    return NextResponse.json({ ok: true, campaignId: campaign.id });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to create campaign" }, { status: 500 });
  }
}
