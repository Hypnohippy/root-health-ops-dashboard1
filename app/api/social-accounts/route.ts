import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// TEMP: single-tenant beta mode.
// We just use the first organisation row as "the current org".
async function getSingleTenantOrganisationId() {
  const { data, error } = await supabaseAdmin
    .from("organisations")
    .select("id")
    .limit(1);

  if (error) {
    console.error("[social-accounts] organisations error", error);
    return null;
  }

  if (!data || data.length === 0) {
    console.warn("[social-accounts] No organisations found in database");
    return null;
  }

  return data[0].id as string;
}

// GET /api/social-accounts
export async function GET() {
  try {
    const organisationId = await getSingleTenantOrganisationId();

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
    const { platform, pageId, pageName } = await req.json();

    if (!platform) {
      return NextResponse.json(
        { error: "platform is required" },
        { status: 400 }
      );
    }

    const organisationId = await getSingleTenantOrganisationId();

    if (!organisationId) {
      return NextResponse.json(
        { error: "No organisation found" },
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
    const { platform } = await req.json();

    if (!platform) {
      return NextResponse.json(
        { error: "platform is required" },
        { status: 400 }
      );
    }

    const organisationId = await getSingleTenantOrganisationId();

    if (!organisationId) {
      return NextResponse.json(
        { error: "No organisation found" },
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
