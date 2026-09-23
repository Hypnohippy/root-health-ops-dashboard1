import { requireOrganisation, accessErrorResponse } from "@/lib/tenantAuth";
// app/api/scheduled/cancel/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const { organisationId } = await requireOrganisation((url.searchParams.get("organisationId") || "").trim(), true);
    if (!organisationId) {
      return NextResponse.json({ ok: false, error: "Missing organisationId" }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const id = String(body?.id || "").trim();
    if (!id) {
      return NextResponse.json({ ok: false, error: "Missing id" }, { status: 400 });
    }

    // We mark cancelled. This keeps history (better than deleting).
    const { data, error } = await supabaseAdmin
      .from("scheduled_posts")
      .update({ status: "cancelled" })
      .eq("id", id)
      .eq("organisation_id", organisationId)
      .select("id, status")
      .single();

    if (error) {
      console.error("[scheduled/cancel] db error", error);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, id: data.id, status: data.status }, { status: 200 });
  } catch (err: any) {
    const denied = accessErrorResponse(err);
    if (denied) return denied;
    console.error("[scheduled/cancel] fatal", err);
    return NextResponse.json({ ok: false, error: err?.message || "Internal error" }, { status: 500 });
  }
}
