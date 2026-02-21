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
    const experimentIds = Array.isArray(body?.experimentIds)
      ? body.experimentIds.map((x: any) => norm(x)).filter(Boolean)
      : [];

    const ids = experimentId ? [experimentId] : experimentIds;

    if (!ids.length) {
      return NextResponse.json(
        { success: false, error: "Missing experimentId or experimentIds" },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("growth_experiment_outcomes")
      .select("id, experiment_id, metric_name, metric_value, meta, created_at")
      .in("experiment_id", ids)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, items: data || [] });
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message || "List outcomes failed" },
      { status: 500 }
    );
  }
}
