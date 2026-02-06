// app/api/campaign-metrics/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";

export const runtime = "nodejs";

// Single-tenant helper (matches your other routes)
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

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));

    const organisationId =
      String(body.organisationId || "").trim() || (await getOrganisationId());

    if (!organisationId) {
      return NextResponse.json({ ok: false, error: "No organisation found." }, { status: 200 });
    }

    const variantId = String(body.variantId || "").trim();
    if (!variantId) {
      return NextResponse.json({ ok: false, error: "Missing variantId." }, { status: 200 });
    }

    // ✅ Optional fields (you can log one or both)
    const ctrRaw = body.ctr;
    const cplRaw = body.cpl;

    const ctr =
      ctrRaw === "" || ctrRaw === null || ctrRaw === undefined
        ? null
        : Number(ctrRaw);

    const cpl =
      cplRaw === "" || cplRaw === null || cplRaw === undefined
        ? null
        : Number(cplRaw);

    if (ctr !== null && (isNaN(ctr) || ctr < 0)) {
      return NextResponse.json({ ok: false, error: "CTR must be a number >= 0." }, { status: 200 });
    }

    if (cpl !== null && (isNaN(cpl) || cpl < 0)) {
      return NextResponse.json({ ok: false, error: "CPL must be a number >= 0." }, { status: 200 });
    }

    // ✅ IMPORTANT: your table currently has columns: id, cpl, ctr, meta, created_at
    // So we store variantId + orgId safely in meta.
    const meta = {
      variant_id: variantId,
      organisation_id: organisationId,
      note: typeof body.note === "string" ? body.note.trim() : null,
      source: body.source || "manual_log",
    };

    const { data, error } = await supabaseAdmin
      .from("campaign_variant_metrics")
      .insert({
        ctr,
        cpl,
        meta,
      })
      .select()
      .single();

    if (error || !data) {
      return NextResponse.json(
        { ok: false, error: error?.message || "Failed to save metric." },
        { status: 200 }
      );
    }

    return NextResponse.json({ ok: true, metric: data }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Failed to save metric." },
      { status: 200 }
    );
  }
}
