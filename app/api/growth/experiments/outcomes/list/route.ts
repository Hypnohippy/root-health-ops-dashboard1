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

export async function POST(req: NextRequest) {
  try {
    const forcedOrg = norm(process.env.SINGLE_ORG_ID || process.env.NEXT_PUBLIC_SINGLE_ORG_ID);
    const userId = await getUserIdFromReq(req);

    if (!forcedOrg && !userId) throw new Error("Not authenticated");

    const body = await req.json().catch(() => ({}));
    const ids = Array.isArray(body?.experimentIds) ? body.experimentIds.map((x: any) => norm(x)).filter(Boolean) : [];

    if (ids.length === 0) return NextResponse.json({ success: true, items: [] }, { status: 200 });

    // In forced env: only outcomes for forced org
    let q = supabaseAdmin
      .from("growth_experiment_outcomes")
      .select("*")
      .in("experiment_id", ids)
      .order("created_at", { ascending: false })
      .limit(400);

    if (forcedOrg) q = q.eq("organisation_id", forcedOrg);

    const { data, error } = await q;
    if (error) throw new Error(error.message);

    return NextResponse.json({ success: true, items: data || [], mode: forcedOrg ? "forced_env" : "member_auth" }, { status: 200 });
  } catch (e: any) {
    const msg = e?.message || "Failed to list outcomes.";
    const status = msg === "Not authenticated" ? 401 : 500;
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}
