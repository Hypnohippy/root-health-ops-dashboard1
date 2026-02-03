// app/api/oauth/facebook/save-page/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../../lib/supabaseAdmin";

export const runtime = "nodejs";

/**
 * This endpoint is used by the "pick page / pick IG account" screens to SAVE a connection.
 * The 405 you saw means this route previously did not accept POST.
 *
 * We intentionally keep this very forgiving:
 * - It accepts POST
 * - It saves the selected connection into social_accounts
 * - It marks is_active=true so Quick Blast can select it
 *
 * Multi-tenant note:
 * - If body.organisationId is provided, we use it.
 * - Otherwise, we fall back to "single tenant" (first organisation).
 */

async function getSingleTenantOrganisationId(): Promise<string | null> {
  const { data, error } = await supabaseAdmin.from("organisations").select("id").limit(1);
  if (error || !data || data.length === 0) return null;
  return String(data[0].id);
}

export async function OPTIONS() {
  // Safe for browsers / preflight. Same-origin usually doesn't need it, but it doesn't hurt.
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({} as any));

    // Expected payloads (we accept several shapes to avoid “exactness” bugs):
    // - provider/platform: "facebook" | "instagram" | "threads"
    // - pageId / page_id
    // - pageName / page_name
    // - token / access_token / userToken / pageAccessToken
    // - organisationId / organisation_id (optional)
    const platformRaw = String(body?.platform ?? body?.provider ?? "").toLowerCase().trim();
    const platform =
      platformRaw === "facebook" || platformRaw === "instagram" || platformRaw === "threads"
        ? (platformRaw as "facebook" | "instagram" | "threads")
        : null;

    const pageId = String(body?.pageId ?? body?.page_id ?? "").trim();
    const pageName = String(body?.pageName ?? body?.page_name ?? "").trim() || null;

    const token =
      String(
        body?.page_access_token ??
          body?.pageAccessToken ??
          body?.access_token ??
          body?.userToken ??
          body?.token ??
          ""
      ).trim() || null;

    const organisationId =
      String(body?.organisationId ?? body?.organisation_id ?? "").trim() ||
      (await getSingleTenantOrganisationId());

    if (!platform) {
      return NextResponse.json(
        { success: false, error: "Missing/invalid platform (expected facebook/instagram/threads)." },
        { status: 400 }
      );
    }

    if (!organisationId) {
      return NextResponse.json(
        { success: false, error: "No organisation found to save connection into." },
        { status: 400 }
      );
    }

    if (!pageId) {
      return NextResponse.json(
        { success: false, error: "Missing pageId/page_id (the selected account id)." },
        { status: 400 }
      );
    }

    // Save / upsert into your existing social_accounts table
    const { error: upsertErr } = await supabaseAdmin
      .from("social_accounts")
      .upsert(
        {
          organisation_id: organisationId,
          platform,
          page_id: pageId,
          page_name: pageName,
          connection_type: "oauth",
          is_active: true,
          // store token if provided (for facebook page posting, IG publishing, etc.)
          page_access_token: token,
          // expiry may be unknown here; keep null
          token_expires_at: null,
        },
        { onConflict: "organisation_id,platform" }
      );

    if (upsertErr) {
      return NextResponse.json(
        {
          success: false,
          error: `Failed to save ${platform} connection: ${upsertErr.message}`,
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        platform,
        organisationId,
        page_id: pageId,
        page_name: pageName,
        is_active: true,
        saved: true,
      },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message || "Save-page route crashed" },
      { status: 500 }
    );
  }
}
