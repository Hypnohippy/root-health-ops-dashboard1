// app/api/social-accounts/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { randomUUID } from "crypto";

export const runtime = "nodejs";

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

/**
 * Single-tenant beta default:
 * - If caller passes ?organisationId=..., use that
 * - Otherwise use the first organisations row
 * - If none exists, attempt to create one (best-effort)
 */
async function getOrCreateDefaultOrganisationId(): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from("organisations")
    .select("id")
    .order("created_at", { ascending: true })
    .limit(1);

  if (!error && data && data.length > 0 && data[0]?.id) {
    return String(data[0].id);
  }

  // No org found (or select failed) -> best-effort create.
  const newId = randomUUID();

  // Attempt 1: common schema includes name + created_at
  const attempt1 = await supabaseAdmin
    .from("organisations")
    .insert({
      id: newId,
      name: "Root Health Ops Workspace",
      created_at: new Date().toISOString(),
    } as any)
    .select("id")
    .maybeSingle();

  if (!attempt1.error && attempt1.data?.id) {
    return String(attempt1.data.id);
  }

  // Attempt 2: minimal schema (id only)
  const attempt2 = await supabaseAdmin
    .from("organisations")
    .insert({ id: newId } as any)
    .select("id")
    .maybeSingle();

  if (!attempt2.error && attempt2.data?.id) {
    return String(attempt2.data.id);
  }

  console.error(
    "[social-accounts] Could not create default organisation",
    attempt1.error || attempt2.error || error
  );
  return null;
}

async function resolveOrganisationId(req: NextRequest): Promise<string | null> {
  const orgFromQuery = req.nextUrl.searchParams.get("organisationId");
  if (orgFromQuery && orgFromQuery.trim()) return orgFromQuery.trim();
  return await getOrCreateDefaultOrganisationId();
}

/**
 * IMPORTANT (Option A / OAuth posting):
 * This route supports storing the selected FB Page's page access token.
 *
 * For that, add these columns in Supabase:
 *   alter table public.social_accounts
 *   add column if not exists page_access_token text,
 *   add column if not exists token_expires_at timestamptz;
 */

function cleanOptString(v: any): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s.length ? s : null;
}

function cleanOptBool(v: any): boolean | null {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") {
    const s = v.toLowerCase().trim();
    if (s === "true" || s === "1" || s === "yes") return true;
    if (s === "false" || s === "0" || s === "no") return false;
  }
  return null;
}

// GET /api/social-accounts?organisationId=...
export async function GET(req: NextRequest) {
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
      { error: error?.message || "Unexpected error" },
      { status: 500 }
    );
  }
}

// POST /api/social-accounts?organisationId=...
export async function POST(req: NextRequest) {
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
        { error: "No organisation found (and could not create one)" },
        { status: 400 }
      );
    }

    // Core fields
    const pageIdRaw = cleanOptString(body?.pageId);
    const pageName = cleanOptString(body?.pageName);

    // Optional fields (safe to ignore if you’re not using them yet)
    const connectionType = cleanOptString(body?.connectionType); // "oauth" | "make" | etc
    const makeWebhookUrl = cleanOptString(body?.makeWebhookUrl);
    const isActive = cleanOptBool(body?.isActive);

    // OAuth token storage (Option A)
    const pageAccessToken = cleanOptString(body?.pageAccessToken);
    const tokenExpiresAt = cleanOptString(body?.tokenExpiresAt); // ISO string

    // Respect NOT NULL on page_id (your table currently uses NOT NULL)
    const safePageId = (pageIdRaw ? pageIdRaw : "pending_page_id") + "";

    // Do we already have a row for this org + platform?
    const { data: existingRows, error: existingError } = await supabaseAdmin
      .from("social_accounts")
      .select("id")
      .eq("organisation_id", organisationId)
      .eq("platform", platform)
      .limit(1);

    if (existingError) {
      console.error("[social-accounts] lookup error", existingError);
    }

    const basePayload: any = {
      page_id: safePageId,
      page_name: pageName,
    };

    // Only include optional fields if provided
    if (connectionType !== null) basePayload.connection_type = connectionType;
    if (makeWebhookUrl !== null) basePayload.make_webhook_url = makeWebhookUrl;
    if (isActive !== null) basePayload.is_active = isActive;

    // Token fields (require DB columns to exist)
    if (pageAccessToken !== null) basePayload.page_access_token = pageAccessToken;
    if (tokenExpiresAt !== null) basePayload.token_expires_at = tokenExpiresAt;

    let result: any = null;

    if (existingRows && existingRows.length > 0) {
      // UPDATE
      const id = existingRows[0].id;

      const { data, error } = await supabaseAdmin
        .from("social_accounts")
        .update(basePayload)
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

      const { data, error } = await supabaseAdmin
        .from("social_accounts")
        .insert({
          id: newId,
          organisation_id: organisationId,
          platform,
          ...basePayload,
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
      { error: error?.message || "Unexpected error" },
      { status: 500 }
    );
  }
}

// DELETE /api/social-accounts?organisationId=...
export async function DELETE(req: NextRequest) {
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
        { error: "Failed to delete social account", details: error },
        { status: 500 }
      );
    }

    return NextResponse.json({ organisationId, platform });
  } catch (error: any) {
    console.error("[social-accounts] DELETE unexpected", error);
    return NextResponse.json(
      { error: error?.message || "Unexpected error" },
      { status: 500 }
    );
  }
}
