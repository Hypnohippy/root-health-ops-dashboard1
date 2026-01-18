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
    // ignore URL parse issues
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

// POST /api/social-accounts?organisationId=...
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));

    const platform = asProviderId(body?.platform);
    const pageId = typeof body?.pageId === "string" ? body.pageId : null;
    const pageName = typeof body?.pageName === "string" ? body.pageName : null;

    // ✅ New fields
    const pageAccessToken =
      typeof body?.pageAccessToken === "string" ? body.pageAccessToken : null;

    // tokenExpiresAt can be:
    // - ISO string, or null
    // - number seconds from now (we’ll convert), or null
    let tokenExpiresAt: string | null = null;
    if (typeof body?.tokenExpiresAt === "string" && body.tokenExpiresAt.trim()) {
      tokenExpiresAt = body.tokenExpiresAt.trim();
    } else if (typeof body?.tokenExpiresInSec === "number" && body.tokenExpiresInSec > 0) {
      tokenExpiresAt = new Date(Date.now() + body.tokenExpiresInSec * 1000).toISOString();
    }

    // Optional fields you already use in DB
    const connectionType =
      typeof body?.connectionType === "string" ? body.connectionType : null;
    const makeWebhookUrl =
      typeof body?.makeWebhookUrl === "string" ? body.makeWebhookUrl : null;
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

    let result: any = null;

    if (existingRows && existingRows.length > 0) {
      // UPDATE
      const id = existingRows[0].id;

      const updatePayload: any = {
        page_name: pageName ?? null,
        connection_type: connectionType ?? null,
        make_webhook_url: makeWebhookUrl ?? null,
        is_active: isActive,
      };

      // Respect NOT NULL on page_id if you have it:
      if (typeof pageId === "string" && pageId.trim().length > 0) {
        updatePayload.page_id = pageId.trim();
      }

      // ✅ Save token fields if provided
      if (pageAccessToken && pageAccessToken.trim()) {
        updatePayload.page_access_token = pageAccessToken.trim();
      }
      if (tokenExpiresAt) {
        updatePayload.token_expires_at = tokenExpiresAt;
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
      // INSERT
      const newId = randomUUID();

      const safePageId =
        (typeof pageId === "string" && pageId.trim().length > 0
          ? pageId.trim()
          : "pending_page_id") + "";

      const insertPayload: any = {
        id: newId,
        organisation_id: organisationId,
        platform,
        page_id: safePageId,
        page_name: pageName ?? null,
        connection_type: connectionType ?? null,
        make_webhook_url: makeWebhookUrl ?? null,
        is_active: isActive,
        page_access_token: pageAccessToken && pageAccessToken.trim() ? pageAccessToken.trim() : null,
        token_expires_at: tokenExpiresAt ?? null,
      };

      const { data, error } = await supabaseAdmin
        .from("social_accounts")
        .insert(insertPayload)
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
