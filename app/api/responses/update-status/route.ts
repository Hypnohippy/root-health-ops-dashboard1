// app/api/responses/update-status/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

function cleanStr(v: any): string {
  return typeof v === "string" ? v.trim() : "";
}

function cleanStatus(v: any): string {
  const s = cleanStr(v).toLowerCase();
  const allowed = new Set(["unread", "needs_reply", "replied", "archived"]);
  return allowed.has(s) ? s : "";
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const organisationId = cleanStr(body?.organisationId);
    const id = cleanStr(body?.id);
    const status = cleanStatus(body?.status);

    if (!organisationId) {
      return NextResponse.json(
        { success: false, error: "Missing organisationId" },
        { status: 400 }
      );
    }

    if (!id) {
      return NextResponse.json({ success: false, error: "Missing id" }, { status: 400 });
    }

    if (!status) {
      return NextResponse.json(
        { success: false, error: "Invalid status" },
        { status: 400 }
      );
    }

    const { error } = await supabaseAdmin
      .from("inbox_items")
      .update({ status })
      .eq("organisation_id", organisationId)
      .eq("id", id);

    if (error) {
      console.error("[responses/update-status] supabase error", error);
      return NextResponse.json(
        { success: false, error: "Failed to update status", details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    console.error("[responses/update-status] unexpected error", err);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
