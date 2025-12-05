import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { userId, name, brandName } = body;

    if (!userId || !name) {
      return NextResponse.json(
        { error: "userId and name are required" },
        { status: 400 }
      );
    }

    // 1. Create the organisation
    const { data: org, error: orgError } = await supabaseAdmin
      .from("organisations")
      .insert({
        owner_id: userId,
        name,
        slug: name.toLowerCase().replace(/\s+/g, "-"),
        brand_name: brandName ?? null
      })
      .select()
      .single();

    if (orgError) {
      console.error("Org insert error", orgError);
      return NextResponse.json(
        { error: "Failed to create organisation", details: orgError.message },
        { status: 500 }
      );
    }

    // 2. Add the user as a member
    const { error: memberError } = await supabaseAdmin
      .from("organisation_members")
      .insert({
        organisation_id: org.id,
        user_id: userId,
        role: "owner",
      });

    if (memberError) {
      console.error("Member insert error", memberError);
      return NextResponse.json(
        { error: "Failed to add owner to org", details: memberError.message },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { organisation: org },
      { status: 201 }
    );
  } catch (err: any) {
    console.error("Organisation POST error", err);
    return NextResponse.json(
      { error: "Server error", details: err?.message },
      { status: 500 }
    );
  }
}
