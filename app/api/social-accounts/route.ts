// app/api/social-accounts/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { randomUUID } from "crypto";

type ProviderId =
  | "facebook"
  | "instagram"
  | "tiktok"
  | "linkedin"
  | "google"
  | "email"
  | "whatsapp"
  | "threads";

function asProviderId(v: any): ProviderId | null {
  const s = String(v || "").toLowerCase().trim();
  const allowed: ProviderId[] = [
    "facebook",
    "instagram",
    "tiktok",
    "linkedin",
    "google",
    "email",
    "whatsapp",
    "threads",
  ];
  return allowed.includes(s as ProviderId) ? (s as ProviderId) : null;
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

/**
 * Multi-tenant ready:
 * - If caller passes ?organisationId=..., use that
 * - otherwise fall back to single-tenant default
 */
async function resolveOrganisationId(req: Request) {
  try {
    const url = new URL(req.url);
    const orgFromQuery = url.searchParams.get("organisationId");
    if (orgFromQuery && orgFromQuery.trim()) return orgFromQuery.trim();
  } catch {
    // ignore
  }
  return await getSingleTenantOrganisationId();
}

// GET /api/social-accounts?organisationId=...
export async function GET(req: Request) {
  try {
    const organisationId = await resolveOrganisationId(req);

    if (!organisationId) {
      return NextResponse.json({
        organisationId: null,
        socialAccounts: [],
      });
    }

    const { data, error } = await supabaseAdmin
      .from("social_accounts")
      .select(
        "id, organisation_id, platform, page_id, page_name, connection_type, make_webhook_url, is_active, created_at"
      )
      .eq("organisation_id", organisationId)
      .order("created_at", { ascending: true });

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

// POST /api/social-accounts?organisationId=...
// Body:
// {
//   platform: "facebook" | ...,
//   pageId?: string,
//   pageName?: string,
//   connectionType?: string,         // e.g. "oauth" | "make" | "manual"
//   makeWebhookUrl?: string | null,
//   isActive?: boolean
// }
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));

    const platform = asProviderId(body?.platform);
    const pageId = typeof body?.pageId === "string" ? body.pageId.trim() : "";
    const pageName =
      typeof body?.pageName === "string" ? body.pageName.trim() : null;

    const connectionType =
      typeof body?.connectionType === "string" && body.connectionType.trim()
        ? body.connectionType.trim()
        : "manual";

    const makeWebhookUrl =
      typeof body?.makeWebhookUrl === "string" && body.makeWebhookUrl.trim()
        ? body.makeWebhookUrl.trim()
        : null;

    const isActive =
      typeof body?.isActive === "boolean" ? body.isActive : true;

    if (!platform) {
      return NextResponse.json(
        { error: "platform is required" },
        { status: 400 }
      );
    }

    const organisationId = await resolveOrganisationId(req);

    if (!organisationId) {
      return NextResponse.json(
        { error: "No organisation found" },
        { status: 400 }
      );
    }

    // ✅ If inserting a brand new row, require a real pageId.
    // (This avoids the old 'pending_page_id' hack.)
    // You CAN still update page_name / is_active without a pageId later.
    const hasRealPageId = pageId.length > 0;

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

    let result: any = null;

    if (existingRows && existingRows.length > 0) {
      // UPDATE path
      const id = existingRows[0].id;

      const updatePayload: any = {
        page_name: pageName,
        connection_type: connectionType,
        make_webhook_url: makeWebhookUrl,
        is_active: isActive,
      };

      // Only update page_id if provided
      if (hasRealPageId) {
        updatePayload.page_id = pageId;
      }

      const { data, error } = await supabaseAdmin
        .from("social_accounts")
        .update(updatePayload)
        .eq("id", id)
        .select(
          "id, organisation_id, platform, page_id, page_name, connection_type, make_webhook_url, is_active, created_at"
        )
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
      if (!hasRealPageId) {
        return NextResponse.json(
          {
            error:
              "pageId is required the first time you connect a platform (insert).",
          },
          { status: 400 }
        );
      }

      const newId = randomUUID();

      const { data, error } = await supabaseAdmin
        .from("social_accounts")
        .insert({
          id: newId,
          organisation_id: organisationId,
          platform,
          page_id: pageId,
          page_name: pageName,
          connection_type: connectionType,
          make_webhook_url: makeWebhookUrl,
          is_active: isActive,
        })
        .select(
          "id, organisation_id, platform, page_id, page_name, connection_type, make_webhook_url, is_active, created_at"
        )
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

// DELETE /api/social-accounts?organisationId=...
export async function DELETE(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const platform = asProviderId(body?.platform);

    if (!platform) {
      return NextResponse.json(
        { error: "platform is required" },
        { status: 400 }
      );
    }

    const organisationId = await resolveOrganisationId(req);

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
