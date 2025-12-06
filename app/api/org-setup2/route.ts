// app/api/org-setup2/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getCurrentUserId } from "@/lib/supabaseServer";
import { randomUUID } from "crypto";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const userId = await getCurrentUserId();

    if (!userId) {
      return NextResponse.json(
        { error: "Not authenticated. Please sign in again." },
        { status: 401 }
      );
    }

    const form = await req.formData();

    const orgName = (form.get("orgName") as string | null)?.trim();
    let orgSlug = (form.get("orgSlug") as string | null)?.trim();

    if (!orgName) {
      return NextResponse.json(
        { error: "Organisation name is required." },
        { status: 400 }
      );
    }

    if (!orgSlug) {
      orgSlug =
        orgName
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "") || randomUUID().slice(0, 8);
    }

    // For now, keep insert *minimal* so it doesn't break on missing columns.
    // Once we see it working, we can add more fields (industry, colours, etc).
    const { data: org, error: orgError } = await supabaseAdmin
      .from("organisations")
      .insert({
        name: orgName,
        slug: orgSlug,
        created_by: userId,
      })
      .select("*")
      .single();

    if (orgError) {
      console.error("[org-setup2] organisation insert error", orgError);
      return NextResponse.json(
        {
          error: "Failed to insert organisation",
          details: orgError.message ?? orgError,
        },
        { status: 500 }
      );
    }

    const orgId = (org as any).id;

    if (!orgId) {
      return NextResponse.json(
        {
          error:
            "Organisation created but no id returned from database. Please contact support.",
          details: org,
        },
        { status: 500 }
      );
    }

    // Create membership row for this user as owner
    const { error: memberError } = await supabaseAdmin
      .from("organisation_members")
      .insert({
        organisation_id: orgId,
        user_id: userId,
        role: "owner",
      });

    if (memberError) {
      console.error("[org-setup2] membership insert error", memberError);
      return NextResponse.json(
        {
          error:
            "Organisation created but failed to create membership for this user.",
          details: memberError.message ?? memberError,
        },
        { status: 500 }
      );
    }

    // (Later we can add social_accounts, brand colours, etc.)
    return NextResponse.json(
      {
        organisation: {
          id: orgId,
          name: orgName,
          slug: orgSlug,
        },
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("[org-setup2] unexpected error", err);
    return NextResponse.json(
      {
        error: "Unexpected error in org-setup2.",
        details: err?.message ?? String(err),
      },
      { status: 500 }
    );
  }
}
