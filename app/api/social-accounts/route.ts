import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { randomUUID } from "crypto";

function getOrganisationIdFromRequest(req: Request) {
  const url = new URL(req.url);
  return url.searchParams.get("organisationId");
}

// Single-tenant beta mode: use the first organisation row as "the current org".
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
export async function GET(req: Request) {
  try {
    const organisationId =
  getOrganisationIdFromRequest(req) || (await getSingleTenantOrganisationId());


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

    const organisationId =
  getOrganisationIdFromRequest(req) || (await getSingleTenantOrganisationId());

    if (!organisationId) {
      return NextResponse.json(
        { error: "No organisation found" },
        { status: 400 }
      );
    }

    // See if we already have a row for this org + platform
    const { data: existingRows, error: existingError } = await supabaseAdmin
      .from("social_accounts")
      .select("id, page_id")
      .eq("organisation_id", organisationId)
      .eq("platform", platform)
      .limit(1);

    if (existingError) {
      console.error("[social-accounts] lookup error", existingError);
    }

    let result;

    if (existingRows && existingRows.length > 0) {
      // UPDATE path
      const id = existingRows[0].id;

      // Respect NOT NULL on page_id:
      // - Only update it if caller actually sends a pageId
      // - Otherwise leave it as whatever non-null value it already has
      const updatePayload: any = {
        page_name: pageName ?? null,
      };

      if (typeof pageId === "string" && pageId.trim().length > 0) {
        updatePayload.page_id = pageId;
      }

      const { data, error } = await supabaseAdmin
        .from("social_accounts")
        .update(updatePayload)
        .eq("id", id)
        .select()
        .single();

      if (error) {
        console.error("[social-accounts] update error", error);
        return NextResponse.json(
          { error: "Failed to update social account", details: error },
          { status: 500 }
        );
      }

      result = data;
    } else {
      // INSERT path
      const newId = randomUUID();

      // Respect NOT NULL on page_id:
      // We don't know the real FB page ID yet (no OAuth), so we store
      // a placeholder that we can overwrite later when we implement
      // real page selection.
      const safePageId =
        (typeof pageId === "string" && pageId.trim().length > 0
          ? pageId
          : "pending_page_id") + "";

      const { data, error } = await supabaseAdmin
        .from("social_accounts")
        .insert({
          id: newId,
          organisation_id: organisationId,
          platform,
          page_id: safePageId, // NOT NULL
          page_name: pageName ?? null,
          // connection_type defaults to 'make_webhook'
          // is_active defaults to true
          // created_at defaults to now()
        })
        .select()
        .single();

      if (error) {
        console.error("[social-accounts] insert error", error);
        return NextResponse.json(
          { error: "Failed to create social account", details: error },
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

    const organisationId =
  getOrganisationIdFromRequest(req) || (await getSingleTenantOrganisationId());

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
