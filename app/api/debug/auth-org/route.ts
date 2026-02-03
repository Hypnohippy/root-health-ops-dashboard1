import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../../lib/supabaseServer";
import { supabaseService } from "../../../../lib/supabaseService";

export const runtime = "nodejs";

export async function GET(_req: NextRequest) {
  try {
    // 1) Who am I (from auth cookie)?
    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase.auth.getUser();

    const userId = data?.user?.id ?? null;

    if (error) {
      return NextResponse.json(
        { success: false, step: "getUser", error: error.message, userId: null },
        { status: 200 }
      );
    }

    if (!userId) {
      return NextResponse.json(
        {
          success: true,
          userId: null,
          note:
            "No logged-in user found in cookies. Open this while logged into /dashboard in the SAME browser.",
        },
        { status: 200 }
      );
    }

    // 2) What organisation_members rows exist for this user?
    const { data: members, error: memErr } = await supabaseService
      .from("organisation_members")
      .select("*")
      .eq("user_id", userId)
      .limit(10);

    if (memErr) {
      return NextResponse.json(
        {
          success: false,
          userId,
          step: "organisation_members lookup",
          error: memErr.message,
          hint:
            "This may mean your organisation_members table uses a different column name than user_id.",
        },
        { status: 200 }
      );
    }

    const organisationIds = (members || [])
      .map((m: any) => m.organisation_id)
      .filter(Boolean)
      .map((x: any) => String(x));

    return NextResponse.json(
      {
        success: true,
        userId,
        membersCount: members?.length ?? 0,
        organisationIds,
        members,
      },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message || "debug failed" },
      { status: 500 }
    );
  }
}
