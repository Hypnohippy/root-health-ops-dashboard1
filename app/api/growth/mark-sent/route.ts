import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

function nextStage(stage: string) {
  if (stage === "connection") return "day3_dm";
  if (stage === "day3_dm") return "day10_insight";
  if (stage === "day10_insight") return "day17_followup";
  return "parked";
}

export async function POST(req: Request) {
  try {
    const { id, stage } = await req.json();

    if (!id || !stage) {
      return NextResponse.json(
        { success: false, error: "Missing target id or stage." },
        { status: 400 }
      );
    }

    const newStage = nextStage(stage);

    const { error } = await supabaseAdmin
      .from("growth_targets")
      .update({
        stage: newStage,
        last_action_at: new Date().toISOString(),
        status: newStage === "parked" ? "parked" : "active",
      })
      .eq("id", id);

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
