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

function safeNum(v: any): number | null {
  if (v === "" || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * GET /api/campaign-metrics?variantId=...&q=...&limit=20
 * - variantId optional (but recommended)
 * - q optional (searches note + source inside meta)
 */
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const organisationId =
      String(url.searchParams.get("organisationId") || "").trim() ||
      (await getOrganisationId());

    if (!organisationId) {
      return NextResponse.json({ ok: false, error: "No organisation found." }, { status: 200 });
    }

    const variantId = String(url.searchParams.get("variantId") || "").trim();
    const q = String(url.searchParams.get("q") || "").trim().toLowerCase();
    const limitRaw = Number(url.searchParams.get("limit") || "20");
    const limit = Math.max(1, Math.min(100, Number.isFinite(limitRaw) ? limitRaw : 20));

    const { data, error } = await supabaseAdmin
      .from("campaign_variant_metrics")
      .select("id, ctr, cpl, meta, created_at")
      .order("created_at", { ascending: false })
      .limit(800);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 200 });
    }

    const rows = (data || []).filter((r: any) => {
      const meta = r?.meta && typeof r.meta === "object" ? r.meta : {};
      const orgOk = String(meta?.organisation_id || "") === organisationId;
      if (!orgOk) return false;

      if (variantId) {
        if (String(meta?.variant_id || "") !== variantId) return false;
      }

      if (q) {
        const hay = [
          String(meta?.note || ""),
          String(meta?.source || ""),
        ]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }

      return true;
    });

    return NextResponse.json(
      { ok: true, organisationId, records: rows.slice(0, limit) },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Failed to load campaign metrics." },
      { status: 200 }
    );
  }
}

/**
 * POST /api/campaign-metrics
 * body: { variantId, ctr?, cpl?, note?, source?, organisationId? }
 */
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

    const ctr = safeNum(body.ctr);
    const cpl = safeNum(body.cpl);

    if (ctr !== null && ctr < 0) {
      return NextResponse.json({ ok: false, error: "CTR must be a number >= 0." }, { status: 200 });
    }
    if (cpl !== null && cpl < 0) {
      return NextResponse.json({ ok: false, error: "CPL must be a number >= 0." }, { status: 200 });
    }

    const meta = {
      variant_id: variantId,
      organisation_id: organisationId,
      note: typeof body.note === "string" ? body.note.trim() : null,
      source: typeof body.source === "string" ? body.source.trim() : "manual_log",
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
