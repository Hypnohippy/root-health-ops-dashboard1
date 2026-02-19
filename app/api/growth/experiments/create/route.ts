import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

const SINGLE_ORG_ID = (process.env.SINGLE_ORG_ID || "").trim();

function norm(v: any) {
  return String(v ?? "").trim();
}

async function getOrgIdFallback() {
  if (SINGLE_ORG_ID) return SINGLE_ORG_ID;

  const { data, error } = await supabaseAdmin
    .from("organisations")
    .select("id, created_at")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data?.id) return null;
  return String(data.id);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const orgId = norm(body.organisationId) || (await getOrgIdFallback());
    if (!orgId) {
      return NextResponse.json({ success: false, error: "No organisation found." }, { status: 400 });
    }

    const title = norm(body.title);
    const platform = norm(body.platform);
    const pattern_type = norm(body.pattern_type);
    const format = norm(body.format);

    if (!title || !platform || !pattern_type || !format) {
      return NextResponse.json(
        { success: false, error: "Missing required fields (title/platform/pattern/format)." },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();

    const row: any = {
      organisation_id: orgId,
      title,
      platform,
      goal: norm(body.goal) || "Improve engagement",
      format,
      pattern_type,
      hook_style: norm(body.hook_style) || null,
      cta_style: norm(body.cta_style) || null,
      notes: norm(body.notes) || null,
      hypothesis: norm(body.hypothesis) || null,
      status: "planned",
      confidence: Number.isFinite(Number(body.confidence)) ? Number(body.confidence) : 60,
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

    return NextResponse.json({ success: true, item: ins.data });
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message || "Failed to create experiment." },
      { status: 500 }
    );
  }
}
