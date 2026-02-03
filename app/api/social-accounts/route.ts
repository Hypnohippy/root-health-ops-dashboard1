import { NextRequest, NextResponse } from "next/server";
import { supabaseService } from "../../../lib/supabaseService";

export const runtime = "nodejs";

type SocialAccountRow = {
  platform: string;
  page_id: string | null;
  page_name: string | null;
  is_active: boolean | null;
};

async function getSingleTenantOrganisationId(): Promise<string | null> {
  const { data, error } = await supabaseService
    .from("organisations")
    .select("id")
    .limit(1);

  if (error || !data || data.length === 0) return null;
  return String(data[0].id);
}

export async function GET(_req: NextRequest) {
  try {
    const organisationId = await getSingleTenantOrganisationId();
    if (!organisationId) {
      return NextResponse.json({ success: true, socialAccounts: [] }, { status: 200 });
    }

    const { data: rows, error } = await supabaseService
      .from("social_accounts")
      .select("platform,page_id,page_name,is_active")
      .eq("organisation_id", organisationId);

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message, socialAccounts: [] },
        { status: 500 }
      );
    }

    const socialAccounts: SocialAccountRow[] = (rows || [])
      .filter((r: any) => r?.is_active !== false)
      .map((r: any) => ({
        platform: String(r.platform || ""),
        page_id: r.page_id ?? null,
        page_name: r.page_name ?? null,
        is_active: r.is_active ?? true,
      }));

    return NextResponse.json({ success: true, socialAccounts }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message || "Failed to load social accounts", socialAccounts: [] },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const platform = String(body?.platform || "").toLowerCase().trim();

    if (!platform) {
      return NextResponse.json({ success: false, error: "Missing platform" }, { status: 400 });
    }

    const organisationId = await getSingleTenantOrganisationId();
    if (!organisationId) {
      return NextResponse.json({ success: false, error: "No organisation found." }, { status: 400 });
    }

    const { error } = await supabaseService
      .from("social_accounts")
      .update({ is_active: false })
      .eq("organisation_id", organisationId)
      .eq("platform", platform);

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message || "Disconnect failed" },
      { status: 500 }
    );
  }
}
