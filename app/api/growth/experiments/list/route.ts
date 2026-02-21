import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

function norm(v: any) {
  return String(v ?? "").trim();
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
    const token = access.startsWith("[") ? (() => {
      try {
        const arr = JSON.parse(access);
        return Array.isArray(arr) ? String(arr[0] || "") : "";
      } catch {
        return "";
      }
    })() : access;

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

  // Prefer explicit org id (query)
  const fromQuery = norm(req.nextUrl.searchParams.get("organisationId"));

  // Optional env forced org (useful in controlled beta)
  const forced = norm(process.env.SINGLE_ORG_ID || process.env.NEXT_PUBLIC_SINGLE_ORG_ID);

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

  // Fallback: pick first org membership
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

export async function GET(req: NextRequest) {
  try {
    const { organisationId } = await requireOrgForUser(req);

    const { data, error } = await supabaseAdmin
      .from("growth_experiments")
      .select("*")
      .eq("organisation_id", organisationId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);

    return NextResponse.json({ success: true, organisationId, items: data || [] });
  } catch (e: any) {
    const msg = e?.message || "Failed to list experiments.";
    const status = msg === "Not authenticated" ? 401 : msg.includes("Not a member") ? 403 : 500;
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}
