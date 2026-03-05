// app/api/debug/auth-org/route.ts
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../../lib/supabaseServer";

export const runtime = "nodejs";

export async function GET() {
  try {
    // IMPORTANT: await in case createSupabaseServerClient is async (or typed as async)
    const supabase = await createSupabaseServerClient();

    // 1) Who am I (from auth cookie)?
    const { data: userData, error: userErr } = await supabase.auth.getUser();

    if (userErr) {
      return NextResponse.json(
        { ok: false, step: "auth.getUser", error: userErr.message },
        { status: 200 }
      );
    }

    const user = userData?.user || null;
    if (!user) {
      return NextResponse.json(
        { ok: true, signedIn: false, user: null, memberships: [] },
        { status: 200 }
      );
    }

    // 2) What orgs am I a member of?
    const { data: memberships, error: memErr } = await supabase
      .from("organisation_members")
      .select("organisation_id, role, created_at")
      .eq("user_id", user.id);

    if (memErr) {
      return NextResponse.json(
        { ok: false, step: "organisation_members.select", error: memErr.message, userId: user.id },
        { status: 200 }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        signedIn: true,
        user: { id: user.id, email: user.email },
        memberships: memberships || [],
      },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "debug/auth-org failed" },
      { status: 500 }
    );
  }
}
