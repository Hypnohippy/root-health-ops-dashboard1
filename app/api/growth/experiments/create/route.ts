import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

function norm(v: any) {
  return String(v ?? "").trim();
}

function resolveOrgId(bodyOrgId?: string | null) {
  const forced =
    (process.env.SINGLE_ORG_ID || "").trim() ||
    (process.env.NEXT_PUBLIC_SINGLE_ORG_ID || "").trim();

  const requested = norm(bodyOrgId);

  return requested || forced || null;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));

    const organisationId = resolveOrgId(body?.organisationId);

    if (!organisationId) {
      return NextResponse.json(
        { success: false, error: "Organisation not resolved." },
        { status: 400 }
      );
    }

    const title = norm(body?.title);
    const platform = norm(body?.platform);
    const pattern_type = norm(body?.pattern_type);
    const format = norm(body?.format);

    if (!title || !platform || !pattern_type || !format) {
      return NextResponse.json(
        { success: false, error: "Missing required fields." },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();

    const row: any = {
      organisation_id: organisationId,
      title,
      platform,
      goal: norm(body?.goal) || "Improve engagement",
      format,
      pattern_type,
      hook_style: norm(body?.hook_style) || null,
      cta_style: norm(body?.cta_style) || null,
      notes: norm(body?.notes) || null,
      hypothesis: norm(body?.hypothesis) || null,
      status: "planned",
      confidence: Number.isFinite(Number(body?.confidence))
        ? Number(body.confidence)
        : 60,
      created_at: now,
      updated_at: now,
      started_at: null,
      completed_at: null,
      deleted_at: null,
    };

    const ins = await supabaseAdmin
      .from("growth_experiments")
      .insert(row)
      .select()
      .maybeSingle();

    if (ins.error) throw new Error(ins.error.message);

    return NextResponse.json({
      success: true,
      organisationId,
      item: ins.data,
    });
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message || "Failed to create experiment." },
      { status: 500 }
    );
  }
}
