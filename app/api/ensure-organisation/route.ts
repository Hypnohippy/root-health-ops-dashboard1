// app/api/ensure-organisation/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!; // service role only

const supabaseAdmin = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false },
});

export async function POST(req: NextRequest) {
  try {
    const { userId, name } = await req.json();

    if (!userId) {
      return NextResponse.json(
        { error: "userId is required" },
        { status: 400 }
      );
    }

    // 1) Do we already have an organisation for this user as owner?
    const { data: existingOrg, error: orgError } = await supabaseAdmin
      .from("organisations")
      .select("id, name")
      .eq("owner_id", userId)
      .maybeSingle();

    if (orgError) {
      console.error("Error checking existing org", orgError);
      return NextResponse.json(
        { error: "Failed to check organisation" },
        { status: 500 }
      );
    }

    if (existingOrg) {
      return NextResponse.json(
        { organisation: existingOrg, created: false },
        { status: 200 }
      );
    }

    // 2) Create new organisation
    const orgName = name ?? "My Practice";

    const { data: newOrg, error: newOrgError } = await supabaseAdmin
      .from("organisations")
      .insert({
        owner_id: userId,
        name: orgName,
        slug: `${userId}-default`,
        brand_name: orgName,
      })
      .select()
      .single();

    if (newOrgError) {
      console.error("Error creating organisation", newOrgError);
      return NextResponse.json(
        { error: "Failed to create organisation" },
        { status: 500 }
      );
    }

    // 3) Add membership row
    const { error: memberError } = await supabaseAdmin
      .from("organisation_members")
      .insert({
        organisation_id: newOrg.id,
        user_id: userId,
        role: "owner",
      });

    if (memberError) {
      console.error("Error creating org member", memberError);
      // Not fatal for now – org exists.
    }

    return NextResponse.json(
      { organisation: newOrg, created: true },
      { status: 201 }
    );
  } catch (err: any) {
    console.error("ensure-organisation error", err);
    return NextResponse.json(
      { error: "Server error", details: err?.message },
      { status: 500 }
    );
  }
}
