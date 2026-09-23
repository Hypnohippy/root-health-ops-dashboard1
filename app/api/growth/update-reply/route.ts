import { withTenantRoute } from "@/lib/tenantRoute.server";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

export const POST = withTenantRoute(async function POST(req: Request, tenant) {
  try {
    const { id, reply_status, reply_notes } = await req.json();

    if (!id || !reply_status) {
      return NextResponse.json(
        { success: false, error: "Missing id or reply status." },
        { status: 400 }
      );
    }

    const { error } = await supabaseAdmin
      .from("growth_targets")
      .update({
        reply_status,
        reply_notes: reply_notes || "",
        replied_at: reply_status === "no_reply" ? null : new Date().toISOString(),
      })
      .eq("id", id).eq("organisation_id", tenant.organisationId);

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}, { generation: false, write: true });
