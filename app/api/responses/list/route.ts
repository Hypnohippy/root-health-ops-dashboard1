// app/api/responses/list/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const organisationId = url.searchParams.get("organisationId") || "";
    const limitRaw = url.searchParams.get("limit") || "200";
    const limit = Math.min(Math.max(parseInt(limitRaw, 10) || 200, 1), 500);

    if (!organisationId) {
      return NextResponse.json(
        { success: false, error: "Missing organisationId" },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("inbox_items")
      .select("id, platform, status, text, author_name, author_id, created_at, permalink")
      .eq("organisation_id", organisationId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      console.error("[responses/list] supabase error", error);
      return NextResponse.json(
        { success: false, error: "Failed to load inbox items", details: error.message },
        { status: 500 }
      );
    }

    const rows = data || [];
    const ids = rows.map((r: any) => String(r.id));

    // Optional: pull saved drafts (if table exists). If it doesn't, we just skip.
    let draftByItemId: Record<string, { draft_text: string; updated_at: string | null }> = {};
    try {
      if (ids.length > 0) {
        const { data: drafts, error: draftErr } = await supabaseAdmin
          .from("inbox_item_drafts")
          .select("inbox_item_id, draft_text, updated_at")
          .eq("organisation_id", organisationId)
          .in("inbox_item_id", ids)
          .limit(500);

        if (!draftErr && Array.isArray(drafts)) {
          for (const d of drafts) {
            const k = String((d as any).inbox_item_id);
            draftByItemId[k] = {
              draft_text: String((d as any).draft_text || ""),
              updated_at: (d as any).updated_at ? String((d as any).updated_at) : null,
            };
          }
        }
      }
    } catch (e) {
      // If table not created yet, no problem.
      draftByItemId = {};
    }

    const items = rows.map((r: any) => {
      const id = String(r.id);
      const draft = draftByItemId[id];

      return {
        id,
        platform: (String(r.platform || "unknown").toLowerCase() as any) || "unknown",
        status: (String(r.status || "unknown") as any) || "unknown",
        kind: "comment",
        text: String(r.text || ""),
        authorName: r.author_name ?? null,
        authorHandle: null,
        createdAt: String(r.created_at),
        permalink: r.permalink ?? null,
        postText: null,
        postId: null,

        // enterprise additions
        draftText: draft?.draft_text ?? null,
        draftUpdatedAt: draft?.updated_at ?? null,
      };
    });

    return NextResponse.json(
      {
        success: true,
        configured: true,
        items,
        note:
          "Enterprise mode: drafts are saved to Supabase and status changes are logged (audit trail).",
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("[responses/list] unexpected error", err);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
