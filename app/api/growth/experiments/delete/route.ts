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
    if (!id) {
      return NextResponse.json({ success: false, error: "Missing id" }, { status: 400 });
    }

    const now = new Date().toISOString();

    // Soft delete (safer for enterprise)
    const up = await supabaseAdmin
      .from("growth_experiments")
      .update({ deleted_at: now, updated_at: now })
      .eq("id", id)
      .select()
      .maybeSingle();

    if (up.error) throw new Error(up.error.message);

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message || "Failed to delete experiment." },
      { status: 500 }
    );
  }
}
