// app/api/growth/experiments/outcomes/add/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

function norm(v: any) {
  return String(v ?? "").trim();
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({} as any));

    const experimentId = norm(body?.experimentId);
    const metricName = norm(body?.metric_name || body?.metricName);
    const metricValueRaw = body?.metric_value ?? body?.metricValue;

    if (!experimentId || !metricName) {
      return NextResponse.json(
        { success: false, error: "Missing experimentId or metric_name." },
        { status: 400 }
      );
    }

    const metricValue =
      metricValueRaw === null || metricValueRaw === undefined || metricValueRaw === ""
        ? null
        : Number(metricValueRaw);

    if (metricValue !== null && Number.isNaN(metricValue)) {
      return NextResponse.json(
        { success: false, error: "metric_value must be a number (or blank)." },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("growth_experiment_outcomes")
      .insert({
        experiment_id: experimentId,
        metric_name: metricName,
        metric_value: metricValue,
      })
      .select()
      .maybeSingle();

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, item: data });
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message || "Failed to add outcome." },
      { status: 500 }
    );
  }
}
