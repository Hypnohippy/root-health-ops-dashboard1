import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const organisationId = String(url.searchParams.get("organisationId") || "").trim();

    if (!organisationId) {
      return NextResponse.json({ success: false, error: "Missing organisationId" }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const id = String(body?.id || "").trim();
    const action = String(body?.action || "").trim(); // approve | reject
    const note = typeof body?.note === "string" ? body.note.trim() : null;

    if (!id) return NextResponse.json({ success: false, error: "Missing id" }, { status: 400 });
    if (action !== "approve" && action !== "reject") {
      return NextResponse.json({ success: false, error: "Invalid action" }, { status: 400 });
    }

    const { data: existingRows, error: readErr } = await supabaseAdmin
      .from("scheduled_posts")
      .select("id, meta, status")
      .eq("id", id)
      .eq("organisation_id", organisationId)
      .limit(1);

    if (readErr) {
      console.error("[approvals/update] read error", readErr);
      return NextResponse.json({ success: false, error: "Failed to read post" }, { status: 500 });
    }

    const existing: any = Array.isArray(existingRows) ? existingRows[0] : null;
    if (!existing?.id) {
      return NextResponse.json({ success: false, error: "Post not found for this organisation" }, { status: 404 });
    }

    const nextMeta = {
      ...(existing.meta || {}),
      approvals: {
        ...((existing.meta || {})?.approvals || {}),
        state: action === "approve" ? "approved" : "rejected",
        note: note || null,
        decided_at: new Date().toISOString(),
      },
    };

    // IMPORTANT: we do NOT change status here (avoids check-constraint blowups)
    const { data, error } = await supabaseAdmin
      .from("scheduled_posts")
      .update({ meta: nextMeta })
      .eq("id", id)
      .eq("organisation_id", organisationId)
      .select("id, status, meta")
      .single();

    if (error) {
      console.error("[approvals/update] update error", error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, id: data.id, status: data.status, meta: data.meta }, { status: 200 });
  } catch (err: any) {
    console.error("[approvals/update] unexpected error", err);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
