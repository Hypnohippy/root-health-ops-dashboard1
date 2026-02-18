import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

function norm(v: any) {
  return String(v ?? "").trim();
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const id = norm(body?.id);
    let status = norm(body?.status).toLowerCase();

    if (!id) {
      return NextResponse.json({ success: false, error: "Missing id" }, { status: 400 });
    }
    if (!["planned", "running", "completed", "abandoned"].includes(status)) {
      return NextResponse.json({ success: false, error: "Invalid status" }, { status: 400 });
    }

    const now = new Date().toISOString();
    const patch: any = { status, updated_at: now };

    if (status === "running") patch.started_at = now;
    if (status === "completed") patch.completed_at = now;

    const { data, error } = await supabaseAdmin
      .from("growth_experiments")
      .update(patch)
      .eq("id", id)
      .select()
      .maybeSingle();

    if (error) {
      console.error("[growth/experiments/status] update error", error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, item: data });
  } catch (e: any) {
    console.error("[growth/experiments/status] crashed", e);
    return NextResponse.json(
      { success: false, error: e?.message || "Update status failed" },
      { status: 500 }
    );
  }
}
