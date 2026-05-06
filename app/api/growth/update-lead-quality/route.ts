import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { id, lead_quality, lead_quality_notes } = await req.json();

    if (!id || !lead_quality) {
      return NextResponse.json(
        { success: false, error: "Missing id or lead quality." },
        { status: 400 }
      );
    }

    const { error } = await supabaseAdmin
      .from("growth_targets")
      .update({
        lead_quality,
        lead_quality_notes: lead_quality_notes || "",
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
