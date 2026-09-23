import { requireOrganisation, accessErrorResponse } from "@/lib/tenantAuth";
// app/api/schedule/update/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

export const runtime = "nodejs";

function cleanStr(v: any, max = 5000) {
  const s = typeof v === "string" ? v : "";
  const t = s.trim();
  return t ? t.slice(0, max) : "";
}

function toIsoOrThrow(s: any) {
  const d = new Date(String(s || ""));
  if (isNaN(d.getTime())) throw new Error("Invalid scheduledAt date/time.");
  return d.toISOString();
}

export async function POST(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const { organisationId } = await requireOrganisation((url.searchParams.get("organisationId") || "").trim(), true);
    if (!organisationId) {
      return NextResponse.json({ success: false, error: "Missing organisationId" }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));

    const id = cleanStr(body?.id, 120);
    if (!id) {
      return NextResponse.json({ success: false, error: "Missing id" }, { status: 400 });
    }

    // Allowed edits
    const nextMessage = body?.message !== undefined ? cleanStr(body.message, 5000) : null;
    const nextImageUrl = body?.imageUrl !== undefined ? cleanStr(body.imageUrl, 1000) : null;

    const nextPlatforms =
      body?.platforms !== undefined
        ? Array.isArray(body.platforms)
          ? body.platforms.map((x: any) => String(x || "").trim()).filter(Boolean)
          : []
        : null;

    const nextScheduledFor =
      body?.scheduledAt !== undefined ? toIsoOrThrow(body.scheduledAt) : null;

    // Build patch payload only with fields provided
    const patch: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    if (nextMessage !== null) {
      if (!nextMessage) {
        return NextResponse.json({ success: false, error: "Message cannot be empty." }, { status: 400 });
      }
      patch.message = nextMessage;
    }

    if (nextImageUrl !== null) patch.image_url = nextImageUrl || null;

    if (nextPlatforms !== null) {
      if (!Array.isArray(nextPlatforms) || nextPlatforms.length === 0) {
        return NextResponse.json({ success: false, error: "Platforms must include at least one item." }, { status: 400 });
      }
      patch.platforms = nextPlatforms;
    }

    if (nextScheduledFor !== null) patch.scheduled_for = nextScheduledFor;

    // Safety: don’t let edits happen if it has already posted/failed (optional but sensible)
    // If your table doesn’t have these statuses, this check still works safely (it just won’t match)
    const { data: rowCheck } = await supabaseAdmin
      .from("scheduled_posts")
      .select("id, status")
      .eq("id", id)
      .eq("organisation_id", organisationId)
      .limit(1);

    const existing = rowCheck?.[0];
    if (!existing?.id) {
      return NextResponse.json({ success: false, error: "Post not found for this organisation." }, { status: 404 });
    }

    const status = String(existing.status || "").toLowerCase().trim();
    if (status === "posted" || status === "failed") {
      return NextResponse.json(
        { success: false, error: "This item is already complete (posted/failed) and can’t be edited." },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("scheduled_posts")
      .update(patch)
      .eq("id", id)
      .eq("organisation_id", organisationId)
      .select("id, message, platforms, image_url, scheduled_for, status, meta, updated_at")
      .single();

    if (error) {
      console.error("[schedule/update] db error", error);
      return NextResponse.json({ success: false, error: error.message || "Update failed." }, { status: 500 });
    }

    return NextResponse.json({ success: true, item: data }, { status: 200 });
  } catch (e: any) {
    const denied = accessErrorResponse(e);
    if (denied) return denied;
    return NextResponse.json({ success: false, error: e?.message || "Internal error." }, { status: 500 });
  }
}
