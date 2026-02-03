import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../lib/supabaseServer";
import { supabaseService } from "../../../lib/supabaseService";

export const runtime = "nodejs";

async function getOrganisationIdForCurrentUser(): Promise<string | null> {
  // user from cookies
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user?.id) return null;

  const userId = data.user.id;

  // org from organisation_members using service role (bypass RLS recursion)
  const { data: rows, error: memErr } = await supabaseService
    .from("organisation_members")
    .select("organisation_id")
    .eq("user_id", userId)
    .limit(1);

  if (memErr) return null;
  return rows?.[0]?.organisation_id ? String(rows[0].organisation_id) : null;
}

export async function GET(_req: NextRequest) {
  try {
    const organisationId = await getOrganisationIdForCurrentUser();
    if (!organisationId) {
      return NextResponse.json(
        { success: true, socialAccounts: [] },
        { status: 200 }
      );
    }

    const { data: rows, error } = await supabaseService
      .from("social_accounts")
      .select("platform,page_id,page_name,is_active,token_expires_at,updated_at")
      .eq("organisation_id", organisationId);

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    const socialAccounts = (rows || [])
      .filter((r: any) => r.is_active !== false)
      .map((r: any) => ({
        platform: r.platform,
        page_id: r.page_id ?? null,
        page_name: r.page_name ?? null,
      }));

    return NextResponse.json({ success: true, socialAccounts }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message || "Failed to load social accounts" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const platform = String(body?.platform || "").toLowerCase().trim();

    if (!platform) {
      return NextResponse.json(
        { success: false, error: "Missing platform" },
        { status: 400 }
      );
    }

    const organisationId = await getOrganisationIdForCurrentUser();
    if (!organisationId) {
      return NextResponse.json(
        { success: false, error: "No organisation for user" },
        { status: 400 }
      );
    }

    // Soft-disable instead of delete (safer)
    const { error } = await supabaseService
      .from("social_accounts")
      .update({ is_active: false })
      .eq("organisation_id", organisationId)
      .eq("platform", platform);

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message || "Disconnect failed" },
      { status: 500 }
    );
  }
}
