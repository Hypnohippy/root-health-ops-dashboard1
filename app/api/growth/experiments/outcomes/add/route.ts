import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

function norm(v: any) {
  return String(v ?? "").trim();
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const experimentId = norm(body?.experimentId || body?.experiment_id);
    const metric_name = norm(body?.metric_name);
    const rawVal = body?.metric_value;

    if (!experimentId) {
      return NextResponse.json({ success: false, error: "Missing experimentId" }, { status: 400 });
    }
    if (!metric_name) {
      return NextResponse.json({ success: false, error: "Missing metric_name" }, { status: 400 });
    }

    const metric_value =
      rawVal === null || rawVal === undefined || rawVal === ""
        ? null
        : Number(rawVal);

    const { data, error } = await supabaseAdmin
      .from("growth_experiment_outcomes")
      .insert({
        experiment_id: experimentId,
        metric_name,
        metric_value: Number.isFinite(metric_value as any) ? metric_value : null,
        meta: body?.meta && typeof body.meta === "object" ? body.meta : {},
      })
      .select()
      .maybeSingle();

    if (error) {
      console.error("[growth/experiments/outcomes/add] insert error", error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, item: data });
  } catch (e: any) {
    console.error("[growth/experiments/outcomes/add] crashed", e);
    return NextResponse.json(
      { success: false, error: e?.message || "Add outcome failed" },
      { status: 500 }
    );
  }
}
