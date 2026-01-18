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

// Single-tenant beta mode fallback
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

async function resolveOrganisationId(req: Request) {
  try {
    const url = new URL(req.url);
    const orgFromQuery = url.searchParams.get("organisationId");
    if (orgFromQuery && orgFromQuery.trim()) return orgFromQuery.trim();
  } catch {}
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

    const pageIdRaw = body?.pageId;
    const pageNameRaw = body?.pageName;

    const connectionTypeRaw = body?.connectionType;
    const makeWebhookUrlRaw = body?.makeWebhookUrl;
    const isActiveRaw = body?.isActive;
    const metaRaw = body?.meta;

    const page_id =
      typeof pageIdRaw === "string" && pageIdRaw.trim().length > 0
        ? pageIdRaw.trim()
        : "pending_page_id"; // keep NOT NULL happy

    const page_name =
      typeof pageNameRaw === "string" && pageNameRaw.trim().length > 0
        ? pageNameRaw.trim()
        : null;

    const connection_type =
      typeof connectionTypeRaw === "string" && connectionTypeRaw.trim()
        ? connectionTypeRaw.trim()
        : null;

    const make_webhook_url =
      typeof makeWebhookUrlRaw === "string" && makeWebhookUrlRaw.trim()
        ? makeWebhookUrlRaw.trim()
        : null;

    const is_active =
      typeof isActiveRaw === "boolean" ? isActiveRaw : true;

    const meta =
      metaRaw && typeof metaRaw === "object" ? metaRaw : null;

    // Check if existing row for org+platform
    const { data: existingRows } = await supabaseAdmin
      .from("social_accounts")
      .select("id")
      .eq("organisation_id", organisationId)
      .eq("platform", platform)
      .limit(1);

    let result;

    if (existingRows && existingRows.length > 0) {
      const id = existingRows[0].id;

      const { data, error } = await supabaseAdmin
        .from("social_accounts")
        .update({
          page_id,
          page_name,
          connection_type,
          make_webhook_url,
          is_active,
          meta,
        })
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
          organisation_id: organisationId,
          platform,
          page_id,
          page_name,
          connection_type,
          make_webhook_url,
          is_active,
          meta,
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
