import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";

export const runtime = "nodejs";

async function getOrganisationId(): Promise<string | null> {
  // Optional: force a specific org via env var (useful in beta)
  const forced = (process.env.NEXT_PUBLIC_SINGLE_ORG_ID || "").trim();
  if (forced) return forced;

  // ✅ Use the MOST RECENT org (matches Threads callback + modern single-tenant behaviour)
  const { data, error } = await supabaseAdmin
    .from("organisations")
    .select("id, created_at")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data?.id) return null;
  return String(data.id);
}

function normPlatform(p: any) {
  return String(p || "").trim().toLowerCase();
}

export async function GET(_req: NextRequest) {
  try {
    const organisationId = await getOrganisationId();
    if (!organisationId) {
      return NextResponse.json(
        { success: false, error: "No organisation found." },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("social_accounts")
      // NOTE: we intentionally do NOT return page_access_token to the browser
      .select("platform,page_id,page_name,is_active,token_expires_at,updated_at,created_at")
      .eq("organisation_id", organisationId)
      .order("updated_at", { ascending: false });

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      organisationId,
      socialAccounts: data || [],
    });
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message || "Failed to load social accounts" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({} as any));

    const platform = normPlatform(body?.platform);
    if (!platform) {
      return NextResponse.json(
        { success: false, error: "Missing platform." },
        { status: 400 }
      );
    }

    const organisationId = await getOrganisationId();
    if (!organisationId) {
      return NextResponse.json(
        { success: false, error: "No organisation found." },
        { status: 400 }
      );
    }

    const page_id = body?.page_id ? String(body.page_id).trim() : null;
    const page_name = body?.page_name ? String(body.page_name).trim() : null;

    const page_access_token = body?.page_access_token
      ? String(body.page_access_token).trim()
      : null;

    const token_expires_at =
      body?.token_expires_at === null || body?.token_expires_at === undefined
        ? null
        : String(body.token_expires_at).trim() || null;

    const now = new Date().toISOString();

    const row: any = {
      organisation_id: organisationId,
      platform,
      page_id,
      page_name,
      page_access_token,
      token_expires_at,
      is_active: true,
      updated_at: now,
    };

    const up = await supabaseAdmin
      .from("social_accounts")
      .upsert(row, { onConflict: "organisation_id,platform" })
      .select("platform,page_id,page_name,is_active,token_expires_at,updated_at,created_at")
      .maybeSingle();

    if (!up.error) {
      return NextResponse.json({
        success: true,
        organisationId,
        saved: true,
        socialAccount: up.data ?? null,
      });
    }

    const { data: updated, error: uErr } = await supabaseAdmin
      .from("social_accounts")
      .update({
        page_id,
        page_name,
        page_access_token,
        token_expires_at,
        is_active: true,
        updated_at: now,
      })
      .eq("organisation_id", organisationId)
      .eq("platform", platform)
      .select("platform,page_id,page_name,is_active,token_expires_at,updated_at,created_at")
      .maybeSingle();

    if (!uErr && updated) {
      return NextResponse.json({
        success: true,
        organisationId,
        saved: true,
        socialAccount: updated,
        note: "Saved via update fallback (no unique constraint).",
      });
    }

    const { data: inserted, error: iErr } = await supabaseAdmin
      .from("social_accounts")
      .insert(row)
      .select("platform,page_id,page_name,is_active,token_expires_at,updated_at,created_at")
      .single();

    if (iErr) {
      return NextResponse.json(
        { success: false, error: iErr.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      organisationId,
      saved: true,
      socialAccount: inserted,
      note: "Saved via insert fallback.",
    });
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message || "Failed to save social account" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const platform = normPlatform(body?.platform);

    if (!platform) {
      return NextResponse.json(
        { success: false, error: "Missing platform." },
        { status: 400 }
      );
    }

    const organisationId = await getOrganisationId();
    if (!organisationId) {
      return NextResponse.json(
        { success: false, error: "No organisation found." },
        { status: 400 }
      );
    }

    const { error } = await supabaseAdmin
      .from("social_accounts")
      .update({
        is_active: false,
        page_access_token: null,
        token_expires_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("organisation_id", organisationId)
      .eq("platform", platform);

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message || "Disconnect failed" },
      { status: 500 }
    );
  }
}
