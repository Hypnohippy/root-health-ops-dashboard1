// app/api/oauth/facebook/save-page/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../../lib/supabaseAdmin";

export const runtime = "nodejs";

// Single-tenant fallback (your current build/testing mode)
async function getSingleTenantOrganisationId(): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from("organisations")
    .select("id")
    .limit(1);

  if (error || !data || data.length === 0) return null;
  return String(data[0].id);
}

// Some browsers call OPTIONS first; we allow it.
export async function OPTIONS() {
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

    // Accept a few different field names so the frontend can't "miss" it.
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
        { success: false, error: "Missing pageId/page_id (selected account id)." },
        { status: 400 }
      );
    }

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
          page_access_token: token,
          token_expires_at: null,
        },
        { onConflict: "organisation_id,platform" }
      );

    if (upsertErr) {
      return NextResponse.json(
        { success: false, error: `Failed to save ${platform} connection: ${upsertErr.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        saved: true,
        platform,
        organisationId,
        page_id: pageId,
        page_name: pageName,
        is_active: true,
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

// Helpful for quick checking in browser (optional but safe)
export async function GET() {
  return NextResponse.json({
    ok: true,
    route: "app/api/oauth/facebook/save-page/route.ts",
    message: "Save-page route is live (POST enabled).",
  });
}
