// app/api/onboarding/bootstrap/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

export const runtime = "nodejs";

type CookieToSet = {
  name: string;
  value: string;
  options?: any;
};

function forcedOrgId(): string | null {
  const forced =
    (process.env.NEXT_PUBLIC_SINGLE_ORG_ID || "").trim() ||
    (process.env.SINGLE_ORG_ID || "").trim();
  return forced || null;
}

async function getFallbackOrgId(): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from("organisations")
    .select("id, created_at")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data?.id) return null;
  return String(data.id);
}

async function getAuthedUserId(req: NextRequest): Promise<string | null> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  if (!supabaseUrl || !supabaseKey) return null;

  // Collect cookies Supabase wants to set, then apply them to the response.
  const pendingCookies: CookieToSet[] = [];

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return req.cookies.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        pendingCookies.push(...cookiesToSet);
      },
    },
  });

  const { data, error } = await supabase.auth.getUser();

  // We return both userId and any cookies to set via a symbol on the response builder
  // (we’ll apply cookies later in the handler).
  (getAuthedUserId as any)._pendingCookies = pendingCookies;

  if (error) return null;
  return data?.user?.id ? String(data.user.id) : null;
}

async function ensureOrgMember(organisationId: string, userId: string) {
  // If membership exists, do nothing
  const { data: existing, error: e1 } = await supabaseAdmin
    .from("organisation_members")
    .select("user_id, role")
    .eq("organisation_id", organisationId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!e1 && existing?.user_id) {
    return { ok: true, role: String(existing.role || "") || null };
  }

  // Insert membership (default owner for single-tenant beta)
  const { error: e2 } = await supabaseAdmin.from("organisation_members").insert({
    organisation_id: organisationId,
    user_id: userId,
    role: "owner",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  if (e2) {
    return { ok: false, error: e2.message };
  }

  return { ok: true, role: "owner" };
}

/**
 * POST /api/onboarding/bootstrap
 * Ensures a signed-in user has an organisation + membership.
 * Returns organisationId for client bootstrapping.
 */
export async function POST(req: NextRequest) {
  try {
    const userId = await getAuthedUserId(req);
    const pendingCookies: CookieToSet[] =
      ((getAuthedUserId as any)._pendingCookies as CookieToSet[]) || [];

    if (!userId) {
      const res = NextResponse.json(
        { success: false, error: "Not signed in." },
        { status: 401 }
      );
      return res;
    }

    // Determine org
    let organisationId = forcedOrgId();
    if (!organisationId) {
      organisationId = await getFallbackOrgId();
    }

    if (!organisationId) {
      const res = NextResponse.json(
        { success: false, error: "No organisation found." },
        { status: 400 }
      );
      // apply any auth cookies anyway
      pendingCookies.forEach(({ name, value, options }) => {
        res.cookies.set(name, value, options);
      });
      return res;
    }

    // Ensure membership
    const mem = await ensureOrgMember(organisationId, userId);
    if (!mem.ok) {
      const res = NextResponse.json(
        { success: false, error: mem.error || "Failed to ensure membership." },
        { status: 500 }
      );
      pendingCookies.forEach(({ name, value, options }) => {
        res.cookies.set(name, value, options);
      });
      return res;
    }

    const res = NextResponse.json(
      { success: true, userId, organisationId, role: mem.role || null },
      { status: 200 }
    );

    // Apply any refreshed cookies
    pendingCookies.forEach(({ name, value, options }) => {
      res.cookies.set(name, value, options);
    });

    return res;
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message || "Bootstrap failed" },
      { status: 500 }
    );
  }
}
