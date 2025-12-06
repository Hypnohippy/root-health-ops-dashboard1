// app/api/org-status/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getCurrentUserId } from "@/lib/supabaseServer";

export const runtime = "nodejs";

export async function GET() {
  try {
    const userId = await getCurrentUserId();

    if (!userId) {
      return NextResponse.json(
        { authenticated: false, hasOrganisation: false },
        { status: 200 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("organisation_members")
      .select("organisation_id")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("[org-status] error", error);
      return NextResponse.json(
        { authenticated: true, hasOrganisation: false },
        { status: 200 }
      );
    }

    const hasOrganisation = !!data?.organisation_id;

    return NextResponse.json(
      {
        authenticated: true,
        hasOrganisation,
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("[org-status] unexpected", err);
    return NextResponse.json(
      { authenticated: false, hasOrganisation: false },
      { status: 200 }
    );
  }
}
