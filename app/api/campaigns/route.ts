// app/api/campaigns/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";

export const runtime = "nodejs";

/**
 * Returns a flat list of "campaign records" shaped like your UI expects:
 * Each variant row becomes one record containing campaign fields + variant fields.
 *
 * This is deliberately NOT touching any posting logic.
 */
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);

    // Optional: allow filtering
    const organisationId = (url.searchParams.get("organisationId") || "").trim();
    const platform = (url.searchParams.get("platform") || "").trim();
    const objective = (url.searchParams.get("objective") || "").trim();

    if (!organisationId) {
      return NextResponse.json(
        {
          error: "Missing organisationId",
          userMessage:
            "No organisation context. Pass ?organisationId=... or we can auto-resolve from your session next.",
        },
        { status: 400 }
      );
    }

    // 1) Load campaigns for org
    let q = supabaseAdmin
      .from("campaigns")
      .select(
        "id, organisation_id, name, platform, objective, status, budget_daily, start_date, end_date, url, created_at"
      )
      .eq("organisation_id", organisationId)
      .order("created_at", { ascending: false });

    if (platform) q = q.eq("platform", platform);
    if (objective) q = q.eq("objective", objective);

    const { data: campaigns, error: cErr } = await q;
    if (cErr) {
      console.error("[api/campaigns] campaigns load error", cErr);
      return NextResponse.json(
        { error: cErr.message || "Failed loading campaigns" },
        { status: 500 }
      );
    }

    const campaignIds = (campaigns || []).map((c: any) => c.id);
    if (campaignIds.length === 0) {
      return NextResponse.json({ records: [] }, { status: 200 });
    }

    // 2) Load variants for those campaigns
    const { data: variants, error: vErr } = await supabaseAdmin
      .from("campaign_variants")
      .select("id, campaign_id, ab_group, headline, primary_text, status")
      .in("campaign_id", campaignIds);

    if (vErr) {
      console.error("[api/campaigns] variants load error", vErr);
      return NextResponse.json(
        { error: vErr.message || "Failed loading campaign variants" },
        { status: 500 }
      );
    }

    const byCampaign: Record<string, any[]> = {};
    for (const v of variants || []) {
      const cid = String((v as any).campaign_id || "");
      if (!cid) continue;
      if (!byCampaign[cid]) byCampaign[cid] = [];
      byCampaign[cid].push(v);
    }

    // 3) Flatten: each variant becomes one record for your UI
    const records = (campaigns || []).flatMap((c: any) => {
      const vs = byCampaign[String(c.id)] || [];

      // If no variants exist yet, still return 1 "campaign record" so it shows up
      if (vs.length === 0) {
        return [
          {
            id: String(c.id),
            name: c.name || "",
            platform: c.platform || "",
            objective: c.objective || "",
            primary_text: "",
            headline: "",
            status: c.status || "draft",
            ab_group: "",
            start_date: c.start_date,
            end_date: c.end_date,
            budget_daily: c.budget_daily,
            url: c.url || "",
          },
        ];
      }

      return vs.map((v: any) => ({
        id: String(v.id),
        name: c.name || "",
        platform: c.platform || "",
        objective: c.objective || "",
        primary_text: v.primary_text || "",
        headline: v.headline || "",
        status: v.status || c.status || "draft",
        ab_group: v.ab_group || "",
        start_date: c.start_date,
        end_date: c.end_date,
        budget_daily: c.budget_daily,
        url: c.url || "",
      }));
    });

    return NextResponse.json({ records }, { status: 200 });
  } catch (err: any) {
    console.error("[api/campaigns] error", err);
    return NextResponse.json(
      { error: err?.message || "Server error" },
      { status: 500 }
    );
  }
}
