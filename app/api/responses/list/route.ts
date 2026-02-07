// app/api/responses/list/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

export const runtime = "nodejs";

function okJson(data: any, status = 200) {
  return NextResponse.json(data, { status });
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const organisationId = String(url.searchParams.get("organisationId") || "").trim();

    if (!organisationId) {
      return okJson({ success: false, error: "Missing organisationId" }, 400);
    }

    const limitRaw = Number(url.searchParams.get("limit") || 200);
    const limit = Math.max(1, Math.min(500, isNaN(limitRaw) ? 200 : limitRaw));

    const { data, error } = await supabaseAdmin
      .from("inbox_items")
      .select(
        "id, organisation_id, platform, status, kind, author_name, author_handle, text, permalink, created_at_platform, inserted_at, post_text, post_id, external_id, last_reply_text, last_replied_at"

      )
      .eq("organisation_id", organisationId)
      .order("created_at_platform", { ascending: false, nullsFirst: false })
      .order("inserted_at", { ascending: false })
      .limit(limit);

    if (error) {
      return okJson({ success: false, error: error.message }, 500);
    }

    const items = (data || []).map((r: any) => ({
      id: String(r.id),
      platform: (r.platform || "unknown") as any,
      status: (r.status || "unknown") as any,
      kind: (r.kind || "unknown") as any,
      authorName: r.author_name ?? null,
      authorHandle: r.author_handle ?? null,
      text: r.text || "",
      permalink: r.permalink ?? null,
      createdAt: (r.created_at_platform || r.inserted_at || new Date().toISOString()) as string,
      postText: r.post_text ?? null,
      postId: r.post_id ?? null,
      externalId: r.external_id ?? null,
    }));

    return okJson({
      success: true,
      configured: true,
      note:
        "Loaded from Supabase inbox_items. Use “Pull latest” to fetch new comments from connected platforms.",
      items,
    });
  } catch (e: any) {
    return okJson({ success: false, error: e?.message || "Server error" }, 500);
  }
}
