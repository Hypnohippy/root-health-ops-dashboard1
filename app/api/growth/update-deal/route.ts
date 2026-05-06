import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { id, call_date, deal_value, deal_stage } = await req.json();

    if (!id) {
      return NextResponse.json(
        { success: false, error: "Missing target id." },
        { status: 400 }
      );
    }

    const { error } = await supabaseAdmin
      .from("growth_targets")
      .update({
        call_date: call_date || null,
        deal_value: Number(deal_value || 1500),
        deal_stage: deal_stage || "lead",
      })
      .eq("id", id);

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
}
