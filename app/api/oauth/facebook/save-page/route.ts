import { requireOrganisation, accessErrorResponse } from "@/lib/tenantAuth";
// app/api/oauth/facebook/save-page/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../../lib/supabaseAdmin";

export const runtime = "nodejs";

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST,PUT,PATCH,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

async function handleSave(req: NextRequest) {
  const body = await req.json().catch(() => ({} as any));

  const platformRaw = String(body?.platform ?? body?.provider ?? "")
    .toLowerCase()
    .trim();

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

  const { organisationId } = await requireOrganisation(body?.organisationId ?? body?.organisation_id);

  if (!platform) {
    return NextResponse.json(
      { success: false, error: "Missing/invalid platform (expected facebook/instagram/threads)." },
      { status: 400, headers: corsHeaders() }
    );
  }

  if (!organisationId) {
    return NextResponse.json(
      { success: false, error: "No organisation found to save connection into." },
      { status: 400, headers: corsHeaders() }
    );
  }

  if (!pageId) {
    return NextResponse.json(
      { success: false, error: "Missing pageId/page_id (selected account id)." },
      { status: 400, headers: corsHeaders() }
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
      { status: 500, headers: corsHeaders() }
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
    { status: 200, headers: corsHeaders() }
  );
}

export async function POST(req: NextRequest) {
  try {
    return await handleSave(req);
  } catch (e: any) {
    const denied = accessErrorResponse(e);
    if (denied) return denied;
    return NextResponse.json(
      { success: false, error: e?.message || "Save-page POST crashed" },
      { status: 500, headers: corsHeaders() }
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    return await handleSave(req);
  } catch (e: any) {
    const denied = accessErrorResponse(e);
    if (denied) return denied;
    return NextResponse.json(
      { success: false, error: e?.message || "Save-page PUT crashed" },
      { status: 500, headers: corsHeaders() }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    return await handleSave(req);
  } catch (e: any) {
    const denied = accessErrorResponse(e);
    if (denied) return denied;
    return NextResponse.json(
      { success: false, error: e?.message || "Save-page PATCH crashed" },
      { status: 500, headers: corsHeaders() }
    );
  }
}

export async function GET() {
  return NextResponse.json(
    {
      ok: true,
      route: "app/api/oauth/facebook/save-page/route.ts",
      message: "Save-page route is live (POST/PUT/PATCH enabled).",
    },
    { status: 200, headers: corsHeaders() }
  );
}
