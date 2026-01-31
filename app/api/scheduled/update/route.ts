// app/api/scheduled/update/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const organisationId = (url.searchParams.get("organisationId") || "").trim();
    if (!organisationId) {
      return NextResponse.json({ ok: false, error: "Missing organisationId" }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const id = String(body?.id || "").trim();
    if (!id) {
      return NextResponse.json({ ok: false, error: "Missing id" }, { status: 400 });
    }

    const message = typeof body?.message === "string" ? body.message.trim() : null;
    const image_url = typeof body?.image_url === "string" ? body.image_url.trim() : null;
    const scheduled_for = typeof body?.scheduled_for === "string" ? body.scheduled_for.trim() : null;
    const platforms = Array.isArray(body?.platforms) ? body.platforms.map((x: any) => String(x)) : null;

    const patch: any = {};
    if (message !== null) patch.message = message;
    if (image_url !== null) patch.image_url = image_url || null;
    if (scheduled_for !== null) patch.scheduled_for = new Date(scheduled_for).toISOString();
    if (platforms !== null) patch.platforms = platforms;

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ ok: false, error: "Nothing to update" }, { status: 400 });
    }

    // IMPORTANT: do NOT reference updated_at here.
    // If you added updated_at + trigger, Supabase will update it automatically.

    const { data, error } = await supabaseAdmin
      .from("scheduled_posts")
      .update(patch)
      .eq("id", id)
      .eq("organisation_id", organisationId)
      .select("id, message, platforms, image_url, scheduled_for, status, meta, error_info, posted_at")
      .single();

    if (error) {
      console.error("[scheduled/update] db error", error);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, item: data }, { status: 200 });
  } catch (err: any) {
    console.error("[scheduled/update] fatal", err);
    return NextResponse.json({ ok: false, error: err?.message || "Internal error" }, { status: 500 });
  }
}
