import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));

    const organisationId = String(body?.organisationId || "");
    const id = String(body?.id || "");

    if (!organisationId) {
      return NextResponse.json(
        { success: false, error: "Missing organisationId" },
        { status: 400 }
      );
    }
    if (!id) {
      return NextResponse.json(
        { success: false, error: "Missing id" },
        { status: 400 }
      );
    }

    const patch: any = {};

    if (typeof body?.status === "string" && body.status.trim()) {
      patch.status = body.status.trim();
    }

    if (typeof body?.reply_draft === "string") {
      patch.reply_draft = body.reply_draft;
    }

    if (typeof body?.reply_final === "string") {
      patch.reply_final = body.reply_final;
    }

    if (typeof body?.replied_by === "string" && body.replied_by.trim()) {
      patch.replied_by = body.replied_by.trim();
    }

    // If they mark as replied, set replied_at automatically (unless provided)
    const statusLower = String(patch.status || "").toLowerCase();
    if (statusLower === "replied") {
      patch.replied_at = body?.replied_at ? body.replied_at : new Date().toISOString();
      if (!patch.replied_by) patch.replied_by = "staff";
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json(
        { success: false, error: "Nothing to update" },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("inbox_items")
      .update(patch)
      .eq("organisation_id", organisationId)
      .eq("id", id)
      .select(
        "id, platform, status, text, author_name, author_id, created_at, permalink, reply_draft, reply_final, replied_at, replied_by"
      )
      .single();

    if (error) {
      console.error("[responses/update] supabase error", error);
      return NextResponse.json(
        { success: false, error: "Failed to update inbox item", details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, item: data }, { status: 200 });
  } catch (err: any) {
    console.error("[responses/update] unexpected error", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Internal server error" },
      { status: 500 }
    );
  }
}
