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
    const id = norm(body?.id);
    const status = norm(body?.status).toLowerCase();

    if (!id || !status) {
      return NextResponse.json({ success: false, error: "Missing id/status." }, { status: 400 });
    }

    if (!["planned", "running", "completed"].includes(status)) {
      return NextResponse.json({ success: false, error: "Invalid status." }, { status: 400 });
    }

    await assertExperimentInOrg(id, organisationId);

    const now = new Date().toISOString();

    const patch: any = {
      status,
      updated_at: now,
    };

    if (status === "running") patch.started_at = now;
    if (status === "completed") patch.completed_at = now;
    if (status === "planned") {
      // optional: keep history, but you can also clear these if you prefer
      // patch.started_at = null;
      // patch.completed_at = null;
    }

    const upd = await supabaseAdmin
      .from("growth_experiments")
      .update(patch)
      .eq("id", id)
      .eq("organisation_id", organisationId)
      .select()
      .maybeSingle();

    if (upd.error) throw new Error(upd.error.message);

    return NextResponse.json({ success: true, organisationId, item: upd.data }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || "Status update failed." }, { status: 500 });
  }
}
