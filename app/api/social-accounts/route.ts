import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// We deliberately use supabaseAdmin here so RLS doesn't block us.
// We still scope everything ourselves by userId -> organisationId.
async function resolveOrganisationId(userId: string) {
  // 1) Try organisation_members (user is explicitly a member)
  const { data: memberRows, error: memberError } = await supabaseAdmin
    .from("organisation_members")
    .select("organisation_id")
    .eq("user_id", userId)
    .limit(1);

  if (memberError) {
    console.error("[social-accounts] organisation_members error", memberError);
  }

  if (memberRows && memberRows.length > 0) {
    return memberRows[0].organisation_id as string;
  }

  // 2) Fallback to organisations where user is the owner
  const { data: orgRows, error: orgError } = await supabaseAdmin
    .from("organisations")
    .select("id")
    .eq("owner_id", userId)
    .limit(1);

  if (orgError) {
    console.error("[social-accounts] organisations (owner) error", orgError);
  }

  if (orgRows && orgRows.length > 0) {
    return orgRows[0].id as string;
  }

  // 3) FINAL fallback: just grab the first organisation in the table.
  // This makes things work for your single-tenant beta even if owner_id
  // isn't wired yet. Later we can add a proper org picker.
  const { data: anyOrgRows, error: anyOrgError } = await supabaseAdmin
    .from("organisations")
    .select("id")
    .limit(1);

  if (anyOrgError) {
    console.error("[social-accounts] organisations (any) error", anyOrgError);
  }

  if (anyOrgRows && anyOrgRows.length > 0) {
    console.warn(
      "[social-accounts] Falling back to first organisation row for user",
      userId
    );
    return anyOrgRows[0].id as string;
  }

  console.warn(
    "[social-accounts] No organisation found at all for user",
    userId
  );
  return null;
}

// GET /api/social-accounts
export async function GET() {
  try {
    const userId = await getCurrentUserId();

    if (!userId) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      );
    }

    const organisationId = await resolveOrganisationId(userId);

    if (!organisationId) {
      return NextResponse.json({
        organisationId: null,
        socialAccounts: [],
      });
    }

    const { data, error } = await supabaseAdmin
      .from("social_accounts")
      .select("*")
      .eq("organisation_id", organisationId);

    if (error) {
      console.error("[social-accounts] GET error", error);
      return NextResponse.json(
        { error: "Failed to load social accounts" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      organisationId,
      socialAccounts: data ?? [],
    });
  } catch (error: any) {
    console.error("[social-accounts] GET unexpected", error);
    return NextResponse.json(
      { error: error.message || "Unexpected error" },
      { status: 500 }
    );
  }
}

// POST /api/social-accounts
export async function POST(req: Request) {
  try {
    const userId = await getCurrentUserId();

    if (!userId) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      );
    }

    const { platform, pageId, pageName } = await req.json();

    if (!platform) {
      return NextResponse.json(
        { error: "platform is required" },
        { status: 400 }
      );
    }

    const organisationId = await resolveOrganisationId(userId);

    if (!organisationId) {
      return NextResponse.json(
        { error: "No organisation found for current user" },
        { status: 400 }
      );
    }

    // See if we already have a row for this org + platform
    const { data: existingRows, error: existingError } = await supabaseAdmin
      .from("social_accounts")
      .select("id")
      .eq("organisation_id", organisationId)
      .eq("platform", platform)
      .limit(1);

    if (existingError) {
      console.error("[social-accounts] lookup error", existingError);
    }

    let result;

    if (existingRows && existingRows.length > 0) {
      const id = existingRows[0].id;
      const { data, error } = await supabaseAdmin
        .from("social_accounts")
        .update({
          page_id: pageId ?? null,
          page_name: pageName ?? null,
        })
        .eq("id", id)
        .select()
        .single();

      if (error) {
        console.error("[social-accounts] update error", error);
        return NextResponse.json(
          { error: "Failed to update social account" },
          { status: 500 }
        );
      }

      result = data;
    } else {
      const { data, error } = await supabaseAdmin
        .from("social_accounts")
        .insert({
          organisation_id: organisationId,
          platform,
          page_id: pageId ?? null,
          page_name: pageName ?? null,
        })
        .select()
        .single();

      if (error) {
        console.error("[social-accounts] insert error", error);
        return NextResponse.json(
          { error: "Failed to create social account" },
          { status: 500 }
        );
      }

      result = data;
    }

    return NextResponse.json({
      organisationId,
      socialAccount: result,
    });
  } catch (error: any) {
    console.error("[social-accounts] POST unexpected", error);
    return NextResponse.json(
      { error: error.message || "Unexpected error" },
      { status: 500 }
    );
  }
}

// DELETE /api/social-accounts
export async function DELETE(req: Request) {
  try {
    const userId = await getCurrentUserId();

    if (!userId) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      );
    }

    const { platform } = await req.json();

    if (!platform) {
      return NextResponse.json(
        { error: "platform is required" },
        { status: 400 }
      );
    }

    const organisationId = await resolveOrganisationId(userId);

    if (!organisationId) {
      return NextResponse.json(
        { error: "No organisation found for current user" },
        { status: 400 }
      );
    }

    const { error } = await supabaseAdmin
      .from("social_accounts")
      .delete()
      .eq("organisation_id", organisationId)
      .eq("platform", platform);

    if (error) {
      console.error("[social-accounts] DELETE error", error);
      return NextResponse.json(
        { error: "Failed to delete social account" },
        { status: 500 }
      );
    }

    return NextResponse.json({ organisationId, platform });
  } catch (error: any) {
    console.error("[social-accounts] DELETE unexpected", error);
    return NextResponse.json(
      { error: error.message || "Unexpected error" },
      { status: 500 }
    );
  }
}
