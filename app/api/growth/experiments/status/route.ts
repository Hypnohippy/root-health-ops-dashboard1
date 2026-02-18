// app/api/growth/experiments/status/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

function norm(v: any) {
  return String(v ?? "").trim();
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({} as any));

    const id = norm(body?.id);
    const status = norm(body?.status);

    if (!id || !status) {
      return NextResponse.json(
        { success: false, error: "Missing id or status." },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();

    const patch: any = {
      status,
      updated_at: now,
    };

    if (status === "running") patch.started_at = now;
    if (status === "completed") patch.completed_at = now;

    const { data, error } = await supabaseAdmin
      .from("growth_experiments")
      .update(patch)
      .eq("id", id)
      .select()
      .maybeSingle();

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, item: data });
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message || "Failed to update status." },
      { status: 500 }
    );
  }
}
