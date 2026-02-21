// app/api/social-accounts/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";

export const runtime = "nodejs";

function norm(v: any) {
  return String(v ?? "").trim();
}

function normPlatform(p: any) {
  return String(p || "").trim().toLowerCase();
}

function parseCookie(req: NextRequest, name: string) {
  const raw = req.headers.get("cookie") || "";
  const parts = raw.split(";").map((p) => p.trim());
  for (const p of parts) {
    if (p.startsWith(name + "=")) return decodeURIComponent(p.slice(name.length + 1));
  }
  return null;
}

async function getUserIdFromReq(req: NextRequest): Promise<string | null> {
  // 1) Authorization: Bearer <token>
  const auth = norm(req.headers.get("authorization"));
  const bearer = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  if (bearer) {
    const { data, error } = await supabaseAdmin.auth.getUser(bearer);
    if (!error && data?.user?.id) return data.user.id;
  }

  // 2) Supabase cookie patterns (covers many setups)
  const access =
    parseCookie(req, "sb-access-token") ||
    parseCookie(req, "supabase-auth-token");

  if (access) {
    // supabase-auth-token can be JSON like ["access","refresh"] in some setups
    const token = access.startsWith("[")
      ? (() => {
          try {
            const arr = JSON.parse(access);
            return Array.isArray(arr) ? String(arr[0] || "") : "";
          } catch {
            return "";
          }
        })()
      : access;

    if (token) {
      const { data, error } = await supabaseAdmin.auth.getUser(token);
      if (!error && data?.user?.id) return data.user.id;
    }
  }

  return null;
}

async function requireOrgForUser(req: NextRequest): Promise<{ userId: string; organisationId: string }> {
  const userId = await getUserIdFromReq(req);
  if (!userId) throw new Error("Not authenticated");

  // 1) Prefer explicit org id (query param)
  const fromQuery = norm(req.nextUrl.searchParams.get("organisationId"));

  // 2) Optional env forced org (useful in controlled beta)
  const forced = norm(process.env.NEXT_PUBLIC_SINGLE_ORG_ID || process.env.SINGLE_ORG_ID);

  const requestedOrgId = fromQuery || forced;

  if (requestedOrgId) {
    const { data: mem, error: memErr } = await supabaseAdmin
      .from("organisation_members")
      .select("organisation_id")
      .eq("organisation_id", requestedOrgId)
      .eq("user_id", userId)
      .maybeSingle();

    if (memErr) throw new Error(memErr.message);
    if (!mem?.organisation_id) throw new Error("Not a member of this organisation");

    return { userId, organisationId: requestedOrgId };
  }

  // 3) Fallback: first org membership for this user
  const { data: memberships, error } = await supabaseAdmin
    .from("organisation_members")
    .select("organisation_id, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1);

  if (error) throw new Error(error.message);

  const orgId = memberships?.[0]?.organisation_id ? String(memberships[0].organisation_id) : null;
  if (!orgId) throw new Error("No organisation membership found");

  return { userId, organisationId: orgId };
}

/**
 * GET /api/social-accounts?organisationId=...
 * Returns:
 * {
 *   success: true,
 *   organisationId: string,
 *   socialAccounts: Array<{ platform, page_id, page_name, is_active, token_expires_at, updated_at, created_at }>
 * }
 */
export async function GET(req: NextRequest) {
  try {
    const { organisationId } = await requireOrgForUser(req);

    const { data, error } = await supabaseAdmin
      .from("social_accounts")
      .select("platform,page_id,page_name,is_active,token_expires_at,updated_at,created_at")
      .eq("organisation_id", organisationId)
      .order("updated_at", { ascending: false });

    if (error) throw new Error(error.message);

    return NextResponse.json({
      success: true,
      organisationId,
      socialAccounts: data || [],
    });
  } catch (e: any) {
    const msg = e?.message || "Failed to load social accounts";
    const status = msg === "Not authenticated" ? 401 : msg.includes("Not a member") ? 403 : 500;
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}

/**
 * POST /api/social-accounts?organisationId=...
 * Body:
 * {
 *   platform: "facebook" | "instagram" | "threads" | "linkedin" | "tiktok" | ...
 *   page_id?: string
 *   page_name?: string
 *   page_access_token?: string
 *   token_expires_at?: string | null
 *   is_active?: boolean
 * }
 *
 * Behavior:
 * - Upserts (update if exists, insert if missing)
 * - is_active defaults to true unless explicitly false
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({} as any));
    const platform = normPlatform(body?.platform);

    if (!platform) {
      return NextResponse.json({ success: false, error: "Missing platform." }, { status: 400 });
    }

    const { organisationId } = await requireOrgForUser(req);

    const page_id = body?.page_id ? String(body.page_id).trim() : null;
    const page_name = body?.page_name ? String(body.page_name).trim() : null;
    const page_access_token = body?.page_access_token ? String(body.page_access_token).trim() : null;

    const token_expires_at =
      body?.token_expires_at === null || body?.token_expires_at === undefined
        ? null
        : String(body.token_expires_at).trim() || null;

    const is_active = body?.is_active === false ? false : true;
    const now = new Date().toISOString();

    // 1) Update existing row first
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
      .select("platform,page_id,page_name,is_active,token_expires_at,updated_at,created_at")
      .maybeSingle();

    if (!uErr && updated) {
      return NextResponse.json({
        success: true,
        organisationId,
        saved: true,
        socialAccount: updated,
        mode: "updated",
      });
    }

    // 2) Insert new row
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
      .select("platform,page_id,page_name,is_active,token_expires_at,updated_at,created_at")
      .single();

    if (iErr) throw new Error(iErr.message);

    return NextResponse.json({
      success: true,
      organisationId,
      saved: true,
      socialAccount: inserted,
      mode: "inserted",
    });
  } catch (e: any) {
    const msg = e?.message || "Failed to save social account";
    const status = msg === "Not authenticated" ? 401 : msg.includes("Not a member") ? 403 : 500;
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}

/**
 * DELETE /api/social-accounts?organisationId=...
 * Body: { platform }
 *
 * Soft disconnect:
 * - is_active=false
 * - clears token + expiry
 */
export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({} as any));
    const platform = normPlatform(body?.platform);

    if (!platform) {
      return NextResponse.json({ success: false, error: "Missing platform." }, { status: 400 });
    }

    const { organisationId } = await requireOrgForUser(req);

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

    if (error) throw new Error(error.message);

    return NextResponse.json({ success: true, organisationId });
  } catch (e: any) {
    const msg = e?.message || "Disconnect failed";
    const status = msg === "Not authenticated" ? 401 : msg.includes("Not a member") ? 403 : 500;
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}
