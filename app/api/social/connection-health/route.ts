import { NextRequest, NextResponse } from "next/server";
import { requireOrganisation, accessErrorResponse } from "@/lib/tenantAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { connectionHealth } from "@/lib/connectionHealth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { organisationId } = await requireOrganisation(req.nextUrl.searchParams.get("organisationId"), false);
    const { data, error } = await supabaseAdmin.from("social_accounts")
      .select("platform,is_active,page_access_token,token_expires_at,page_name")
      .eq("organisation_id", organisationId).order("updated_at", { ascending: false });
    if (error) throw error;
    return NextResponse.json({
      success: true, organisationId, connections: connectionHealth(data || []),
      // Stored health cannot detect remote revocations before a provider call fails.
      source: "stored_credentials",
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return accessErrorResponse(error) || NextResponse.json({ success: false, error: "Unable to load connection health." }, { status: 500 });
  }
}
