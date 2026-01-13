// app/api/responses/draft/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";
import { randomUUID } from "crypto";

export async function POST(req: NextRequest) {
  try {
    const body: any = await req.json().catch(() => ({}));
    const organisationId = String(body?.organisationId || "").trim();
    const inboxItemId = String(body?.inboxItemId || "").trim();
    const draftText = String(body?.draftText || "");
    const updatedBy = body?.updatedBy ? String(body.updatedBy) : null;

    if (!organisationId) {
      return NextResponse.json({ success: false, error: "Missing organisationId" }, { status: 400 });
    }
    if (!inboxItemId) {
      return NextResponse.json({ success: false, error: "Missing inboxItemId" }, { status: 400 });
    }

    // Find existing draft row (no unique constraint required)
    const { data: existing, error: findErr } = await supabaseAdmin
      .from("inbox_item_drafts")
      .select("id")
      .eq("organisation_id", organisationId)
      .eq("inbox_item_id", inboxItemId)
      .limit(1);

    if (findErr) {
      console.error("[responses/draft] find error", findErr);
      return NextResponse.json({ success: false, error: "Failed to save draft" }, { status: 500 });
    }

    const nowIso = new Date().toISOString();

    if (existing && existing.length > 0) {
      const id = (existing[0] as any).id;

      const { error: updErr } = await supabaseAdmin
        .from("inbox_item_drafts")
        .update({
          draft_text: draftText,
          updated_at: nowIso,
          updated_by: updatedBy,
        })
        .eq("id", id);

      if (updErr) {
        console.error("[responses/draft] update error", updErr);
        return NextResponse.json({ success: false, error: "Failed to update draft" }, { status: 500 });
      }
    } else {
      const id = randomUUID();

      const { error: insErr } = await supabaseAdmin
        .from("inbox_item_drafts")
        .insert({
          id,
          organisation_id: organisationId,
          inbox_item_id: inboxItemId,
          draft_text: draftText,
          updated_at: nowIso,
          updated_by: updatedBy,
        });

      if (insErr) {
        console.error("[responses/draft] insert error", insErr);
        return NextResponse.json({ success: false, error: "Failed to create draft" }, { status: 500 });
      }
    }

    // Audit trail (optional table)
    try {
      await supabaseAdmin.from("inbox_item_actions").insert({
        id: randomUUID(),
        organisation_id: organisationId,
        inbox_item_id: inboxItemId,
        action: "save_draft",
        payload: { chars: draftText.length },
        created_at: nowIso,
        created_by: updatedBy,
      });
    } catch {
      // If actions table not present, ignore.
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err: any) {
    console.error("[responses/draft] unexpected error", err);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
