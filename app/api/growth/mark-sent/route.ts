import { withTenantRoute } from "@/lib/tenantRoute.server";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { nextGrowthStage } from "@/lib/growthOutreach";

export const runtime = "nodejs";

export const POST = withTenantRoute(async function POST(req: Request, tenant) {
  try {
    const { id } = await req.json();

    if (!id) {
      return NextResponse.json(
        { success: false, error: "Missing target id." },
        { status: 400 }
      );
    }

    const { data: target, error: readError } = await supabaseAdmin.from("growth_targets")
      .select("id,stage").eq("id", id).eq("organisation_id", tenant.organisationId).maybeSingle();
    if (readError) throw readError;
    if (!target) return NextResponse.json({ success: false, error: "Target not found." }, { status: 404 });
    const newStage = nextGrowthStage(target.stage);

    const { error } = await supabaseAdmin
      .from("growth_targets")
      .update({
        stage: newStage,
        last_action_at: new Date().toISOString(),
        status: newStage === "parked" ? "parked" : "active",
      })
      .eq("id", id).eq("organisation_id", tenant.organisationId);

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Unable to update target." }, { status: 500 });
  }
}, { generation: false, write: true });
