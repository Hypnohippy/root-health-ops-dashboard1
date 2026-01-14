// app/api/approvals/update/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

export async function POST(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const organisationId = url.searchParams.get("organisationId") || "";

    if (!organisationId) {
      return NextResponse.json(
        { success: false, error: "Missing organisationId" },
        { status: 400 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const id = String(body?.id || "").trim();
    const action = String(body?.action || "").trim(); // approve | reject
    const note = typeof body?.note === "string" ? body.note.trim() : null;

    if (!id) {
      return NextResponse.json(
        { success: false, error: "Missing id" },
        { status: 400 }
      );
    }

    if (action !== "approve" && action !== "reject") {
      return NextResponse.json(
        { success: false, error: "Invalid action" },
        { status: 400 }
      );
    }

    const newStatus = action === "approve" ? "queued" : "rejected";

    // Read existing meta safely (NO maybeSingle)
    const { data: existingRows, error: readErr } = await supabaseAdmin
      .from("scheduled_posts")
      .select("id, meta")
      .eq("id", id)
      .eq("organisation_id", organisationId)
      .limit(1);

    if (readErr) {
      console.error("[approvals/update] read error", readErr);
      return NextResponse.json(
        { success: false, error: "Failed to read post", details: readErr.message },
        { status: 500 }
      );
    }

    const existing = Array.isArray(existingRows) ? existingRows[0] : null;
    if (!existing?.id) {
      return NextResponse.json(
        { success: false, error: "Post not found for this organisation" },
        { status: 404 }
      );
    }

    const nextMeta = {
      ...(existing.meta || {}),
      decision: {
        action,
        note: note || null,
        decided_at: new Date().toISOString(),
      },
    };

    const { data, error } = await supabaseAdmin
      .from("scheduled_posts")
      .update({ status: newStatus, meta: nextMeta })
      .eq("id", id)
      .eq("organisation_id", organisationId)
      .select("id, status")
      .single();

    if (error) {
      console.error("[approvals/update] update error", error);
      return NextResponse.json(
        { success: false, error: "Failed to update post", details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { success: true, id: data.id, status: data.status },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("[approvals/update] unexpected error", err);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
