// app/api/social-accounts/route.ts
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";

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

function normPlatform(p: any) {
  return String(p || "").trim().toLowerCase();
}

function getOrgIdFromRequest(req: NextRequest): string | null {
  const url = new URL(req.url);
  const org =
    String(url.searchParams.get("organisationId") || "").trim() ||
    String(url.searchParams.get("organisation_id") || "").trim();

  const forced =
    (process.env.NEXT_PUBLIC_SINGLE_ORG_ID || "").trim() ||
    (process.env.SINGLE_ORG_ID || "").trim();

  // If you force single org in beta, use it (but we still require membership)
  return forced || org || null;
}

async function getAuthedUserId(): Promise<string | null> {
  // Reads cookies from the incoming request (Route Handler context)
  const cookieStore = cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          // In route handlers, you can set cookies via cookieStore.set
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        },
      },
    }
  );

  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return data?.user?.id || null;
}

async function requireMembership(organisationId: string, userId: string) {
  const { data, error } = await supabaseAdmin
    .from("organisation_members")
    .select("role")
    .eq("organisation_id", organisationId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) return { ok: false, role: null as string | null };
  if (!data) return { ok: false, role: null as string | null };
  return { ok: true, role: String(data.role || "").trim() || null };
}

function isWriteRole(role: string | null) {
  const r = String(role || "").toLowerCase();
  return r === "owner" || r === "admin" || r === "manager";
}

/**
 * GET /api/social-accounts?organisationId=...
 * Returns SAFE connection state WITHOUT exposing tokens
 */
export async function GET(req: NextRequest) {
  try {
    const userId = await getAuthedUserId();
    if (!userId) {
      return NextResponse.json(
        { success: false, error: "Not signed in." },
        { status: 401 }
      );
    }

    const organisationId = getOrgIdFromRequest(req);
    if (!organisationId) {
      return NextResponse.json(
        { success: false, error: "Missing organisationId." },
        { status: 400 }
      );
    }

    const mem = await requireMembership(organisationId, userId);
    if (!mem.ok) {
      return NextResponse.json(
        { success: false, error: "Not a member of this organisation." },
        { status: 403 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("social_accounts")
      .select(
        "platform,page_id,page_name,is_active,token_expires_at,updated_at,created_at,page_access_token"
      )
      .eq("organisation_id", organisationId)
      .order("updated_at", { ascending: false });

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    const safe = (data || []).map((row: any) => {
      const tok = String(row?.page_access_token || "").trim();
      const has_token = !!tok;

      return {
        organisation_id: organisationId,
        platform: String(row?.platform || "").toLowerCase() as ProviderId,
        page_id: row?.page_id ?? null,
        page_name: row?.page_name ?? null,
        is_active: !!row?.is_active,
        token_expires_at: row?.token_expires_at ?? null,
        updated_at: row?.updated_at ?? null,
        created_at: row?.created_at ?? null,
        has_token,
        token_state: has_token ? "HAS_TOKEN" : "NO_TOKEN",
      };
    });

    return NextResponse.json({
      success: true,
      organisationId,
      socialAccounts: safe,
    });
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message || "Failed to load social accounts" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/social-accounts?organisationId=...
 * Upserts a social account row (token stored server-side)
 * Requires org membership + write role
 */
export async function POST(req: NextRequest) {
  try {
    const userId = await getAuthedUserId();
    if (!userId) {
      return NextResponse.json(
        { success: false, error: "Not signed in." },
        { status: 401 }
      );
    }

    const organisationId = getOrgIdFromRequest(req);
    if (!organisationId) {
      return NextResponse.json(
        { success: false, error: "Missing organisationId." },
        { status: 400 }
      );
    }

    const mem = await requireMembership(organisationId, userId);
    if (!mem.ok) {
      return NextResponse.json(
        { success: false, error: "Not a member of this organisation." },
        { status: 403 }
      );
    }
    if (!isWriteRole(mem.role)) {
      return NextResponse.json(
        { success: false, error: "Insufficient role to update connections." },
        { status: 403 }
      );
    }

    const body = await req.json().catch(() => ({} as any));
    const platform = normPlatform(body?.platform);
    if (!platform) {
      return NextResponse.json(
        { success: false, error: "Missing platform." },
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

    const is_active = body?.is_active === false ? false : true;
    const now = new Date().toISOString();

    // Update first
    const { data: updated, error: uErr } = await supabaseAdmin
      .from("social_accounts")
      .update({
        page_id,
        page_name,
        page_access_token,
        token_expires_at,
        is_active,
        updated_at: now,
      })
      .eq("organisation_id", organisationId)
      .eq("platform", platform)
      .select(
        "platform,page_id,page_name,is_active,token_expires_at,updated_at,created_at,page_access_token"
      )
      .maybeSingle();

    if (!uErr && updated) {
      const tok = String(updated?.page_access_token || "").trim();
      return NextResponse.json({
        success: true,
        organisationId,
        saved: true,
        socialAccount: {
          platform: updated.platform,
          page_id: updated.page_id,
          page_name: updated.page_name,
          is_active: updated.is_active,
          token_expires_at: updated.token_expires_at,
          updated_at: updated.updated_at,
          created_at: updated.created_at,
          has_token: !!tok,
          token_state: tok ? "HAS_TOKEN" : "NO_TOKEN",
        },
        mode: "updated",
      });
    }

    // Insert
    const { data: inserted, error: iErr } = await supabaseAdmin
      .from("social_accounts")
      .insert({
        organisation_id: organisationId,
        platform,
        page_id,
        page_name,
        page_access_token,
        token_expires_at,
        is_active,
        created_at: now,
        updated_at: now,
      })
      .select(
        "platform,page_id,page_name,is_active,token_expires_at,updated_at,created_at,page_access_token"
      )
      .single();

    if (iErr) {
      return NextResponse.json(
        { success: false, error: iErr.message },
        { status: 500 }
      );
    }

    const tok = String(inserted?.page_access_token || "").trim();
    return NextResponse.json({
      success: true,
      organisationId,
      saved: true,
      socialAccount: {
        platform: inserted.platform,
        page_id: inserted.page_id,
        page_name: inserted.page_name,
        is_active: inserted.is_active,
        token_expires_at: inserted.token_expires_at,
        updated_at: inserted.updated_at,
        created_at: inserted.created_at,
        has_token: !!tok,
        token_state: tok ? "HAS_TOKEN" : "NO_TOKEN",
      },
      mode: "inserted",
    });
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message || "Failed to save social account" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/social-accounts?organisationId=...
 * Soft disconnect (requires write role)
 */
export async function DELETE(req: NextRequest) {
  try {
    const userId = await getAuthedUserId();
    if (!userId) {
      return NextResponse.json(
        { success: false, error: "Not signed in." },
        { status: 401 }
      );
    }

    const organisationId = getOrgIdFromRequest(req);
    if (!organisationId) {
      return NextResponse.json(
        { success: false, error: "Missing organisationId." },
        { status: 400 }
      );
    }

    const mem = await requireMembership(organisationId, userId);
    if (!mem.ok) {
      return NextResponse.json(
        { success: false, error: "Not a member of this organisation." },
        { status: 403 }
      );
    }
    if (!isWriteRole(mem.role)) {
      return NextResponse.json(
        { success: false, error: "Insufficient role to update connections." },
        { status: 403 }
      );
    }

    const body = await req.json().catch(() => ({} as any));
    const platform = normPlatform(body?.platform);

    if (!platform) {
      return NextResponse.json(
        { success: false, error: "Missing platform." },
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
