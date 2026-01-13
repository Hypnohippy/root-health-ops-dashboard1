import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));

    const organisationId = (body?.organisationId || "").toString().trim();
    const id = (body?.id || "").toString().trim();
    const status = (body?.status || "").toString().trim();

    if (!organisationId) {
      return NextResponse.json(
        { success: false, error: "Missing organisationId" },
        { status: 400 }
      );
    }

    if (!id) {
      return NextResponse.json(
        { success: false, error: "Missing inbox item id" },
        { status: 400 }
      );
    }

    if (!status) {
      return NextResponse.json(
        { success: false, error: "Missing status" },
        { status: 400 }
      );
    }

    // Only allow known statuses
    const allowed = ["unread", "needs_reply", "replied", "archived", "unknown"];
    if (!allowed.includes(status)) {
      return NextResponse.json(
        { success: false, error: `Invalid status: ${status}` },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("inbox_items")
      .update({
        status,
        updated_at: new Date().toISOString(),
      })
      .eq("organisation_id", organisationId)
      .eq("id", id)
      .select("id, status")
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
