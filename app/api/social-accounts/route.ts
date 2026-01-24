// app/api/social-accounts/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";

export const runtime = "nodejs";

async function getSingleTenantOrganisationId() {
  const { data, error } = await supabaseAdmin
    .from("organisations")
    .select("id")
    .limit(1);

  if (error) {
    console.error("[social-accounts] organisations error", error);
    return null;
  }
  if (!data || data.length === 0) return null;
  return String(data[0].id);
}

export async function GET(req: NextRequest) {
  try {
    let organisationId = req.nextUrl.searchParams.get("organisationId")?.trim() || "";
    if (!organisationId) {
      const fallback = await getSingleTenantOrganisationId();
      if (fallback) organisationId = fallback;
    }

    if (!organisationId) {
      return NextResponse.json(
        { organisationId: null, socialAccounts: [], error: "No organisation found." },
        { status: 200 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("social_accounts")
      .select(
        "id, organisation_id, platform, page_id, page_name, connection_type, make_webhook_url, is_active, created_at, token_expires_at"
      )
      .eq("organisation_id", organisationId)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("[social-accounts] db error", error);
      return NextResponse.json(
        { organisationId, socialAccounts: [], error: "DB error loading social accounts." },
        { status: 200 }
      );
    }

    return NextResponse.json(
      { organisationId, socialAccounts: data || [] },
      { status: 200 }
    );
  } catch (e: any) {
    console.error("[social-accounts] fatal", e);
    return NextResponse.json(
      { organisationId: null, socialAccounts: [], error: e?.message || "Internal error." },
      { status: 200 }
    );
  }
}
