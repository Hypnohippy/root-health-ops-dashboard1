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

  const access = parseCookie(req, "sb-access-token") || parseCookie(req, "supabase-auth-token");
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

async function getAllowedExperimentIds(userId: string, requestedIds: string[]) {
  const ids = requestedIds.map((x) => norm(x)).filter(Boolean);
  if (!ids.length) return [];

  // Find experiments where user is a member of the org
  const { data, error } = await supabaseAdmin
    .from("growth_experiments")
    .select("id, organisation_id")
    .in("id", ids);

  if (error) throw new Error(error.message);

  const orgIds = Array.from(new Set((data || []).map((r: any) => String(r.organisation_id)))).filter(Boolean);
  if (!orgIds.length) return [];

  const { data: mem, error: memErr } = await supabaseAdmin
    .from("organisation_members")
    .select("organisation_id")
    .eq("user_id", userId)
    .in("organisation_id", orgIds);

  if (memErr) throw new Error(memErr.message);

  const allowedOrgIds = new Set((mem || []).map((m: any) => String(m.organisation_id)));
  const allowedExpIds = (data || [])
    .filter((r: any) => allowedOrgIds.has(String(r.organisation_id)))
    .map((r: any) => String(r.id));

  return allowedExpIds;
}

export async function POST(req: NextRequest) {
  try {
    const userId = await getUserIdFromReq(req);
    if (!userId) return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const experimentIds = Array.isArray(body?.experimentIds) ? body.experimentIds : [];
    const allowedIds = await getAllowedExperimentIds(userId, experimentIds);

    if (!allowedIds.length) {
      return NextResponse.json({ success: true, items: [] });
    }

    const { data, error } = await supabaseAdmin
      .from("growth_experiment_outcomes")
      .select("*")
      .in("experiment_id", allowedIds)
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);

    return NextResponse.json({ success: true, items: data || [] });
  } catch (e: any) {
    const msg = e?.message || "Failed to list outcomes.";
    const status = msg === "Not authenticated" ? 401 : 500;
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}
