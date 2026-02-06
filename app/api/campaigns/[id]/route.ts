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

export async function GET(req: NextRequest, ctx: { params: { id: string } }) {
  try {
    const orgId =
      (req.nextUrl.searchParams.get("organisationId") || "").trim() ||
      (await getOrganisationId());

    if (!orgId) {
      return NextResponse.json({ error: "No organisation found." }, { status: 400 });
    }

    const id = String(ctx?.params?.id || "").trim();
    if (!id) {
      return NextResponse.json({ error: "Missing campaign id" }, { status: 400 });
    }

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
      .eq("id", id)
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });

    return NextResponse.json({ ok: true, campaign: data }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to load campaign" }, { status: 500 });
  }
}
