// app/api/responses/status/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";
import { randomUUID } from "crypto";

const ALLOWED = new Set(["unread", "needs_reply", "replied", "archived"]);

export async function POST(req: NextRequest) {
  try {
    const body: any = await req.json().catch(() => ({}));
    const organisationId = String(body?.organisationId || "").trim();
    const inboxItemId = String(body?.inboxItemId || "").trim();
    const status = String(body?.status || "").trim();
    const updatedBy = body?.updatedBy ? String(body.updatedBy) : null;

    if (!organisationId) {
      return NextResponse.json({ success: false, error: "Missing organisationId" }, { status: 400 });
    }
    if (!inboxItemId) {
      return NextResponse.json({ success: false, error: "Missing inboxItemId" }, { status: 400 });
    }
    if (!ALLOWED.has(status)) {
      return NextResponse.json({ success: false, error: "Invalid status" }, { status: 400 });
    }

    const { error: updErr } = await supabaseAdmin
      .from("inbox_items")
      .update({ status })
      .eq("organisation_id", organisationId)
      .eq("id", inboxItemId);

    if (updErr) {
      console.error("[responses/status] update error", updErr);
      return NextResponse.json(
        { success: false, error: "Failed to update inbox item", details: updErr.message },
        { status: 500 }
      );
    }

    const nowIso = new Date().toISOString();

    // Audit trail (optional)
    try {
      await supabaseAdmin.from("inbox_item_actions").insert({
        id: randomUUID(),
        organisation_id: organisationId,
        inbox_item_id: inboxItemId,
        action: "set_status",
        payload: { status },
        created_at: nowIso,
        created_by: updatedBy,
      });
    } catch {
      // ignore if table doesn't exist
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err: any) {
    console.error("[responses/status] unexpected error", err);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
