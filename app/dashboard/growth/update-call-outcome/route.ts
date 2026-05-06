import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { id, call_outcome, call_notes, next_step, next_step_date } =
      await req.json();

    if (!id) {
      return NextResponse.json(
        { success: false, error: "Missing target id." },
        { status: 400 }
      );
    }

    const { error } = await supabaseAdmin
      .from("growth_targets")
      .update({
        call_outcome: call_outcome || "",
        call_notes: call_notes || "",
        next_step: next_step || "",
        next_step_date: next_step_date || null,
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
