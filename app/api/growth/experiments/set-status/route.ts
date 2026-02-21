import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

function norm(v: any) {
  return String(v ?? "").trim();
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const id = norm(body.id);
    const status = norm(body.status);

    if (!id || !status) {
      return NextResponse.json(
        { success: false, error: "Missing id/status" },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();
    const patch: any = { status, updated_at: now };

    if (status === "running") patch.started_at = now;
    if (status === "completed") patch.completed_at = now;

    const up = await supabaseAdmin
      .from("growth_experiments")
      .update(patch)
      .eq("id", id)
      .select()
      .maybeSingle();

    if (up.error) throw new Error(up.error.message);

    return NextResponse.json({ success: true, item: up.data });
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message || "Failed to update status." },
      { status: 500 }
    );
  }
}
