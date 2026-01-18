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

    // Accept camelCase or snake_case (because we’ve changed this a few times)
    const platformRaw = body.platform ?? body.provider ?? body.channel;
    const platform = asProviderId(platformRaw);

    const pageId =
      body.pageId ??
      body.page_id ??
      body.pageID ??
      body.page ??
      body.accountId ??
      body.account_id ??
      null;

    const pageName =
      body.pageName ??
      body.page_name ??
      body.accountName ??
      body.account_name ??
      null;

    const connectionType =
      body.connectionType ?? body.connection_type ?? "oauth";

    const makeWebhookUrl =
      body.makeWebhookUrl ?? body.make_webhook_url ?? null;

    const isActive =
      typeof body.isActive === "boolean"
        ? body.isActive
        : typeof body.is_active === "boolean"
        ? body.is_active
        : true;

    const pageAccessToken =
      body.pageAccessToken ?? body.page_access_token ?? null;

    const tokenExpiresAt =
      body.tokenExpiresAt ?? body.token_expires_at ?? null;

    if (!platform) {
      return NextResponse.json(
        { error: "platform is required (facebook/instagram/linkedin/etc)" },
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
      return NextResponse.json(
        { error: "Failed to lookup social account", details: existingError },
        { status: 500 }
      );
    }

    const payload: any = {
      organisation_id: organisationId,
      platform,
      page_id: typeof pageId === "string" ? pageId : pageId ? String(pageId) : null,
      page_name: typeof pageName === "string" ? pageName : pageName ? String(pageName) : null,
      connection_type: typeof connectionType === "string" ? connectionType : "oauth",
      make_webhook_url: typeof makeWebhookUrl === "string" ? makeWebhookUrl : null,
      is_active: Boolean(isActive),
      page_access_token: typeof pageAccessToken === "string" ? pageAccessToken : null,
      token_expires_at: tokenExpiresAt ? String(tokenExpiresAt) : null,
    };

    // If your table has NOT NULL on page_id, keep it safe
    if (!payload.page_id || !String(payload.page_id).trim()) {
      payload.page_id = "pending_page_id";
    }

    let result: any;

    if (existingRows && existingRows.length > 0) {
      const id = existingRows[0].id;

      const { data, error } = await supabaseAdmin
        .from("social_accounts")
        .update(payload)
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
      const newId = randomUUID();

      const { data, error } = await supabaseAdmin
        .from("social_accounts")
        .insert({
          id: newId,
          ...payload,
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

// DELETE /api/social-accounts?organisationId=...
export async function DELETE(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const platform = asProviderId(body.platform ?? body.provider);

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
