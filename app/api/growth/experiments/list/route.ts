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
  const auth = norm(req.headers.get("authorization"));
  const bearer = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  if (bearer) {
    const { data, error } = await supabaseAdmin.auth.getUser(bearer);
    if (!error && data?.user?.id) return data.user.id;
  }

  const access =
    parseCookie(req, "sb-access-token") ||
    parseCookie(req, "supabase-auth-token") ||
    parseCookie(req, "sb:token");

  if (access) {
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

async function getOrgContext(req: NextRequest) {
  const forced = norm(process.env.SINGLE_ORG_ID || process.env.NEXT_PUBLIC_SINGLE_ORG_ID);
  const userId = await getUserIdFromReq(req);

  if (!forced) {
    if (!userId) throw new Error("Not authenticated");

    const { data: memberships, error } = await supabaseAdmin
      .from("organisation_members")
      .select("organisation_id, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: true })
      .limit(1);

    if (error) throw new Error(error.message);

    const orgId = memberships?.[0]?.organisation_id ? String(memberships[0].organisation_id) : null;
    if (!orgId) throw new Error("No organisation membership found");

    return { organisationId: orgId, userId, mode: "member_auth" as const };
  }

  return { organisationId: forced, userId: userId || "anon", mode: "forced_env" as const };
}

export async function GET(req: NextRequest) {
  try {
    const ctx = await getOrgContext(req);

    const { data, error } = await supabaseAdmin
      .from("growth_experiments")
      .select("*")
      .eq("organisation_id", ctx.organisationId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(120);

    if (error) throw new Error(error.message);

    return NextResponse.json({ success: true, organisationId: ctx.organisationId, items: data || [], mode: ctx.mode }, { status: 200 });
  } catch (e: any) {
    const msg = e?.message || "Failed to list experiments.";
    const status = msg === "Not authenticated" ? 401 : 500;
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}
