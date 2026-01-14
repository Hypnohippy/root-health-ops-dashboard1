import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

// Single-tenant safe fallback ONLY for server-side reliability
async function getSingleTenantOrganisationId() {
  const { data, error } = await supabaseAdmin
    .from("organisations")
    .select("id")
    .limit(1);

  if (error) {
    console.error("[responses/update] organisations error", error);
    return null;
  }
  if (!data || data.length === 0) return null;
  return data[0].id as string;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));

    const id = (body?.id || "").toString().trim();
    const status = (body?.status || "").toString().trim();

    let organisationId = (body?.organisationId || "").toString().trim();

    if (!organisationId) {
      // ✅ prevents “Missing organisationId” failures if UI loads slowly
      organisationId = (await getSingleTenantOrganisationId()) || "";
    }

    if (!organisationId) {
      return NextResponse.json(
        { success: false, error: "Missing organisationId (no organisations found)" },
        { status: 400 }
      );
    }

    if (!id) {
      return NextResponse.json({ success: false, error: "Missing id" }, { status: 400 });
    }

    const allowed: string[] = ["unread", "needs_reply", "replied", "archived", "unknown"];
    if (!allowed.includes(status)) {
      return NextResponse.json(
        { success: false, error: "Invalid status" },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("inbox_items")
      .update({ status })
      .eq("organisation_id", organisationId)
      .eq("id", id)
      .select("id, status")
      .single();

    if (error) {
      console.error("[responses/update] supabase error", error);
      return NextResponse.json(
        {
          success: false,
          error: "Failed to update inbox item",
          details: error.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, item: data }, { status: 200 });
  } catch (err: any) {
    console.error("[responses/update] unexpected error", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Internal server error" },
      { status: 500 }
    );
  }
}
