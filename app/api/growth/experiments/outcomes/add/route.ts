import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

function norm(v: any) {
  return String(v ?? "").trim();
}

function resolveOrgId() {
  const forced =
    (process.env.SINGLE_ORG_ID || "").trim() ||
    (process.env.NEXT_PUBLIC_SINGLE_ORG_ID || "").trim();
  return forced || null;
}

async function assertExperimentInOrg(experimentId: string, organisationId: string) {
  const { data, error } = await supabaseAdmin
    .from("growth_experiments")
    .select("id, organisation_id")
    .eq("id", experimentId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data?.id) throw new Error("Experiment not found");
  if (String(data.organisation_id) !== String(organisationId)) throw new Error("Experiment not in this organisation");
}

export async function POST(req: NextRequest) {
  try {
    const organisationId = resolveOrgId();
    if (!organisationId) {
      return NextResponse.json({ success: false, error: "Organisation not resolved." }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));

    const experimentId = norm(body?.experimentId);
    const metric_name = norm(body?.metric_name);
    const metric_value_raw = body?.metric_value;
    const meta = body?.meta && typeof body.meta === "object" ? body.meta : {};

    if (!experimentId || !metric_name) {
      return NextResponse.json({ success: false, error: "Missing experimentId / metric_name." }, { status: 400 });
    }

    await assertExperimentInOrg(experimentId, organisationId);

    const metric_value =
      metric_value_raw === null || metric_value_raw === undefined || metric_value_raw === ""
        ? null
        : Number(metric_value_raw);

    const now = new Date().toISOString();

    const row: any = {
      experiment_id: experimentId,
      metric_name,
      metric_value: Number.isFinite(metric_value as any) ? metric_value : null,
      meta,
      created_at: now,
    };

    const ins = await supabaseAdmin
      .from("growth_experiment_outcomes")
      .insert(row)
      .select()
      .maybeSingle();

    if (ins.error) throw new Error(ins.error.message);

    return NextResponse.json({ success: true, organisationId, item: ins.data }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || "Failed to add outcome." }, { status: 500 });
  }
}
