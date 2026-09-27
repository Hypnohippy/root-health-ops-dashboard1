import { withTenantRoute } from "@/lib/tenantRoute.server";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

export const POST = withTenantRoute(async function POST(req: Request, tenant) {
  try {
    const { id, call_date, deal_value, deal_stage } = await req.json();

    if (!id) {
      return NextResponse.json(
        { success: false, error: "Missing target id." },
        { status: 400 }
      );
    }

    const value = deal_value == null || (typeof deal_value === "string" && !deal_value.trim()) ? null : Number(deal_value);
    if (value !== null && (!Number.isFinite(value) || value < 0 || !["string", "number"].includes(typeof deal_value)))
      return NextResponse.json({ success: false, error: "Deal value must be a non-negative amount or blank." }, { status: 400 });
    const { error } = await supabaseAdmin
      .from("growth_targets")
      .update({
        call_date: call_date || null,
        deal_value: value,
        deal_stage: deal_stage || "lead",
      })
      .eq("id", id).eq("organisation_id", tenant.organisationId);

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}, { generation: false, write: true });
